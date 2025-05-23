// ===================== Imports =====================
import { log, detailedLog, logError, withErrorHandling, safeClearAlarm, LogComponent } from './logger.js';
import { prefs, defaultPrefs, savePrefs, whitelist, saveWhitelist } from './prefs.js';
import * as State from './state.js';
import { scheduleTab, scheduleAllTabs, unscheduleTab, debouncedScheduleAllTabs, scanTabsForSuspension, removeTabSuspendTime } from './scheduling.js';
import { suspendTab, unsuspendTab, suspendAllTabsInWindow, unsuspendAllTabsInWindow, suspendAllTabsAllSpecs, unsuspendAllTabsAllSpecs } from './suspension.js';
import * as Const from './constants.js';

// ===================== Constants and Global State =====================

// Ensure global lock is available
if (typeof globalThis.isBulkOpRunning === 'undefined') {
    globalThis.isBulkOpRunning = false;
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
                chrome.tabs.sendMessage(tab.id, { type: Const.MSG_PREFS_CHANGED, prefs: prefs })
                    .catch(e => {
                        if (!e.message?.includes("Receiving end does not exist")) {
                            logError(`notifyAllTabsPrefsChanged: Error sending to tab ${tab.id}`, e, LogComponent.BACKGROUND);
                        }
                    });
            }
        }
        detailedLog("Sent prefsChanged to all relevant tabs.", LogComponent.BACKGROUND);
    } catch (error) {
        logError("Error in notifyAllTabsPrefsChanged", error, LogComponent.BACKGROUND);
    }
}

