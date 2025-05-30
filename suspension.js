// suspension.js
import { log, detailedLog, logError } from './logger.js';
import { prefs } from './prefs.js';
import { shouldSkipTab, isAllowedProtocol } from './tab-classifier.js';
import { suspendClose } from './suspend-close.js';
import { suspendTabPreserveHistory } from './suspend-preserve.js';
import { getOriginalDataFromUrl } from './suspension-utils.js';
import { windowExists, tabExists, safeGetTab } from './existence-utils.js';
import * as Const from './constants.js'

/**
 * Checks if a tab has unsaved form data in any frame (main frame or iframes).
 * If the tab or frame is missing (e.g., closed, navigated), logs a warning and returns false.
 * Only logs as error if an unexpected failure occurs.
 * @param {number} tabId - The tab to check.
 * @returns {Promise<boolean>} - True if any frame in the tab has unsaved form data.
 */
async function checkForUnsavedFormData(tabId) {
    try {
        if (!await tabExists(tabId, `checkForUnsavedFormData(${tabId})`)) {
            log(`checkForUnsavedFormData: Tab ${tabId} does not exist.`);
            return false;
        }
        const tab = await safeGetTab(tabId, `checkForUnsavedFormData(${tabId})`);
        if (!tab || !tab.url) {
            log(`checkForUnsavedFormData: Tab ${tabId} has no URL.`);
            return false;
        }
        // Improved: Only allow http/https URLs, and exclude more special/internal pages
        const url = tab.url;
        if (!/^https?:\/\//.test(url)) {
            log(`checkForUnsavedFormData: Tab ${tabId} is not http(s), skipping. URL: ${url}`);
            return false;
        }
        if (
            url.startsWith(chrome.runtime.getURL("suspended.html")) ||
            url.startsWith("chrome-extension://") ||
            url.startsWith("chrome://") ||
            url.startsWith("about:") ||
            url.startsWith("edge://") ||
            url.startsWith("file://") ||
            url.startsWith("view-source:") ||
            url.startsWith("devtools://")
        ) {
            log(`checkForUnsavedFormData: Tab ${tabId} is a special/internal page. URL: ${url}`);
            return false;
        }
        // Run the check in all frames (main + iframes)
        const results = await chrome.scripting.executeScript({
            target: { tabId }, // No frameIds: runs in all frames
            func: () => {
                if (typeof window.onbeforeunload === 'function') {
                    return true;
                }
                for (const form of document.forms) {
                    for (const el of form.elements) {
                        if (!el) continue;
                        if (el.disabled || el.readOnly || el.type === 'hidden' || el.type === 'button' || el.type === 'submit') continue;
                        if ((el.type === 'checkbox' || el.type === 'radio') && el.checked !== el.defaultChecked) {
                            return true;
                        }
                        if (el.type !== 'checkbox' && el.type !== 'radio' && el.value !== el.defaultValue) {
                            return true;
                        }
                    }
                }
                return false;
            }
        });
        log(`checkForUnsavedFormData: Tab ${tabId} results: ${JSON.stringify(results)}`);
        // If any frame reports unsaved data, return true
        const hasUnsaved = results.some(r => !!r?.result);
        log(`checkForUnsavedFormData: Tab ${tabId} hasUnsaved=${hasUnsaved}`);
        return hasUnsaved;
    } catch (error) {
        const msg = error && error.message ? error.message : String(error);
        // These are expected race conditions, not errors
        log(`checkForUnsavedFormData: Tab/frame gone for tab ${tabId}: ${msg}`);
        return false;

    }
}

// --- Core Suspend/Unsuspend ---

/**
 * Main function to suspend a single tab.
 * It first checks eligibility, handles unsaved form warnings, then calls the internal suspension logic.
 * @param {number} tabId - The ID of the tab to suspend.
 * @param {boolean} [isManual=false] - True if the suspension is user-initiated (manual).
 * @returns {Promise<boolean>} True if suspension process was successfully initiated and completed.
 */
