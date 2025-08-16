// ===================== Imports =====================
import * as Const from '../common/constants.js';
import * as Logger from '../common/logger.js';
import * as Preferences from '../common/prefs.js';
import * as State from '../common/state.js';
import * as SessionManager from '../common/session-manager.js';

import * as Suspension from '../suspension/suspension.js';

import * as Scheduling from './scheduling.js';

// ===================== Constants and Global State =====================

// Ensure global lock is available
if (typeof globalThis.isBulkOpRunning === 'undefined') {
    globalThis.isBulkOpRunning = false;
}

// Global state for favicon refresh
if (typeof globalThis.isFaviconRefreshRunning === 'undefined') {
    globalThis.isFaviconRefreshRunning = false;
}

// Helper: broadcast favicon refresh progress
function broadcastFaviconRefreshProgress(isRunning) {
    chrome.runtime.sendMessage({
        type: isRunning ? Const.MSG_FAVICON_REFRESH_PROGRESS : Const.MSG_FAVICON_REFRESH_DONE
    });
}

// ===================== Utility/Helper Functions =====================
//+reviewed
function validateMessageSender(sender, requiresExtensionOrigin = true) {
    if (requiresExtensionOrigin) {
        // Allow extension pages (popup, options, etc.) regardless of sender.tab
        return sender.id === chrome.runtime.id &&
            sender.url &&
            sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
    } else {
        // Message from content script
        return sender.tab && typeof sender.tab.id === 'number';
    }
}

//+reviewed
async function notifyAllTabsPrefsChanged() {
    try {
        const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
        for (const tab of tabs) {
            if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
                chrome.tabs.sendMessage(tab.id, { type: Const.MSG_PREFS_CHANGED, prefs: Preferences.prefs })
                    .catch(e => {
                        if (!e.message?.includes("Receiving end does not exist")) {
                            Logger.logError(`notifyAllTabsPrefsChanged: Error sending to tab ${tab.id}`, e, Logger.LogComponent.BACKGROUND);
                        }
                    });
            }
        }
        Logger.detailedLog("Sent prefsChanged to all relevant tabs.", Logger.LogComponent.BACKGROUND);
    } catch (error) {
        Logger.logError("Error in notifyAllTabsPrefsChanged", error, Logger.LogComponent.BACKGROUND);
    }
}

// Helper: batched reload for suspended tabs to refresh favicons CPU-friendly
async function reloadSuspendedTabsBatched(tabs, batchSize = 10, perTabDelayMs = 200, batchDelayMs = 1200) {
    const total = tabs.length;
    let processed = 0;
    for (let i = 0; i < total; i += batchSize) {
        const batch = tabs.slice(i, i + batchSize);
        for (const tab of batch) {
            if (tab.id) {
                try { await chrome.tabs.reload(tab.id, { bypassCache: true }); } catch { }
                processed++;
                if (perTabDelayMs > 0) {
                    await new Promise(r => setTimeout(r, perTabDelayMs));
                }
            }
        }
        if (i + batchSize < total && batchDelayMs > 0) {
            await new Promise(r => setTimeout(r, batchDelayMs));
        }
    }
    return processed;
}