// ===================== Core Logic =====================
export function handleMessage(request, sender, sendResponse) {
    if (!request || !request.type) {
        logError("handleMessage", "Invalid request object", LogComponent.BACKGROUND, request);
        sendResponse({ error: "Invalid request" });
        return false;
    }

    // Handle IS_BULK_OP_RUNNING directly
    if (request.type === 'IS_BULK_OP_RUNNING') {
        sendResponse({ running: globalThis.isBulkOpRunning });
        return true;
    }

    const context = `handleMessage(${request.type})`;
    detailedLog(`${context}: Received message from ${sender.tab ? 'tab ' + sender.tab.id : 'extension'}`, LogComponent.BACKGROUND, request);

    // Handle commands based on their permission requirements
    switch (request.type) {
        // All other operations require extension origin
        case Const.MSG_SAVE_SETTINGS:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, LogComponent.BACKGROUND);
                return true;
            }

            try {
                if (!request.settings || typeof request.settings !== 'object') {
                    sendResponse({ error: "Invalid settings: Expected an object" });
                    return false;
                }

                const newSettings = { ...defaultPrefs, ...request.settings };

                const oldSuspendAfter = prefs.suspendAfter;
                const oldUnsavedFormHandling = prefs.unsavedFormHandling;

                savePrefs(newSettings).then(() => {
                    log("Settings saved successfully via saveSettings message", LogComponent.BACKGROUND);
                    sendResponse({ success: true });

                    if (prefs.suspendAfter !== oldSuspendAfter || prefs.unsavedFormHandling !== oldUnsavedFormHandling) {
                        detailedLog("Relevant settings changed, rescheduling all tabs.", LogComponent.BACKGROUND);
                        debouncedScheduleAllTabs();
                    }
                    // Notify content scripts if unsavedFormHandling changed
                    if (prefs.unsavedFormHandling !== oldUnsavedFormHandling) {
                        notifyAllTabsPrefsChanged();
                    }
                }).catch(error => {
                    logError(context, error, LogComponent.BACKGROUND);
                    sendResponse({ error: error.message || "Failed to save settings" });
                });
                return true; // Indicates that sendResponse will be called asynchronously.
            } catch (e) {
                logError(context, e, LogComponent.BACKGROUND);
                sendResponse({ error: e.message || "Server error during saveSettings" });
                return false;
            }

        case Const.MSG_SAVE_WHITELIST:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, LogComponent.BACKGROUND);
                return true;
            }

            try {
                if (!request.newWhitelist || !Array.isArray(request.newWhitelist)) {
                    sendResponse({ error: "Invalid whitelist: Expected an array" });
                    return false;
                }
                saveWhitelist(request.newWhitelist).then(() => {
                    log("Whitelist saved successfully via saveWhitelist message", LogComponent.BACKGROUND);
                    debouncedScheduleAllTabs();
                    sendResponse({ success: true });
                }).catch(error => {
                    logError(context, error, LogComponent.BACKGROUND);
                    sendResponse({ error: error.message || "Failed to save whitelist" });
                });
                return true;
            } catch (e) {
                logError(context, e, LogComponent.BACKGROUND);
                sendResponse({ error: e.message || "Server error during saveWhitelist" });
                return false;
            }

        case Const.MSG_SUSPEND_TAB:
            // Allow from extension pages OR from content scripts with a valid tab context
            const isExtensionPage = validateMessageSender(sender, true);
            const isContentScript = sender.tab && sender.tab.id;
            if (!isExtensionPage && !isContentScript) {
                sendResponse({ error: "Permission denied" });
                logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, LogComponent.BACKGROUND);
                return true;
            }

            const receivedTabId = request.tabId;
            const senderTabId = sender.tab && sender.tab.id;
            const tabIdToUse = receivedTabId || senderTabId;
            const isManual = !!request.isManual;

            detailedLog(`${context}: Received request.tabId: ${receivedTabId}, sender.tab.id: ${senderTabId}. Using tabId: ${tabIdToUse}, isManual: ${isManual}`, LogComponent.BACKGROUND);

            if (tabIdToUse) {
                withErrorHandling(`suspendTab(id=${tabIdToUse}, manual=${isManual})`, async () => {
                    const result = await suspendTab(tabIdToUse, isManual);
                    detailedLog(`${context}: suspendTab(id=${tabIdToUse}, manual=${isManual}) result: ${result}`, LogComponent.BACKGROUND);
                    sendResponse({ success: result });
                }, sendResponse, LogComponent.BACKGROUND);
            } else {
                logError(context, "Missing tabId for suspension. request.tabId and sender.tab.id were both missing.", LogComponent.BACKGROUND);
                sendResponse({ error: "Missing tabId for suspension: request.tabId and sender.tab.id were both unavailable." });
            }
            return true;

        case Const.MSG_UNSUSPEND_TAB:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, LogComponent.BACKGROUND);
                return true;
            }

            if (request.tabId) {
                withErrorHandling(`unsuspendTab(${request.tabId})`, async () => {
                    const result = await unsuspendTab(request.tabId, !!request.shouldFocus);
                    sendResponse({ success: result });
                }, sendResponse, LogComponent.BACKGROUND);
            } else {
                sendResponse({ error: "Missing tabId" });
            }
            return true;

        case Const.MSG_SUSPEND_ALL_TABS_IN_WINDOW:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, LogComponent.BACKGROUND);
                return true;
            }

            withErrorHandling(Const.MSG_SUSPEND_ALL_TABS_IN_WINDOW, async () => {
                let windowId;
                if (request.windowId) {
                    windowId = request.windowId;
                } else if (sender.tab && sender.tab.windowId) {
                    windowId = sender.tab.windowId;
                } else {
                    const currentWindow = await chrome.windows.getCurrent();
                    windowId = currentWindow.id;
                }
                await suspendAllTabsInWindow(windowId, true);
                sendResponse({ success: true });
            }, sendResponse, LogComponent.BACKGROUND);
            return true;

        case Const.MSG_UNSUSPEND_ALL_TABS_IN_WINDOW:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, LogComponent.BACKGROUND);
                return true;
            }

            withErrorHandling(Const.MSG_UNSUSPEND_ALL_TABS_IN_WINDOW, async () => {
                let windowId;
                if (request.windowId) {
                    windowId = request.windowId;
                } else if (sender.tab && sender.tab.windowId) {
                    windowId = sender.tab.windowId;
                } else {
                    const currentWindow = await chrome.windows.getCurrent();
                    windowId = currentWindow.id;
                }
                await unsuspendAllTabsInWindow(windowId);
                sendResponse({ success: true });
            }, sendResponse, LogComponent.BACKGROUND);
            return true;

        case Const.MSG_SUSPEND_ALL_TABS_ALL_SPECS:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, LogComponent.BACKGROUND);
                return true;
            }

            withErrorHandling(Const.MSG_SUSPEND_ALL_TABS_ALL_SPECS, async () => {
                await suspendAllTabsAllSpecs(true); // isManual = true
                sendResponse({ success: true });
            }, sendResponse, LogComponent.BACKGROUND);
            return true;

        case Const.MSG_UNSUSPEND_ALL_TABS_ALL_SPECS:
            if (!validateMessageSender(sender, true)) {
                sendResponse({ error: "Permission denied" });
                logError(context, `Unauthorized attempt to call ${request.type} from ${JSON.stringify(sender)}`, LogComponent.BACKGROUND);
                return true;
            }

            withErrorHandling(Const.MSG_UNSUSPEND_ALL_TABS_ALL_SPECS, async () => {
                await unsuspendAllTabsAllSpecs();
                sendResponse({ success: true });
            }, sendResponse, LogComponent.BACKGROUND);
            return true;

        default:
            log(`${context}: Unknown message type received`, LogComponent.BACKGROUND);
            sendResponse({ error: "Unknown message type" });
            return false;
    }
    return true; // Default to true for async responses unless explicitly false.
}