export async function suspendTab(tabId, isManual = false) {
    if (typeof tabId !== 'number') {
        logError(`suspendTab: Invalid tabId received: ${tabId}`);
        return false;
    }
    const context = `suspendTab(${tabId}, manual=${isManual})`;

    // First check if tab exists to avoid noisy errors
    const tabToSuspend = await safeGetTab(tabId, context);
    if (!tabToSuspend) {
        log(`${context}: Tab does not exist.`);
        return false; // Tab doesn't exist
    }

    if (tabToSuspend.url && tabToSuspend.url.startsWith(chrome.runtime.getURL("suspended.html"))) {
        detailedLog(`${context}: Tab is already suspended.`);
        return true; // Considered successful as the goal is achieved.
    }

    if (!isAllowedProtocol(tabToSuspend.url)) {
        detailedLog(`suspendTab: Skip non http(s) tabs - Tab ${tabId} is not allowed to be suspended.`);
        return false;
    }

    let hasUnsavedData = false;
    log(`${context}: prefs.unsavedFormHandling=${prefs.unsavedFormHandling}`);
    if (!isManual) {
        const tabCheckResult = await shouldSkipTab(tabToSuspend, true);
        if (tabCheckResult) {
            detailedLog(`${context}: Tab should be skipped: ${tabCheckResult}`);
            return false; // Not an error, but suspension is correctly skipped.
        }
        // Only check for unsaved data if not manual
        if (prefs.unsavedFormHandling !== 'normal') {
            try {
                hasUnsavedData = await checkForUnsavedFormData(tabId);
                log(`${context}: After checkForUnsavedFormData, hasUnsavedData=${hasUnsavedData}`);
                if (hasUnsavedData) {
                    if (prefs.unsavedFormHandling === 'never') {
                        log(`${context}: Skipping suspension due to unsaved form data`);
                        return false;
                    }
                    if (prefs.unsavedFormHandling === 'ask') {
                        log(`${context}: Triggering ASK flow: focusing tab and sending MSG_PROMPT_SUSPEND`);
                        // Focus the tab to trigger the browser's beforeunload prompt
                        await chrome.tabs.update(tabId, { active: true });
                        // Send message to content script to prompt user for suspension
                        await chrome.tabs.sendMessage(tabId, { type: Const.MSG_PROMPT_SUSPEND });
                        // Do NOT proceed with suspension here; wait for user action in content script
                        return false; // Indicate that suspension is pending user action
                    }
                }
            } catch (formCheckError) {
                logError(`${context}: Error checking for unsaved form data`, formCheckError);
                // Continue with suspension if check fails
            }
        }
    }

    log(`suspendTab: Tab ${tabId} - ${tabToSuspend.url} is allowed to be suspended. Manual: ${isManual}, DetectedUnsaved: ${hasUnsavedData}`);

    try {
        let result;
        if (prefs.preserveHistory) {
            detailedLog(`${context}: Using 'preserveHistory' method.`);
            result = await suspendTabPreserveHistory(tabToSuspend, hasUnsavedData);
        } else {
            // For "Close & Reopen" method
            detailedLog(`${context}: Using 'closeAndReopen' method.`);
            result = await suspendClose(tabToSuspend);
        }

        return result;
    } catch (error) {
        throw error; // Re-throw to be caught by outer try/catch
    }
}

/**
 * Unsuspends a tab, restoring it to its original URL.
 * Handles different restoration logic based on how the tab was suspended.
 * @param {number} tabId - The ID of the tab to unsuspend.
 * @returns {Promise<boolean>} True if unsuspension was successful.
 */