// ===================== Core Logic =====================
function handleMessage(request, sender, sendResponse) {
    if (!request || !request.type) {
        Logger.logError("handleMessage", "Invalid request object", Logger.LogComponent.BACKGROUND, request);
        sendResponse({ error: "Invalid request" });
        return false;
    }

    // Handle IS_BULK_OP_RUNNING directly (always available)
    if (request.type === 'IS_BULK_OP_RUNNING') {
        sendResponse({ running: globalThis.isBulkOpRunning });
        return false;
    }

    const context = `handleMessage(${request.type})`;
    Logger.detailedLog(`${context}: Received message from ${sender.tab ? 'tab ' + sender.tab.id : 'extension'}`, Logger.LogComponent.BACKGROUND, request);

    // Extension initializes immediately, no need for initialization checks

    // Handle commands based on their permission requirements
    switch (request.type) {
        case Const.MSG_SAVE_SETTINGS:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                Logger.logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, Logger.LogComponent.BACKGROUND);
                return false;
            }

            // Handle async operation
            handleAsyncMessage(context, async () => {
                if (!request.settings || typeof request.settings !== 'object') {
                    return { error: "Invalid settings: Expected an object" };
                }

                const newSettings = { ...Preferences.defaultPrefs, ...request.settings };
                const oldSuspendAfter = Preferences.prefs.suspendAfter;
                const oldUnsavedFormHandling = Preferences.prefs.unsavedFormHandling;

                await Preferences.savePrefs(newSettings);
                Logger.log("Settings saved successfully via saveSettings message", Logger.LogComponent.BACKGROUND);

                if (Preferences.prefs.suspendAfter !== oldSuspendAfter || Preferences.prefs.unsavedFormHandling !== oldUnsavedFormHandling) {
                    Logger.detailedLog("Relevant settings changed, rescheduling all tabs.", Logger.LogComponent.BACKGROUND);
                    // Use alarm-backed debounce so reschedule survives worker restarts
                    Scheduling.debouncedScheduleAllTabsAlarmBacked();
                }
                // Notify content scripts if unsavedFormHandling changed
                if (Preferences.prefs.unsavedFormHandling !== oldUnsavedFormHandling) {
                    await notifyAllTabsPrefsChanged();
                }

                return { success: true };
            }, sendResponse);
            return true;

        case Const.MSG_SAVE_WHITELIST:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                Logger.logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, Logger.LogComponent.BACKGROUND);
                return false;
            }

            // Handle async operation
            handleAsyncMessage(context, async () => {
                if (!request.newWhitelist || !Array.isArray(request.newWhitelist)) {
                    return { error: "Invalid whitelist: Expected an array" };
                }
                await Preferences.saveWhitelist(request.newWhitelist);
                Logger.log("Whitelist saved successfully via saveWhitelist message", Logger.LogComponent.BACKGROUND);
                Scheduling.debouncedScheduleAllTabsAlarmBacked();
                return { success: true };
            }, sendResponse);
            return true;

        case Const.MSG_PREFS_CHANGED:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                Logger.logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, Logger.LogComponent.BACKGROUND);
                return false;
            }

            // Handle async operation
            handleAsyncMessage(context, async () => {
                await Scheduling.scheduleAllTabs();
                await rescheduleSessionAutoSave();
                return { success: true };
            }, sendResponse);
            return true;

        case Const.MSG_SUSPEND_TAB:
            // Allow from extension pages OR from content scripts with a valid tab context
            const isExtensionPage = validateMessageSender(sender, true);
            const isContentScript = sender.tab && sender.tab.id;
            if (!isExtensionPage && !isContentScript) {
                sendResponse({ error: "Permission denied" });
                Logger.logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, Logger.LogComponent.BACKGROUND);
                return false;
            }

            const receivedTabId = request.tabId;
            const senderTabId = sender.tab && sender.tab.id;
            const tabIdToUse = receivedTabId || senderTabId;
            const isManual = !!request.isManual;

            if (tabIdToUse) {
                // Handle async operation
                handleAsyncMessage(`suspendTab(id=${tabIdToUse}, manual=${isManual})`, async () => {
                    const result = await Suspension.suspendTab(tabIdToUse, isManual);
                    return { success: result };
                }, sendResponse);
                return true;
            } else {
                Logger.logError(context, "Missing tabId for suspension. request.tabId and sender.tab.id were both missing.", Logger.LogComponent.BACKGROUND);
                sendResponse({ error: "Missing tabId for suspension: request.tabId and sender.tab.id were both unavailable." });
                return false;
            }

        case Const.MSG_UNSUSPEND_TAB:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                Logger.logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, Logger.LogComponent.BACKGROUND);
                return false;
            }

            if (request.tabId) {
                // Handle async operation
                handleAsyncMessage(`unsuspendTab(${request.tabId})`, async () => {
                    const result = await Suspension.unsuspendTab(request.tabId, !!request.shouldFocus);
                    return { success: result };
                }, sendResponse);
                return true;
            } else {
                sendResponse({ error: "Missing tabId" });
                return false;
            }

        case Const.MSG_SUSPEND_ALL_TABS_IN_WINDOW:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                Logger.logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, Logger.LogComponent.BACKGROUND);
                return false;
            }

            // Handle async operation
            handleAsyncMessage(Const.MSG_SUSPEND_ALL_TABS_IN_WINDOW, async () => {
                let windowId;
                if (request.windowId) {
                    windowId = request.windowId;
                } else if (sender.tab && sender.tab.windowId) {
                    windowId = sender.tab.windowId;
                } else {
                    const currentWindow = await chrome.windows.getCurrent();
                    windowId = currentWindow.id;
                }
                await Suspension.suspendAllTabsInWindow(windowId, true);
                return { success: true };
            }, sendResponse);
            return true;

        case Const.MSG_UNSUSPEND_ALL_TABS_IN_WINDOW:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                Logger.logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, Logger.LogComponent.BACKGROUND);
                return false;
            }

            // Handle async operation
            handleAsyncMessage(Const.MSG_UNSUSPEND_ALL_TABS_IN_WINDOW, async () => {
                let windowId;
                if (request.windowId) {
                    windowId = request.windowId;
                } else if (sender.tab && sender.tab.windowId) {
                    windowId = sender.tab.windowId;
                } else {
                    const currentWindow = await chrome.windows.getCurrent();
                    windowId = currentWindow.id;
                }
                await Suspension.unsuspendAllTabsInWindow(windowId);
                return { success: true };
            }, sendResponse);
            return true;

        case Const.MSG_SUSPEND_ALL_TABS_ALL_SPECS:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                Logger.logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, Logger.LogComponent.BACKGROUND);
                return false;
            }

            // Handle async operation
            handleAsyncMessage(Const.MSG_SUSPEND_ALL_TABS_ALL_SPECS, async () => {
                await Suspension.suspendAllTabsAllSpecs(true); // isManual = true
                return { success: true };
            }, sendResponse);
            return true;

        case Const.MSG_UNSUSPEND_ALL_TABS_ALL_SPECS:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                Logger.logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, Logger.LogComponent.BACKGROUND);
                return false;
            }

            // Handle async operation
            handleAsyncMessage(Const.MSG_UNSUSPEND_ALL_TABS_ALL_SPECS, async () => {
                await Suspension.unsuspendAllTabsAllSpecs();
                return { success: true };
            }, sendResponse);
            return true;

        default:
            // Utility/admin messages for Tools
            if (request.type === Const.MSG_CLEAR_FAVICON_CACHE) {
                handleAsyncMessage(context, async () => {
                    try {
                        await chrome.storage.local.set({ TS_favicon_cache_v1: {} });
                        return { success: true };
                    } catch (e) {
                        return { error: e.message };
                    }
                }, sendResponse);
                return true;
            }
            if (request.type === Const.MSG_REFRESH_ALL_SUSPENDED_FAVICONS) {
                handleAsyncMessage(context, async () => {
                    if (globalThis.isFaviconRefreshRunning) {
                        return { success: false, error: 'Favicon refresh already running' };
                    }
                    globalThis.isFaviconRefreshRunning = true;
                    broadcastFaviconRefreshProgress(true);
                    const suspendedPrefix = chrome.runtime.getURL(Const.SUSPENDED_PAGE_PATH);
                    const tabs = await chrome.tabs.query({ url: suspendedPrefix + '*' });
                    const batchSize = Number.isFinite(request?.batchSize) ? request.batchSize : 10;
                    const perTabDelayMs = Number.isFinite(request?.perTabDelayMs) ? request.perTabDelayMs : 200;
                    const batchDelayMs = Number.isFinite(request?.batchDelayMs) ? request.batchDelayMs : 1200;
                    const count = await reloadSuspendedTabsBatched(tabs, batchSize, perTabDelayMs, batchDelayMs);
                    globalThis.isFaviconRefreshRunning = false;
                    broadcastFaviconRefreshProgress(false);
                    return { success: true, count, total: tabs.length };
                }, sendResponse);
                return true;
            }
            if (request.type === Const.MSG_GET_EXTENSION_STATS) {
                handleAsyncMessage(context, async () => {
                    const allTabs = await chrome.tabs.query({});
                    const suspendedPrefix = chrome.runtime.getURL(Const.SUSPENDED_PAGE_PATH);
                    let total = 0, suspended = 0, scheduled = 0, skipped = 0;
                    total = allTabs.length;
                    suspended = allTabs.filter(t => t.url && t.url.startsWith(suspendedPrefix)).length;
                    // Approximate scheduled count from internal scheduling map
                    const scheduledInfo = await Scheduling.getSchedulingSnapshot();
                    scheduled = scheduledInfo.size || 0;
                    // Calculate skipped using the same logic as the Skipped Tabs page
                    let skippedCount = 0;
                    for (const tab of allTabs) {
                        if (tab.url && tab.url.startsWith(suspendedPrefix)) continue;
                        const isScheduled = scheduledInfo.entries.some(e => e.tabId === tab.id);
                        if (isScheduled) continue;
                        const skipReason = await Suspension.shouldSkipTabForScheduling(tab, true);
                        if (skipReason) skippedCount++;
                    }
                    skipped = skippedCount;
                    return { success: true, total, suspended, scheduled, skipped };
                }, sendResponse);
                return true;
            }
            if (request.type === Const.MSG_GET_SKIPPED_TABS) {
                handleAsyncMessage(context, async () => {
                    const tabs = await chrome.tabs.query({}); // Query all tabs, not just http(s)
                    const suspendedPrefix = chrome.runtime.getURL(Const.SUSPENDED_PAGE_PATH);
                    const scheduledInfo = await Scheduling.getSchedulingSnapshot();
                    const skippedTabs = [];
                    for (const tab of tabs) {
                        if (!tab.id) continue;
                        if (tab.url && tab.url.startsWith(suspendedPrefix)) continue;
                        const isScheduled = scheduledInfo.entries.some(e => e.tabId === tab.id);
                        if (isScheduled) continue;
                        const skipReason = await Suspension.shouldSkipTabForScheduling(tab, true);
                        if (skipReason) {
                            skippedTabs.push({
                                tabId: tab.id,
                                title: tab.title,
                                url: tab.url,
                                reason: skipReason
                            });
                        }
                    }
                    return { success: true, skippedTabs };
                }, sendResponse);
                return true;
            }
            Logger.log(`${context}: Unknown message type received`, Logger.LogComponent.BACKGROUND);
            sendResponse({ error: "Unknown message type" });
            return false;
    }
}