export function handleTabCreated(tab) {
    if (!tab || !tab.id) return;

    detailedLog(`Tab created: ${tab.id}, ${tab.url || 'no URL'}`, LogComponent.BACKGROUND);

    // Schedule the tab for potential suspension
    scheduleTab(tab.id, tab);
}

export function handleTabUpdated(tabId, changeInfo, tab) {
    if (!tabId || !tab) return;

    detailedLog(`Tab ${tabId} updated (${tab.title || 'no title'}): ${JSON.stringify(changeInfo)}`, LogComponent.BACKGROUND);

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
        scheduleTab(tabId, tab);
    }
}

export function handleTabRemoved(tabId, removeInfo) {
    detailedLog(`Tab removed: ${tabId}, window: ${removeInfo.windowId}, isWindowClosing: ${removeInfo.isWindowClosing}`, LogComponent.BACKGROUND);

    // Clean up the tab suspension time entry to prevent memory leaks
    removeTabSuspendTime(tabId);

    // If this tab was the active tab for its window, update the activeTabsByWindow Map
    withErrorHandling(
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
                                detailedLog(`Updated active tab for window ${windowId} to ${activeTabs[0].id}`, LogComponent.BACKGROUND);
                            } else {
                                detailedLog(`Removed active tab tracking for window ${windowId} (no active tabs found)`, LogComponent.BACKGROUND);
                            }
                        } catch (e) {
                            detailedLog(`Could not query for new active tab in window ${windowId}: ${e.message}`, LogComponent.BACKGROUND);
                        }
                    }
                }
            } catch (e) {
                logError(`Error in handleTabRemoved: ${e.message}`, LogComponent.BACKGROUND);
            }
        }
    );
}

export function handleTabActivated(activeInfo) {
    const { tabId, windowId } = activeInfo;
    log(`Tab ${tabId} activated in window ${windowId}`, LogComponent.BACKGROUND);

    withErrorHandling(
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
                        logWarning(`Window ${windowId} not found during tab activation.`, LogComponent.BACKGROUND);
                        return;
                    }
                    isFocusedWindow = window.focused;
                } catch (e) {
                    log(`Error checking window focus state: ${e.message}`, LogComponent.BACKGROUND);
                    // Default to true for the last focused window as a fallback
                    isFocusedWindow = (windowId === State.getLastFocusedWindow());
                }

                // If this tab activation is in the focused window or should be protected due to last-window setting
                if (isFocusedWindow || (prefs.neverSuspendLastWindow && windowId === State.getLastFocusedWindow())) {
                    // Unschedule suspension for the newly activated tab
                    await unscheduleTab(tabId);

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
                            logWarning(`Previous active tab ${previousActiveTabId} not found during tab activation.`, LogComponent.BACKGROUND);
                            return;
                        }
                        // Only reschedule if the tab still exists and isn't suspended
                        if (previousTab && !previousTab.url.startsWith(chrome.runtime.getURL("suspended.html"))) {
                            await scheduleTab(previousActiveTabId, previousTab);
                            detailedLog(`Rescheduled previous active tab ${previousActiveTabId}`, LogComponent.BACKGROUND);
                        }
                    } catch (e) {
                        // Tab might not exist anymore, ignore
                        if (!e.message?.includes("No tab with id")) {
                            logError(`Error rescheduling previous tab: ${e.message}`, LogComponent.BACKGROUND);
                        }
                    }
                }
            } catch (error) {
                logError(`Error processing tab activation: ${error.message}`, LogComponent.BACKGROUND);
            }
        }
    );
}

