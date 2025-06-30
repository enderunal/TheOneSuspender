// session-manager.js
import * as Logger from './logger.js';
import * as Const from './constants.js';
import * as Prefs from './prefs.js';

const SESSIONS_STORAGE_KEY = 'saved_sessions';
const AUTO_SAVE_ENABLED_KEY = 'session_auto_save_enabled';

/**
 * Get all saved sessions
 * @returns {Promise<Array>} Array of saved sessions
 */
export async function getSavedSessions() {
    try {
        const result = await chrome.storage.local.get([SESSIONS_STORAGE_KEY]);
        return result[SESSIONS_STORAGE_KEY] || [];
    } catch (error) {
        Logger.logError("Error getting saved sessions", error, Logger.LogComponent.GENERAL);
        return [];
    }
}

/**
 * Save the current browser session to storage
 * @param {string} sessionName - Optional name for the session  
 * @param {boolean} isAutoSave - Whether this is an automatic save
 * @returns {Promise<object>} The saved session object
 */
export async function saveCurrentSession(sessionName = null, isAutoSave = false) {
    try {
        const sessionData = await captureCurrentSession();

        const session = {
            id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: sessionName || generateSessionName(isAutoSave),
            timestamp: Date.now(),
            isAutoSave: isAutoSave,
            data: sessionData,
            stats: {
                totalWindows: sessionData.windows.length,
                totalTabs: sessionData.windows.reduce((sum, win) => sum + win.tabs.length, 0),
                suspendedTabs: sessionData.windows.reduce((sum, win) =>
                    sum + win.tabs.filter(tab => tab.isSuspended).length, 0)
            }
        };

        // Get current sessions and add the new one
        const sessions = await getSavedSessions();
        sessions.unshift(session); // Add to beginning (newest first)

        // Keep only the most recent sessions (FIFO - remove oldest when limit exceeded)
        // Read max sessions directly from storage to get the latest value
        const result = await chrome.storage.local.get([Prefs.PREFS_KEY]);
        const currentPrefs = { ...Prefs.defaultPrefs, ...(result[Prefs.PREFS_KEY] || {}) };
        const maxSessions = currentPrefs.sessionMaxSessions || 50;
        const trimmedSessions = sessions.slice(0, maxSessions);

        // Save back to storage
        await chrome.storage.local.set({ [SESSIONS_STORAGE_KEY]: trimmedSessions });

        Logger.log(`Session saved: ${session.name} (${session.stats.totalTabs} tabs in ${session.stats.totalWindows} windows, ${session.stats.suspendedTabs} suspended)`, Logger.LogComponent.GENERAL);
        return session;
    } catch (error) {
        Logger.logError("Error saving session", error, Logger.LogComponent.GENERAL);
        throw error;
    }
}

/**
 * Capture the current browser session
 * @returns {Promise<object>} Session data
 */
async function captureCurrentSession() {
    const windows = await chrome.windows.getAll({ populate: true });
    const sessionData = {
        capturedAt: Date.now(),
        windows: []
    };

    for (const window of windows) {
        const windowData = {
            id: window.id,
            focused: window.focused,
            incognito: window.incognito,
            state: window.state,
            type: window.type,
            left: window.left,
            top: window.top,
            width: window.width,
            height: window.height,
            tabs: [],
            groups: {}
        };

        // Capture tab groups first
        try {
            const groups = await chrome.tabGroups.query({ windowId: window.id });
            for (const group of groups) {
                windowData.groups[group.id] = {
                    id: group.id,
                    title: group.title,
                    color: group.color,
                    collapsed: group.collapsed
                };
            }
        } catch (e) {
            // Tab groups API might not be available
        }

        // Capture tabs
        for (const tab of window.tabs) {
            const tabData = {
                id: tab.id,
                index: tab.index,
                url: tab.url,
                title: tab.title,
                favIconUrl: tab.favIconUrl,
                pinned: tab.pinned,
                active: tab.active,
                highlighted: tab.highlighted,
                incognito: tab.incognito,
                groupId: tab.groupId || null,
                isSuspended: false,
                originalUrl: null
            };

            // Check if tab is suspended - use more specific detection
            const suspendedPageUrl = chrome.runtime.getURL(Const.SUSPENDED_PAGE_PATH);
            if (tab.url && tab.url.startsWith(suspendedPageUrl)) {
                tabData.isSuspended = true;
                Logger.detailedLog(`Found suspended tab ${tab.id}: ${tab.url}`, Logger.LogComponent.GENERAL);

                // Extract original URL using proper hash parsing
                try {
                    const urlObj = new URL(tab.url);
                    let originalUrl = null;

                    // Debug the URL structure
                    Logger.detailedLog(`URL object - hash: "${urlObj.hash}", search: "${urlObj.search}"`, Logger.LogComponent.GENERAL);

                    // First try hash format (current format)
                    if (urlObj.hash && urlObj.hash.length > 1) {
                        const hash = urlObj.hash.substring(1); // Remove #
                        Logger.detailedLog(`Parsing hash: ${hash}`, Logger.LogComponent.GENERAL);
                        const hashParams = new URLSearchParams(hash);
                        originalUrl = hashParams.get('url');
                        Logger.detailedLog(`Extracted originalUrl from hash: ${originalUrl}`, Logger.LogComponent.GENERAL);
                    }

                    // Fallback to query parameters (legacy format)
                    if (!originalUrl && urlObj.search) {
                        originalUrl = urlObj.searchParams.get('url');
                        Logger.detailedLog(`Extracted originalUrl from query: ${originalUrl}`, Logger.LogComponent.GENERAL);
                    }

                    if (originalUrl) {
                        tabData.originalUrl = originalUrl;
                        Logger.detailedLog(`Final originalUrl: ${tabData.originalUrl}`, Logger.LogComponent.GENERAL);
                    } else {
                        Logger.logError(`No original URL found in suspended tab ${tab.id}: ${tab.url}`, null, Logger.LogComponent.GENERAL);
                    }
                } catch (e) {
                    Logger.logError("Error extracting original URL from suspended tab", e, Logger.LogComponent.GENERAL);
                }
            } else {
                // Log non-suspended tabs for debugging
                Logger.detailedLog(`Regular tab ${tab.id}: ${tab.url}`, Logger.LogComponent.GENERAL);
            }

            windowData.tabs.push(tabData);
        }

        sessionData.windows.push(windowData);
    }

    return sessionData;
}