// Helper function to handle async messages properly
function handleAsyncMessage(context, asyncFunction, sendResponse) {
    asyncFunction()
        .then(result => {
            sendResponse(result);
        })
        .catch(error => {
            Logger.logError(context, error, Logger.LogComponent.BACKGROUND);
            sendResponse({ error: error.message || "Unknown error" });
        });
}

export function handleTabCreated(tab) {
    if (!tab || !tab.id) return;

    Logger.detailedLog(`Tab created: ${tab.id}, ${tab.url || 'no URL'}`, Logger.LogComponent.BACKGROUND);

    // Schedule the tab for potential suspension
    Scheduling.scheduleTab(tab.id, tab);
}

export function handleTabUpdated(tabId, changeInfo, tab) {
    if (!tabId || !tab) return;

    Logger.detailedLog(`Tab ${tabId} updated (${tab.title || 'no title'}): ${JSON.stringify(changeInfo)}`, Logger.LogComponent.BACKGROUND);

    // Only act on critical changes that might affect suspension
    const criticalChanges =
        // URL changes require rescheduling as whitelist status may change
        changeInfo.url !== undefined ||
        // Audio state changes affect neverSuspendAudio setting
        changeInfo.audible !== undefined ||
        // Pinned state changes affect neverSuspendPinned setting
        changeInfo.pinned !== undefined;

    // Only reschedule on 'complete' status if it's the first load after a URL change
    const isInitialComplete = changeInfo.status === 'complete';

    if (criticalChanges || isInitialComplete) {
        // Include the full tab object for efficiency
        Scheduling.scheduleTab(tabId, tab);
    }
}

