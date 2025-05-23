import { log, detailedLog, logError } from './logger.js';
import { buildSuspendedUrl } from './url-builder.js';
import { tabExists } from './existence-utils.js';


/**
 * Suspends a tab using the "Preserve History" method (discard and navigate).
 * This involves discarding the tab to free resources while keeping its back/forward history,
 * then navigating it to the suspended.html placeholder page.
 * @param {chrome.tabs.Tab} originalTab - The full tab object to suspend.
 * @param {boolean} [hasUnsavedData=false] - Whether the tab has unsaved form data.
 * @returns {Promise<boolean>} True if suspension was successful.
 */
export async function suspendTabPreserveHistory(originalTab, hasUnsavedData = false) {
    const context = `suspendTabPreserveHistory(${originalTab.id})`;
    detailedLog(`${context}: Attempting to suspend with history preservation. Has unsaved data: ${hasUnsavedData}`);


    let currentTargetTabId = originalTab.id; // The ID of the tab we are trying to ultimately navigate


    // * Note to myself; Decided to skip this for now
    // First, discard the tab to free up resources but keep its state in memory
    // Skip discarding if there's unsaved data, as it would bypass the beforeunload handler
    if (!hasUnsavedData) {
        try {
            // Verify original tab still exists right before attempting to discard it
            if (!await tabExists(originalTab.id, `${context} (before discard)`)) {
                detailedLog(`${context}: Original tab ${originalTab.id} is already gone before discard.`);
                return false; // Tab is already gone, no need to suspend further
            }

            const discardedTabObject = await chrome.tabs.discard(originalTab.id);
            // Important: chrome.tabs.discard can sometimes return a new tab ID
            if (discardedTabObject && typeof discardedTabObject.id === 'number' && discardedTabObject.id !== originalTab.id) {
                log(`${context}: Tab ID changed from ${originalTab.id} to ${discardedTabObject.id} after discard`);
                currentTargetTabId = discardedTabObject.id; // Focus on the new tab ID as our target
            }
            log(`${context}: Discard attempt complete for original tab ${originalTab.id}. Current target for navigation is ${currentTargetTabId}.`);
        } catch (discardError) {
            // Handle "No tab with id" error specifically for the original tab
            if (discardError.message && discardError.message.includes("No tab with id") && discardError.message.includes(String(originalTab.id))) {
                detailedLog(`${context}: Original tab ${originalTab.id} disappeared during discard attempt.`);
                return false; // Original tab is gone, nothing to suspend
            }
            // For other discard errors, or if the currentTargetTabId was affected:
            detailedLog(`${context}: Non-fatal error during chrome.tabs.discard: ${discardError.message}. Will proceed with currentTargetTabId: ${currentTargetTabId}.`);
        }
    }

    // Check if the tab we are about to update (currentTargetTabId) still exists
    if (!await tabExists(currentTargetTabId, `${context} (before update)`)) {
        detailedLog(`${context}: Target tab ${currentTargetTabId} for update no longer exists.`);
        return false; // The tab we intended to update is gone
    }

    // Build the suspended page URL using the originalTab's information, as that's what the user expects to see
    const suspendedPageUrl = buildSuspendedUrl(originalTab);
    const shouldActivate = hasUnsavedData; // Only activate if prompting for unsaved data

    // Update the target tab (which might be the new tab from discard, or the original) with our suspended URL
    try {
        await chrome.tabs.update(currentTargetTabId, {
            url: suspendedPageUrl,
            active: shouldActivate,
            highlighted: shouldActivate // Ensure tab is visible if activated
        });
        log(`${context}: Navigated tab ${currentTargetTabId} to suspended.html (active: ${shouldActivate})`);
        return true; // Successfully navigated the target tab
    } catch (updateError) {
        // Handle "No tab with id" error specifically for the currentTargetTabId
        if (updateError.message && updateError.message.includes("No tab with id") && updateError.message.includes(String(currentTargetTabId))) {
            detailedLog(`${context}: Target tab ${currentTargetTabId} disappeared during update to suspended.html.`);
        } else {
            logError(`${context}: Error updating tab ${currentTargetTabId} to suspended URL: ${updateError.message}`);
        }
        return false; // Update failed
    }
}