export async function unsuspendTab(tabId) {
    const context = `unsuspendTab(${tabId})`;
    detailedLog(`${context}: Attempting to unsuspend.`);

    try {
        // First check if this is actually a suspended tab
        const tab = await safeGetTab(tabId, context);
        if (!tab) {
            return false; // Tab doesn't exist
        }

        if (!tab.url || !tab.url.startsWith(chrome.runtime.getURL("suspended.html"))) {
            detailedLog(`${context}: Tab is not a suspended tab, cannot unsuspend.`);
            return false;
        }

        try {
            const originalData = getOriginalDataFromUrl(tab.url);
            if (!originalData || !originalData.url) {
                logError(`${context}: Failed to extract original URL from suspended tab`);
                return false;
            }

            // Verify tab still exists right before attempting to update it
            if (!await tabExists(tabId, context)) {
                return false;
            }

            // Update tab to original URL
            await chrome.tabs.update(tabId, {
                url: originalData.url,
                active: tab.active, // Maintain active state
                highlighted: tab.highlighted // Maintain highlighted state
            });

            log(`Tab ${tabId} unsuspended to ${originalData.url}.`);
            return true;

        } catch (error) {
            // Handle specific "No tab with id" errors
            if (error.message && error.message.includes("No tab with id")) {
                detailedLog(`${context}: Tab ${tabId} no longer exists during unsuspension`);
                return false; // Tab is gone, consider unsuspension "complete"
            }

            logError(`${context}: Error unsuspending tab`, error);
            return false;
        }
    } catch (e) {
        logError(context, `Unexpected error during unsuspension: ${e.message}`);
        return false;
    }
}

/**
 * Processes tab operations with a concurrency pool (queue) of up to N tabs at a time.
 * For each tab, just runs the operation; does not wait for loading or status.
 * @param {Array<number>} tabIds - Array of tab IDs to process.
 * @param {Function} op - Async function(tabId) => Promise<boolean> to run on each tab.
 * @param {number} concurrency - Max number of tabs to process at once.
 * @returns {Promise<{success: number, skipped: number}>}
 */
async function processTabsWithConcurrency(tabIds, op, concurrency = 5) {
    let success = 0;
    let skipped = 0;
    let idx = 0;
    const total = tabIds.length;
    const next = () => idx < total ? tabIds[idx++] : null;
    const promises = [];
    async function worker() {
        while (true) {
            const tabId = next();
            if (tabId === null) break;
            try {
                const didProcess = await op(tabId);
                if (didProcess) {
                    success++;
                } else {
                    skipped++;
                }
            } catch (e) {
                skipped++;
            }
        }
    }
    for (let i = 0; i < concurrency; i++) {
        promises.push(worker());
    }
    await Promise.all(promises);
    return { success, skipped };
}

// --- Bulk Operations ---
/**
 * Suspends all eligible tabs in a given window, in batches of 5.
 * @param {number} windowId - The ID of the window.
 * @param {boolean} [isManual=false] - Whether the suspension is user-initiated.
 */
export async function suspendAllTabsInWindow(windowId, isManual = false) {
    const context = `suspendAllTabsInWindow(windowId=${windowId}, manual=${isManual})`;
    log(`${context}: Suspending eligible tabs.`);
    if (!await windowExists(windowId, context)) {
        log(`${context}: Window does not exist, skipping.`);
        return;
    }
    try {
        const tabsInWindow = await chrome.tabs.query({ windowId, url: ['http://*/*', 'https://*/*'] });
        log(`${context}: Found ${tabsInWindow.length} tabs in window.`);
        const tabIds = tabsInWindow.filter(tab => tab.id && tab.url).map(tab => tab.id);
        const { success, skipped } = await processTabsWithConcurrency(tabIds, (tabId) => suspendTab(tabId, isManual), 5);
        log(`${context}: Suspended ${success} tabs, skipped ${skipped} tabs.`);
    } catch (error) {
        logError(context, error);
    }
}

/**
 * Unsuspends all suspended tabs in a given window, in batches of 5.
 * @param {number} windowId - The ID of the window.
 */