export function handleTabRemoved(tabId, removeInfo) {
    Logger.detailedLog(`Tab removed: ${tabId}, window: ${removeInfo.windowId}, isWindowClosing: ${removeInfo.isWindowClosing}`, Logger.LogComponent.BACKGROUND);

    // Clean up the tab suspension time entry to prevent memory leaks
    Scheduling.removeTabSuspendTime(tabId);

    // If this tab was the active tab for its window, update the activeTabsByWindow Map
    Logger.withErrorHandling(
        `handleTabRemoved(${tabId})`,
        async () => {
            try {
                const windowId = removeInfo.windowId;
                if (!removeInfo.isWindowClosing) {  // Skip this if the window is closing (window removal will handle it)
                    const activeTabInWindow = State.getActiveTabForWindow(windowId);
                    if (activeTabInWindow === tabId) {
                        try {
                            const activeTabs = await chrome.tabs.query({ active: true, windowId });
                            if (activeTabs && activeTabs.length > 0) {
                                State.setActiveTabForWindow(windowId, activeTabs[0].id);
                                Logger.detailedLog(`Updated active tab for window ${windowId} to ${activeTabs[0].id}`, Logger.LogComponent.BACKGROUND);
                            } else {
                                Logger.detailedLog(`Removed active tab tracking for window ${windowId} (no active tabs found)`, Logger.LogComponent.BACKGROUND);
                            }
                        } catch (e) {
                            Logger.detailedLog(`Could not query for new active tab in window ${windowId}: ${e.message}`, Logger.LogComponent.BACKGROUND);
                        }
                    }
                }
            } catch (e) {
                Logger.logError(`Error in handleTabRemoved: ${e.message}`, Logger.LogComponent.BACKGROUND);
            }
        }
    );
}