/**
 * Generate a session name
 * @param {boolean} isAutoSave 
 * @returns {string}
 */
function generateSessionName(isAutoSave = false) {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isAutoSave) {
        return `Auto-save ${dateStr} at ${timeStr}`;
    } else {
        return `Session ${dateStr} at ${timeStr}`;
    }
}

/**
 * Restore a saved session by recreating windows and tabs
 * @param {string} sessionId - The ID of the session to restore
 * @param {boolean} [restoreSuspended=false] - Whether to restore suspended tabs in suspended state
 * @returns {Promise<boolean>} Success status
 */
export async function restoreSession(sessionId, restoreSuspended = false) {
    Logger.log(`Attempting to restore session: ${sessionId}`, Logger.LogComponent.GENERAL);

    try {
        const sessions = await getSavedSessions();
        const session = sessions.find(s => s.id === sessionId);

        if (!session) {
            Logger.logError(`Session not found: ${sessionId}`, null, Logger.LogComponent.GENERAL);
            return false;
        }

        let totalTabs = 0;
        let restoredTabs = 0;

        // Restore each window
        for (const windowData of session.data.windows) {
            totalTabs += windowData.tabs.length;

            if (windowData.tabs.length === 0) continue;

            const success = await restoreWindow(windowData, restoreSuspended);
            if (success) {
                restoredTabs += windowData.tabs.length;
            }
        }

        Logger.log(`Session restoration completed. Restored ${restoredTabs}/${totalTabs} tabs`, Logger.LogComponent.GENERAL);
        return restoredTabs > 0;

    } catch (error) {
        Logger.logError('Error restoring session', error, Logger.LogComponent.GENERAL);
        return false;
    }
}

/**
 * Restore a single window from session data
 * @param {object} windowData - Window data from session
 * @param {boolean} restoreSuspended - Whether to restore suspended tabs in suspended state
 * @returns {Promise<boolean>} Success status
 */
async function restoreWindow(windowData, restoreSuspended) {
    try {
        if (!windowData.tabs || windowData.tabs.length === 0) {
            Logger.logError('Window has no tabs to restore', null, Logger.LogComponent.GENERAL);
            return false;
        }

        // Prepare window creation data
        const createData = {
            focused: false, // Don't steal focus
            incognito: windowData.incognito || false
        };

        // Set window position and size if available
        const hasPositionOrSize = windowData.left !== undefined ||
            windowData.top !== undefined ||
            windowData.width !== undefined ||
            windowData.height !== undefined;

        if (windowData.left !== undefined) createData.left = windowData.left;
        if (windowData.top !== undefined) createData.top = windowData.top;
        if (windowData.width !== undefined) createData.width = windowData.width;
        if (windowData.height !== undefined) createData.height = windowData.height;

        // Only set state if we're not setting position/size (Chrome API limitation)
        if (!hasPositionOrSize && windowData.state && windowData.state !== 'normal') {
            createData.state = windowData.state;
        }

        // Create window with first tab
        const firstTab = windowData.tabs[0];
        if (firstTab) {
            // Determine the URL to use for the first tab
            let tabUrl;
            if (firstTab.isSuspended) {
                if (restoreSuspended && firstTab.url) {
                    // Keep the suspended state by using the suspended URL
                    tabUrl = firstTab.url;
                } else if (firstTab.originalUrl) {
                    // Restore to original URL (unsuspended)
                    tabUrl = firstTab.originalUrl;
                } else {
                    // Fallback to current URL
                    tabUrl = firstTab.url;
                }
            } else {
                tabUrl = firstTab.url;
            }

            createData.url = tabUrl;
        }

        const window = await chrome.windows.create(createData);
        if (!window || !window.tabs || window.tabs.length === 0) {
            Logger.logError('Failed to create window or window has no tabs', null, Logger.LogComponent.GENERAL);
            return false;
        }

        const firstCreatedTab = window.tabs[0];

        // Update first tab properties if needed
        if (firstTab.pinned) {
            try {
                await chrome.tabs.update(firstCreatedTab.id, { pinned: true });
            } catch (error) {
                Logger.logError('Error pinning first tab', error, Logger.LogComponent.GENERAL);
            }
        }

        // Create remaining tabs
        for (let i = 1; i < windowData.tabs.length; i++) {
            const tabData = windowData.tabs[i];

            // Determine URL for additional tabs
            let tabUrl;
            if (tabData.isSuspended) {
                if (restoreSuspended && tabData.url) {
                    // Keep suspended state
                    tabUrl = tabData.url;
                } else if (tabData.originalUrl) {
                    // Restore to original URL
                    tabUrl = tabData.originalUrl;
                } else {
                    // Fallback
                    tabUrl = tabData.url;
                }
            } else {
                tabUrl = tabData.url;
            }

            try {
                const tab = await chrome.tabs.create({
                    windowId: window.id,
                    url: tabUrl,
                    active: false,
                    pinned: tabData.pinned || false
                });

                Logger.detailedLog(`Created tab ${tab.id} in window ${window.id}`, Logger.LogComponent.GENERAL);
            } catch (error) {
                Logger.logError(`Error creating tab ${i}`, error, Logger.LogComponent.GENERAL);
            }
        }

        Logger.log(`Successfully restored window with ${windowData.tabs.length} tabs`, Logger.LogComponent.GENERAL);
        return true;

    } catch (error) {
        Logger.logError('Error restoring window', error, Logger.LogComponent.GENERAL);
        return false;
    }
}