export function handleWindowFocusChanged(windowId) {
    log(`Window focus changed to: ${windowId}`, LogComponent.BACKGROUND);

    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Focus moved away from Chrome entirely
        log("Focus left Chrome - this won't affect suspension status", LogComponent.BACKGROUND);
        return;
    }

    // Update last focused window tracking
    const previousFocusedWindow = State.getLastFocusedWindow();
    State.updateLastFocusedWindow(windowId);

    withErrorHandling(
        `handleWindowFocusChanged(${windowId})`,
        async () => {
            try {
                // Get the active tab in the newly focused window
                const activeTabs = await chrome.tabs.query({ active: true, windowId });
                if (!activeTabs || activeTabs.length === 0) {
                    log(`No active tab found in window ${windowId}`, LogComponent.BACKGROUND);
                    return;
                }

                const activeTab = activeTabs[0];
                if (!activeTab || !activeTab.id) {
                    log(`Invalid active tab in window ${windowId}`, LogComponent.BACKGROUND);
                    return;
                }

                log(`Active tab in newly focused window ${windowId} is ${activeTab.id} (${activeTab.title || 'unknown title'})`, LogComponent.BACKGROUND);

                // Store active tab info
                State.setActiveTabForWindow(windowId, activeTab.id);

                // Unschedule this active tab as it's now the active tab in the focused window
                await unscheduleTab(activeTab.id);

                // When window focus changes, we need to properly handle the scheduling based on preferences
                if (prefs.neverSuspendLastWindow && previousFocusedWindow !== chrome.windows.WINDOW_ID_NONE) {
                    // Reschedule all tabs in all windows except the active tab in current window
                    const allWindows = await chrome.windows.getAll();
                    if (!allWindows || allWindows.length === 0) {
                        logWarning('No windows found during window focus change.', LogComponent.BACKGROUND);
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
                                await scheduleTab(tabs[0].id, tabs[0]);
                                detailedLog(`Scheduled active tab ${tabs[0].id} in window ${window.id} after focus change`, LogComponent.BACKGROUND);
                            }
                        }
                    }
                }
            } catch (error) {
                logError(`Error processing window focus change: ${error.message}`, LogComponent.BACKGROUND);
            }
        }
    );
}

export function handleAlarmEvent(alarm) {
    if (!alarm || !alarm.name) return;

    // Handle different types of alarms
    if (alarm.name === Const.TS_TAB_SCAN_ALARM_NAME) {
        // Handle tab scan alarm
        withErrorHandling(Const.TS_TAB_SCAN_ALARM_NAME, async () => {
            await scanTabsForSuspension();
        }, LogComponent.BACKGROUND);
    } else if (alarm.name === Const.TS_ALARM_CLEANUP_NAME) {
        // Handle alarm cleanup
        withErrorHandling(Const.TS_ALARM_CLEANUP_NAME, async () => {
            log('Performing periodic cleanup tasks (if any defined)...', LogComponent.BACKGROUND);
        }, LogComponent.BACKGROUND);
    } else if (alarm.name === Const.TS_STATE_CLEANUP_NAME) {
        // Handle state reference cleanup
        withErrorHandling(Const.TS_STATE_CLEANUP_NAME, async () => {
            log('Cleaning up state references...', LogComponent.BACKGROUND);
            // Call background's cleanupStateReferences function
            await State.cleanupStateReferences();
        }, LogComponent.BACKGROUND);
    }
}

export function handleWindowCreation(window) {
    detailedLog(`Window created: ${window.id}`, LogComponent.BACKGROUND);
    // Implement window creation logic if needed
}

export function handleWindowRemoval(windowId) {
    detailedLog(`Window removed: ${windowId}`, LogComponent.BACKGROUND);

    // Clean up any state related to this window
    withErrorHandling(
        `handleWindowRemoval(${windowId})`,
        async () => {
            try {
                State.removeWindowTracking(windowId);
                if (State.getLastFocusedWindow() === windowId) {
                    const windows = await chrome.windows.getAll();
                    if (!windows || windows.length === 0) {
                        State.updateLastFocusedWindow(chrome.windows.WINDOW_ID_NONE);
                        logWarning('No windows found after window removal. Set last focused window to NONE.', LogComponent.BACKGROUND);
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
                logError(`Error in handleWindowRemoval: ${e.message}`, LogComponent.BACKGROUND);
            }
        }
    );
}

export function handleStartup() {
    log("Browser startup detected", LogComponent.BACKGROUND);
    // Schedule all tabs on startup
    scheduleAllTabs().catch(error => {
        logError("handleStartup", error, LogComponent.BACKGROUND);
    });
}

// ===================== Exported Functions =====================
//+reviewed
export function initListeners() {
    // Clear any existing listeners
    try {
        chrome.runtime.onMessage.removeListener(handleMessage);
        chrome.tabs.onCreated.removeListener(handleTabCreated);
        chrome.tabs.onUpdated.removeListener(handleTabUpdated);
        chrome.tabs.onRemoved.removeListener(handleTabRemoved);
        chrome.tabs.onActivated.removeListener(handleTabActivated);
        chrome.windows.onFocusChanged.removeListener(handleWindowFocusChanged);
        chrome.alarms.onAlarm.removeListener(handleAlarmEvent);
    } catch (e) {
        // Ignore errors during cleanup
    }

    // Set up listeners
    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.tabs.onCreated.addListener(handleTabCreated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);
    chrome.alarms.onAlarm.addListener(handleAlarmEvent);

    log("All event listeners initialized", LogComponent.BACKGROUND);
}