export function handleTabActivated(activeInfo) {
    const { tabId, windowId } = activeInfo;
    Logger.log(`Tab ${tabId} activated in window ${windowId}`, Logger.LogComponent.BACKGROUND);

    Logger.withErrorHandling(
        `handleTabActivated(${tabId}, ${windowId})`,
        async () => {
            try {
                // Get the previous active tab for this window before updating
                const previousActiveTabId = State.getActiveTabForWindow(windowId);

                // Store this tab as the active one for its window
                State.setActiveTabForWindow(windowId, tabId);

                // Check if this window is currently focused
                let isFocusedWindow = false;
                try {
                    const window = await chrome.windows.get(windowId);
                    if (!window) {
                        Logger.logWarning(`Window ${windowId} not found during tab activation.`, Logger.LogComponent.BACKGROUND);
                        return;
                    }
                    isFocusedWindow = window.focused;
                } catch (e) {
                    Logger.log(`Error checking window focus state: ${e.message}`, Logger.LogComponent.BACKGROUND);
                    // Default to true for the last focused window as a fallback
                    isFocusedWindow = (windowId === State.getLastFocusedWindow());
                }

                // If this tab activation is in the focused window or should be protected due to last-window setting
                if (isFocusedWindow || (Preferences.prefs.neverSuspendLastWindow && windowId === State.getLastFocusedWindow())) {
                    // Unschedule suspension for the newly activated tab
                    await Scheduling.unscheduleTab(tabId);

                    if (isFocusedWindow) {
                        // Update last focused window tracking
                        State.updateLastFocusedWindow(windowId);
                    }
                }

                // Schedule the previous active tab in this window if it exists
                if (previousActiveTabId && previousActiveTabId !== tabId) {
                    try {
                        const previousTab = await chrome.tabs.get(previousActiveTabId);
                        if (!previousTab) {
                            Logger.logWarning(`Previous active tab ${previousActiveTabId} not found during tab activation.`, Logger.LogComponent.BACKGROUND);
                            return;
                        }
                        // Only reschedule if the tab still exists and isn't suspended
                        if (previousTab && !previousTab.url.startsWith(chrome.runtime.getURL("suspended.html"))) {
                            await Scheduling.scheduleTab(previousActiveTabId, previousTab);
                            Logger.detailedLog(`Rescheduled previous active tab ${previousActiveTabId}`, Logger.LogComponent.BACKGROUND);
                        }
                    } catch (e) {
                        // Tab might not exist anymore, ignore
                        if (!e.message?.includes("No tab with id")) {
                            Logger.logError(`Error rescheduling previous tab: ${e.message}`, Logger.LogComponent.BACKGROUND);
                        }
                    }
                }
            } catch (error) {
                Logger.logError(`Error processing tab activation: ${error.message}`, Logger.LogComponent.BACKGROUND);
            }
        }
    );
}