export async function unsuspendAllTabsInWindow(windowId) {
    const context = `unsuspendAllTabsInWindow(windowId=${windowId})`;
    log(`${context}: Unsuspending tabs.`);
    if (!await windowExists(windowId, context)) {
        log(`${context}: Window does not exist, skipping.`);
        return;
    }
    try {
        const suspendedUrlPattern = chrome.runtime.getURL("suspended.html") + "*";
        const tabsInWindow = await chrome.tabs.query({ windowId, url: suspendedUrlPattern });
        log(`${context}: Found ${tabsInWindow.length} suspended tabs in window.`);
        const tabIds = tabsInWindow.filter(tab => tab.id).map(tab => tab.id);
        const { success, skipped } = await processTabsWithConcurrency(tabIds, unsuspendTab, 5);
        log(`${context}: Unsuspended ${success} tabs, skipped ${skipped} tabs.`);
    } catch (error) {
        logError(context, error);
    }
}

/**
 * Suspends all eligible tabs across all windows, in batches of 5 per window.
 * @param {boolean} [isManual=false] - Whether the suspension is user-initiated.
 */
export async function suspendAllTabsAllSpecs(isManual = false) {
    const context = `suspendAllTabsAllSpecs(manual=${isManual})`;
    log(`${context}: Suspending all eligible tabs across all windows.`);
    const allWindows = await chrome.windows.getAll();
    log(`${context}: Found ${allWindows.length} windows.`);
    if (!allWindows.length) {
        log(`${context}: No windows found, skipping.`);
        return;
    }
    globalThis.isBulkOpRunning = true;
    await chrome.storage.local.set({ BULK_OP_IN_PROGRESS: true, BULK_OP_TIMESTAMP: Date.now() });
    log(`${context}: BULK_OP_IN_PROGRESS set to true`);
    try {
        for (const window of allWindows) {
            try {
                log(`${context}: Suspending window ${window.id}`);
                await suspendAllTabsInWindow(window.id, isManual);
            } catch (winErr) {
                logError(`${context}: Error suspending window ${window.id}`, winErr);
            }
        }
        log(`${context}: All windows processed.`);
    } catch (error) {
        logError(context, error);
    } finally {
        globalThis.isBulkOpRunning = false;
        await chrome.storage.local.set({ BULK_OP_IN_PROGRESS: false });
        log(`${context}: BULK_OP_IN_PROGRESS set to false`);
    }
}

/**
 * Unsuspends all suspended tabs across all windows, in batches of 5 per window.
 */
export async function unsuspendAllTabsAllSpecs() {
    const context = `unsuspendAllTabsAllSpecs()`;
    log(`${context}: Unsuspending all tabs across all windows.`);
    const allWindows = await chrome.windows.getAll();
    log(`${context}: Found ${allWindows.length} windows.`);
    if (!allWindows.length) {
        log(`${context}: No windows found, skipping.`);
        return;
    }
    globalThis.isBulkOpRunning = true;
    await chrome.storage.local.set({ BULK_OP_IN_PROGRESS: true, BULK_OP_TIMESTAMP: Date.now() });
    log(`${context}: BULK_OP_IN_PROGRESS set to true`);
    try {
        for (const window of allWindows) {
            try {
                log(`${context}: Unsuspending window ${window.id}`);
                await unsuspendAllTabsInWindow(window.id);
            } catch (winErr) {
                logError(`${context}: Error unsuspending window ${window.id}`, winErr);
            }
        }
        log(`${context}: All windows processed.`);
    } catch (error) {
        logError(context, error);
    } finally {
        globalThis.isBulkOpRunning = false;
        await chrome.storage.local.set({ BULK_OP_IN_PROGRESS: false });
        log(`${context}: BULK_OP_IN_PROGRESS set to false`);
    }
}

/**
 * Checks if a tab should be skipped for suspension (wrapper for scheduling.js).
 * @param {chrome.tabs.Tab} tab
 * @param {boolean} [debug=false]
 * @returns {Promise<string|boolean>}
 */
export async function shouldSkipTabForScheduling(tab, debug = false) {
    return shouldSkipTab(tab, debug);
}