/**
 * Delete a session
 * @param {string} sessionId 
 * @returns {Promise<boolean>}
 */
export async function deleteSession(sessionId) {
    try {
        const sessions = await getSavedSessions();
        const filteredSessions = sessions.filter(s => s.id !== sessionId);

        await chrome.storage.local.set({ [SESSIONS_STORAGE_KEY]: filteredSessions });
        Logger.log(`Session deleted: ${sessionId}`, Logger.LogComponent.GENERAL);
        return true;
    } catch (error) {
        Logger.logError("Error deleting session", error, Logger.LogComponent.GENERAL);
        throw error;
    }
}



/**
 * Get auto-save enabled status
 * @returns {Promise<boolean>}
 */
export async function getAutoSaveEnabled() {
    try {
        const result = await chrome.storage.local.get([AUTO_SAVE_ENABLED_KEY]);
        return result[AUTO_SAVE_ENABLED_KEY] !== false; // Default to enabled
    } catch (error) {
        Logger.logError("Error getting auto-save status", error, Logger.LogComponent.GENERAL);
        return true;
    }
}

/**
 * Set auto-save enabled status
 * @param {boolean} enabled 
 * @returns {Promise<void>}
 */
export async function setAutoSaveEnabled(enabled) {
    try {
        await chrome.storage.local.set({ [AUTO_SAVE_ENABLED_KEY]: enabled });
        Logger.log(`Auto-save ${enabled ? 'enabled' : 'disabled'}`, Logger.LogComponent.GENERAL);
    } catch (error) {
        Logger.logError("Error setting auto-save status", error, Logger.LogComponent.GENERAL);
        throw error;
    }
}

/**
 * Clear all saved sessions
 * @returns {Promise<boolean>} Success status
 */
export async function clearAllSessions() {
    Logger.log('Clearing all saved sessions', Logger.LogComponent.GENERAL);

    try {
        await chrome.storage.local.set({ saved_sessions: [] });
        Logger.log('All sessions cleared successfully', Logger.LogComponent.GENERAL);
        return true;
    } catch (error) {
        Logger.logError('Error clearing all sessions', error, Logger.LogComponent.GENERAL);
        return false;
    }
}

/**
 * Trim sessions to match new maximum limit
 * Called when user reduces the maximum session count
 * @returns {Promise<number>} Number of sessions removed
 */
export async function trimSessionsToLimit() {
    try {
        const sessions = await getSavedSessions();

        // Read max sessions directly from storage to get the latest value
        const result = await chrome.storage.local.get([Prefs.PREFS_KEY]);
        const currentPrefs = { ...Prefs.defaultPrefs, ...(result[Prefs.PREFS_KEY] || {}) };
        const maxSessions = currentPrefs.sessionMaxSessions || 50;

        if (sessions.length <= maxSessions) {
            return 0; // No trimming needed
        }

        const trimmedSessions = sessions.slice(0, maxSessions); // Keep newest sessions
        const removedCount = sessions.length - trimmedSessions.length;

        await chrome.storage.local.set({ [SESSIONS_STORAGE_KEY]: trimmedSessions });

        Logger.log(`Trimmed ${removedCount} sessions due to reduced maximum limit (${maxSessions})`, Logger.LogComponent.GENERAL);
        return removedCount;
    } catch (error) {
        Logger.logError("Error trimming sessions to limit", error, Logger.LogComponent.GENERAL);
        throw error;
    }
} 