export function handleWindowFocusChanged(windowId) {
    Logger.log(`Window focus changed to: ${windowId}`, Logger.LogComponent.BACKGROUND);

    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Focus moved away from Chrome entirely
        Logger.log("Focus left Chrome - this won't affect suspension status", Logger.LogComponent.BACKGROUND);
        return;
    }

    // Update last focused window tracking
    const previousFocusedWindow = State.getLastFocusedWindow();
    State.updateLastFocusedWindow(windowId);

    Logger.withErrorHandling(
        `handleWindowFocusChanged(${windowId})`,
        async () => {
            try {
                // Get the active tab in the newly focused window
                const activeTabs = await chrome.tabs.query({ active: true, windowId });
                if (!activeTabs || activeTabs.length === 0) {
                    Logger.log(`No active tab found in window ${windowId}`, Logger.LogComponent.BACKGROUND);
                    return;
                }

                const activeTab = activeTabs[0];
                if (!activeTab || !activeTab.id) {
                    Logger.log(`Invalid active tab in window ${windowId}`, Logger.LogComponent.BACKGROUND);
                    return;
                }

                Logger.log(`Active tab in newly focused window ${windowId} is ${activeTab.id} (${activeTab.title || 'unknown title'})`, Logger.LogComponent.BACKGROUND);

                // Store active tab info
                State.setActiveTabForWindow(windowId, activeTab.id);

                // Unschedule this active tab as it's now the active tab in the focused window
                await Scheduling.unscheduleTab(activeTab.id);

                // When window focus changes, we need to properly handle the scheduling based on preferences
                if (Preferences.prefs.neverSuspendLastWindow && previousFocusedWindow !== chrome.windows.WINDOW_ID_NONE) {
                    // Reschedule all tabs in all windows except the active tab in current window
                    const allWindows = await chrome.windows.getAll();
                    if (!allWindows || allWindows.length === 0) {
                        Logger.logWarning('No windows found during window focus change.', Logger.LogComponent.BACKGROUND);
                        return;
                    }
                    for (const window of allWindows) {
                        // Skip the currently focused window's active tab
                        if (window.id === windowId) continue;

                        // Get the active tab in this window
                        const tabs = await chrome.tabs.query({ active: true, windowId: window.id });
                        if (tabs && tabs.length > 0 && tabs[0].id) {
                            // Only schedule this tab if it's not already suspended
                            if (!tabs[0].url.startsWith(chrome.runtime.getURL("suspended.html"))) {
                                await Scheduling.scheduleTab(tabs[0].id, tabs[0]);
                                Logger.detailedLog(`Scheduled active tab ${tabs[0].id} in window ${window.id} after focus change`, Logger.LogComponent.BACKGROUND);
                            }
                        }
                    }
                }
            } catch (error) {
                Logger.logError(`Error processing window focus change: ${error.message}`, Logger.LogComponent.BACKGROUND);
            }
        }
    );
}

