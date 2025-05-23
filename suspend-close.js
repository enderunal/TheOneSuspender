// suspend-close.js
import { log, detailedLog, logError } from './logger.js'; // Import shared logger with error handling
import { buildSuspendedUrl } from './url-builder.js';

/**
 * Suspends a tab using the close & reopen method.
 * Creates a new placeholder tab and then removes the original tab.
 * Assumes that original tab data has ALREADY been saved to State by the caller (e.g., suspension.js).
 * @param {chrome.tabs.Tab} tab - The tab to suspend.
 * @returns {Promise<boolean>} Success status.
 */
export async function suspendClose(tab, hasUnsavedData = false) {
    const context = `suspendClose(${tab?.id})`;

    if (!tab || !tab.id) {
        logError(context, "Invalid tab object passed");
        return false;
    }


    log(`${context}: Using "close & reopen" method for tab ${tab.id} (${tab.url?.substring(0, 50)}...)`);

    const suspendedPageUrl = buildSuspendedUrl(tab);
    detailedLog(`${context}: Built suspended page URL: ${suspendedPageUrl}`);

    // Step 1: Create the placeholder tab first.
    // It's created as inactive to avoid stealing focus.
    const newTab = await chrome.tabs.create({
        windowId: tab.windowId,
        index: tab.index,
        url: suspendedPageUrl, // URL object converted to string by chrome.tabs.create
        active: false,
        openerTabId: tab.openerTabId // Preserve opener relationship if it exists.
    });

    if (!newTab || !newTab.id) {
        throw new Error("Failed to create placeholder tab - chrome.tabs.create returned invalid tab object.");
    }
    detailedLog(`${context}: Placeholder tab ${newTab.id} created successfully at index ${newTab.index}.`);

    // Step 2: Remove the original tab *after* the new one is confirmed created.
    try {
        await chrome.tabs.remove(tab.id);
        log(`${context}: Original tab ${tab.id} closed. Placeholder ${newTab.id} is active.`);
        return true;
    } catch (removeError) {
        // If error is due to beforeunload prompt being rejected by user,
        // we should cancel suspension and remove the placeholder
        if (removeError.message?.includes("Cannot close tab, user cancelled")) {
            log(`${context}: User cancelled tab closure due to unsaved changes. Removing placeholder.`);

            try {
                await chrome.tabs.remove(newTab.id);
                log(`${context}: Placeholder tab ${newTab.id} removed after user cancelled suspension.`);
            } catch (cleanupError) {
                logError(context, `Error removing placeholder tab: ${cleanupError.message}`);
            }
            return false;
        }

        logError(context, `Error removing original tab ${tab.id}: ${removeError.message}. Attempting to clean up placeholder ${newTab.id}.`);
        // If removing the original tab fails for other reasons, we should try to clean up the placeholder
        try {
            await chrome.tabs.remove(newTab.id);
            logError(context, `Placeholder tab ${newTab.id} removed after failing to remove original tab.`);
        } catch (cleanupError) {
            logError(context, `CRITICAL: Failed to remove original tab AND failed to clean up placeholder tab ${newTab.id}: ${cleanupError.message}`);
        }

        // Propagate the original error that caused this cleanup attempt.
        throw removeError;
    }

}

/**
 * Unsuspends a tab that was suspended using the close & reopen method.
 * This typically means updating the placeholder tab to the original URL.
 * @param {number} placeholderTabId - The ID of the placeholder tab.
 * @param {string} originalUrl - The original URL to restore.
 * @param {boolean} [shouldFocus=false] - Whether to focus the tab after unsuspending.
 * @returns {Promise<boolean>} Success status.
 */
export async function unsuspendClose(placeholderTabId, originalUrl, shouldFocus = false) {
    const context = `unsuspendClose(placeholder:${placeholderTabId})`;
    log(`${context}: Attempting to unsuspend to URL: ${originalUrl.substring(0, 100)}..., Focus: ${shouldFocus}`);

    if (typeof placeholderTabId !== 'number' || !originalUrl) {
        logError(context, `Invalid parameters: tabId=${placeholderTabId}, originalUrl=${originalUrl}`);
        return false;
    }

    try {
        // Validate the original URL before attempting to use it.
        try {
            new URL(originalUrl);
        } catch (urlError) {
            logError(context, `Invalid original URL '${originalUrl}' for restoration: ${urlError.message}`);
            // Potentially try to close the placeholder if the URL is invalid, or just fail.
            // For now, just failing to prevent unexpected closure.
            return false;
        }

        // Fetch the placeholder tab to ensure it still exists and is ours.
        let placeholderTab;
        try {
            placeholderTab = await chrome.tabs.get(placeholderTabId);
            if (!placeholderTab) throw new Error("Tab not found by chrome.tabs.get."); // Should be caught by catch block
        } catch (getTabError) {
            logError(context, `Placeholder tab ${placeholderTabId} not found or error fetching it: ${getTabError.message}`);
            return false; // Placeholder tab is gone.
        }

        // Optional: Verify it's still a suspended.html page (though suspension.js should ensure this).
        if (!placeholderTab.url || !placeholderTab.url.startsWith(chrome.runtime.getURL("suspended.html"))) {
            detailedLog(`${context}: Tab ${placeholderTabId} is no longer a suspended.html page (URL: ${placeholderTab.url}). Attempting to update and focus if requested.`);
            // If it's not our page, but we're asked to restore it, still try to navigate it.
        }

        await chrome.tabs.update(placeholderTabId, {
            url: originalUrl,
            active: shouldFocus
        });

        if (shouldFocus && placeholderTab.windowId) {
            try {
                await chrome.windows.update(placeholderTab.windowId, { focused: true });
            } catch (focusWindowError) {
                detailedLog(context, `Could not focus window ${placeholderTab.windowId} during unsuspend: ${focusWindowError.message}`);
            }
        }

        log(`${context}: Successfully restored tab ${placeholderTabId} to ${originalUrl}`);
        return true;

    } catch (error) {
        logError(context, `Error updating placeholder tab ${placeholderTabId}: ${error.message}`);
        // Check if the error implies the tab was closed during the operation.
        if (error.message?.includes("No tab with id")) {
            detailedLog(context, `Placeholder tab ${placeholderTabId} was likely closed during restoration attempt.`);
        }
        return false;
    }
}
