// state.js - Shared state between background and listeners modules
import * as Logger from './logger.js';

// Browser status trackers
let isOfflineMode = !navigator.onLine; // Initialize with current status
let lastFocusedWindowId = chrome.windows.WINDOW_ID_NONE;

// Map of window IDs to their active tab IDs
const activeTabsByWindow = new Map();

/**
 * Check if the browser is offline
 * @returns {boolean} Whether the browser is offline
 */
export function isOffline() {
    return isOfflineMode;
}

/**
 * Update and return the offline status
 * @param {boolean} [status] - Optional status to set
 * @returns {boolean} The current offline status
 */
export function updateOfflineStatus(status = null) {
    if (status !== null) {
        isOfflineMode = status;
    } else {
        // Get from navigator
        isOfflineMode = !navigator.onLine;
    }

    // Log status change if it's different from what we last knew
    const wasOffline = isOfflineMode;

    // In MV3 service worker, we can't rely on online/offline events
    // Need to poll the navigator.onLine property regularly
    if (status === null) {
        isOfflineMode = !navigator.onLine;
        if (wasOffline !== isOfflineMode) {
            Logger.log(`Network status changed: ${isOfflineMode ? 'Offline' : 'Online'}`, Logger.LogComponent.BACKGROUND);
        }
    }

    return isOfflineMode;
}

/**
 * Get the ID of the last focused window
 * @returns {number} Window ID
 */
export function getLastFocusedWindow() {
    return lastFocusedWindowId;
}

/**
 * Update the last focused window ID
 * @param {number} windowId - The ID of the window that gained focus
 */
export function updateLastFocusedWindow(windowId) {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        lastFocusedWindowId = windowId;
    }
}

/**
 * Set the active tab for a window
 * @param {number} windowId - Window ID
 * @param {number} tabId - Tab ID
 */
export function setActiveTabForWindow(windowId, tabId) {
    activeTabsByWindow.set(windowId, tabId);
}

/**
 * Get the active tab for a window
 * @param {number} windowId - Window ID
 * @returns {number|undefined} Tab ID or undefined
 */
export function getActiveTabForWindow(windowId) {
    return activeTabsByWindow.get(windowId);
}

/**
 * Remove tracking data for a window
 * @param {number} windowId - Window ID to remove from tracking
 */
export function removeWindowTracking(windowId) {
    const hadEntry = activeTabsByWindow.has(windowId);
    activeTabsByWindow.delete(windowId);
    if (hadEntry) {
        Logger.detailedLog(`Removed window ${windowId} from activeTabsByWindow tracking`, Logger.LogComponent.BACKGROUND);
    }

    // If this was the last focused window, reset it
    if (lastFocusedWindowId === windowId) {
        lastFocusedWindowId = chrome.windows.WINDOW_ID_NONE;
        Logger.detailedLog(`Reset lastFocusedWindowId because window ${windowId} was removed`, Logger.LogComponent.BACKGROUND);
    }
}

/**
 * Clean up any references to tabs and windows that no longer exist
 * This helps prevent memory leaks from lost events
 */
export async function cleanupStateReferences() {
    try {
        // Get current windows
        const windows = await chrome.windows.getAll();
        const windowIds = new Set(windows.map(w => w.id));

        // Clean up window tracking for windows that no longer exist
        let removedEntries = 0;
        for (const windowId of activeTabsByWindow.keys()) {
            if (!windowIds.has(windowId)) {
                activeTabsByWindow.delete(windowId);
                removedEntries++;
                Logger.detailedLog(`Removed stale window ${windowId} from activeTabsByWindow during cleanup`, Logger.LogComponent.BACKGROUND);
            }
        }

        // Check and update last focused window
        if (lastFocusedWindowId !== chrome.windows.WINDOW_ID_NONE && !windowIds.has(lastFocusedWindowId)) {
            // Reset to NONE if the window no longer exists
            lastFocusedWindowId = chrome.windows.WINDOW_ID_NONE;
            removedEntries++;
            Logger.log(`Reset stale lastFocusedWindowId during cleanup`, Logger.LogComponent.BACKGROUND);
        }

        if (removedEntries > 0) {
            Logger.log(`State cleanup removed ${removedEntries} stale entries`, Logger.LogComponent.BACKGROUND);
        }
    } catch (e) {
        Logger.logError("Error during state cleanup:", e, Logger.LogComponent.BACKGROUND);
    }
} 