export function handleAlarmEvent(alarm) {
    if (!alarm || !alarm.name) return;

    // Handle different types of alarms
    if (alarm.name === Const.TS_TAB_SCAN_ALARM_NAME) {
        // Handle tab scan alarm
        Logger.withErrorHandling(Const.TS_TAB_SCAN_ALARM_NAME, async () => {
            await Scheduling.scanTabsForSuspension();
        }, Logger.LogComponent.BACKGROUND);
    } else if (alarm.name === Const.TS_ALARM_CLEANUP_NAME) {
        // Handle alarm cleanup
        Logger.withErrorHandling(Const.TS_ALARM_CLEANUP_NAME, async () => {
            Logger.log('Performing periodic cleanup tasks (if any defined)...', Logger.LogComponent.BACKGROUND);
        }, Logger.LogComponent.BACKGROUND);
    } else if (alarm.name === Const.TS_STATE_CLEANUP_NAME) {
        // Handle state reference cleanup
        Logger.withErrorHandling(Const.TS_STATE_CLEANUP_NAME, async () => {
            Logger.log('Cleaning up state references...', Logger.LogComponent.BACKGROUND);
            // Call background's cleanupStateReferences function
            await State.cleanupStateReferences();
        }, Logger.LogComponent.BACKGROUND);
    } else if (alarm.name === Const.TS_SESSION_FREQUENT_SAVE) {
        // Handle frequent session backup (configurable frequency)
        Logger.withErrorHandling(Const.TS_SESSION_FREQUENT_SAVE, async () => {
            const autoSaveEnabled = await SessionManager.getAutoSaveEnabled();
            if (autoSaveEnabled) {
                Logger.detailedLog('Performing automatic session save...', Logger.LogComponent.BACKGROUND);
                await SessionManager.saveCurrentSession(null, true);
                Logger.detailedLog('Automatic session save completed', Logger.LogComponent.BACKGROUND);
            }
        }, Logger.LogComponent.BACKGROUND);
    }
}

export function handleWindowCreation(window) {
    Logger.detailedLog(`Window created: ${window.id}`, Logger.LogComponent.BACKGROUND);
    // Implement window creation logic if needed
}

export function handleWindowRemoval(windowId) {
    Logger.detailedLog(`Window removed: ${windowId}`, Logger.LogComponent.BACKGROUND);

    // Clean up any state related to this window
    Logger.withErrorHandling(
        `handleWindowRemoval(${windowId})`,
        async () => {
            try {
                State.removeWindowTracking(windowId);
                if (State.getLastFocusedWindow() === windowId) {
                    const windows = await chrome.windows.getAll();
                    if (!windows || windows.length === 0) {
                        State.updateLastFocusedWindow(chrome.windows.WINDOW_ID_NONE);
                        Logger.logWarning('No windows found after window removal. Set last focused window to NONE.', Logger.LogComponent.BACKGROUND);
                    } else {
                        const focusedWindows = windows.filter(win => win.focused);
                        if (focusedWindows.length > 0) {
                            State.updateLastFocusedWindow(focusedWindows[0].id);
                        } else {
                            // Pick the first window that isn't the one being removed, or set to NONE
                            const nextWindow = windows.find(win => win.id !== windowId);
                            if (nextWindow) {
                                State.updateLastFocusedWindow(nextWindow.id);
                            } else {
                                State.updateLastFocusedWindow(chrome.windows.WINDOW_ID_NONE);
                            }
                        }
                    }
                }
                // No need to clean up alarms for tabs in this window; handled by tab removal
            } catch (e) {
                Logger.logError(`Error in handleWindowRemoval: ${e.message}`, Logger.LogComponent.BACKGROUND);
            }
        }
    );
}

export function handleStartup() {
    Logger.log("Browser startup detected", Logger.LogComponent.BACKGROUND);
    // Schedule all tabs on startup
    Scheduling.scheduleAllTabs().catch(error => {
        Logger.logError("handleStartup", error, Logger.LogComponent.BACKGROUND);
    });
}

export function handleCommand(command) {
    Logger.log(`Keyboard command received: ${command}`, Logger.LogComponent.BACKGROUND);

    Logger.withErrorHandling(
        `handleCommand(${command})`,
        async () => {
            try {
                // Get the current active tab
                const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
                const activeTab = activeTabs[0];

                switch (command) {
                    case 'suspend-current-tab':
                        if (activeTab && activeTab.id) {
                            await Suspension.suspendTab(activeTab.id, true);
                            Logger.log(`Suspended current tab ${activeTab.id} via keyboard shortcut`, Logger.LogComponent.BACKGROUND);
                        }
                        break;

                    case 'unsuspend-current-tab':
                        if (activeTab && activeTab.id) {
                            await Suspension.unsuspendTab(activeTab.id);
                            Logger.log(`Unsuspended current tab ${activeTab.id} via keyboard shortcut`, Logger.LogComponent.BACKGROUND);
                        }
                        break;

                    case 'suspend-all-window':
                        if (activeTab && activeTab.windowId) {
                            await Suspension.suspendAllTabsInWindow(activeTab.windowId, true);
                            Logger.log(`Suspended all tabs in window ${activeTab.windowId} via keyboard shortcut`, Logger.LogComponent.BACKGROUND);
                        }
                        break;

                    case 'unsuspend-all-window':
                        if (activeTab && activeTab.windowId) {
                            await Suspension.unsuspendAllTabsInWindow(activeTab.windowId);
                            Logger.log(`Unsuspended all tabs in window ${activeTab.windowId} via keyboard shortcut`, Logger.LogComponent.BACKGROUND);
                        }
                        break;

                    case 'suspend-all-tabs':
                        await Suspension.suspendAllTabsAllSpecs(true);
                        Logger.log(`Suspended all tabs in all windows via keyboard shortcut`, Logger.LogComponent.BACKGROUND);
                        break;

                    case 'unsuspend-all-tabs':
                        await Suspension.unsuspendAllTabsAllSpecs();
                        Logger.log(`Unsuspended all tabs in all windows via keyboard shortcut`, Logger.LogComponent.BACKGROUND);
                        break;

                    case 'open-settings':
                        await chrome.tabs.create({
                            url: chrome.runtime.getURL('options.html')
                        });
                        Logger.log(`Opened settings page via keyboard shortcut`, Logger.LogComponent.BACKGROUND);
                        break;

                    default:
                        Logger.log(`Unknown command: ${command}`, Logger.LogComponent.BACKGROUND);
                        break;
                }
            } catch (error) {
                Logger.logError(`Error executing command ${command}`, error, Logger.LogComponent.BACKGROUND);
            }
        }
    );
}

// ===================== Exported Functions =====================
//+reviewed
export function initListeners() {
    // Clear any existing non-message listeners (message handler is already set up in background.js)
    try {
        chrome.tabs.onCreated.removeListener(handleTabCreated);
        chrome.tabs.onUpdated.removeListener(handleTabUpdated);
        chrome.tabs.onRemoved.removeListener(handleTabRemoved);
        chrome.tabs.onActivated.removeListener(handleTabActivated);
        chrome.windows.onFocusChanged.removeListener(handleWindowFocusChanged);
        chrome.commands.onCommand.removeListener(handleCommand);
    } catch (e) {
        // Ignore errors during cleanup
    }

    // Set up all listeners except message handler (which is already set up in background.js)
    chrome.tabs.onCreated.addListener(handleTabCreated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);
    chrome.commands.onCommand.addListener(handleCommand);

    Logger.log("All event listeners initialized (message handler was set up earlier in background.js)", Logger.LogComponent.BACKGROUND);
}

// ===================== Session Auto-Save Management =====================
/**
 * Reschedule the session auto-save alarm with updated frequency
 * Called when session preferences are changed
 */
async function rescheduleSessionAutoSave() {
    try {
        // Clear existing alarm
        const wasCleared = await chrome.alarms.clear(Const.TS_SESSION_FREQUENT_SAVE);
        Logger.log(`Session auto-save alarm cleared: ${wasCleared}`, Logger.LogComponent.BACKGROUND);

        // Create new alarm with updated frequency
        // Read from storage to get the latest value
        const result = await chrome.storage.local.get([Preferences.PREFS_KEY]);
        const currentPrefs = { ...Preferences.defaultPrefs, ...(result[Preferences.PREFS_KEY] || {}) };
        const saveFrequency = currentPrefs.sessionAutoSaveFrequency || 5;
        await chrome.alarms.create(Const.TS_SESSION_FREQUENT_SAVE, { periodInMinutes: saveFrequency });

        Logger.log(`Session auto-save rescheduled for every ${saveFrequency} minutes`, Logger.LogComponent.BACKGROUND);

        // Debug: Check all alarms
        const allAlarms = await chrome.alarms.getAll();
        const sessionAlarms = allAlarms.filter(a => a.name.includes('SESSION'));
        Logger.log(`All session-related alarms: ${JSON.stringify(sessionAlarms)}`, Logger.LogComponent.BACKGROUND);
    } catch (error) {
        Logger.logError("Error rescheduling session auto-save alarm", error, Logger.LogComponent.BACKGROUND);
    }
}

export { handleMessage };

