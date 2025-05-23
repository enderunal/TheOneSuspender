import { detailedLog, logError, log } from './logger.js';

/**
 * Checks if a tab exists
 * @param {number} tabId - The ID of the tab to check
 * @param {string} [context=''] - Optional context string for logging
 * @returns {Promise<boolean>} - True if the tab exists, false otherwise
 */
export async function tabExists(tabId, context = '') {
    try {
        await chrome.tabs.get(tabId);
        return true;
    } catch (error) {
        if (context) {
            log(`${context}: Tab ${tabId} no longer exists. Error: ${error.message}`);
        }
        return false;
    }
}

/**
 * Checks if a window exists
 * @param {number} windowId - The ID of the window to check
 * @param {string} [context=''] - Optional context string for logging
 * @returns {Promise<boolean>} - True if the window exists, false otherwise
 */
export async function windowExists(windowId, context = '') {
    try {
        await chrome.windows.get(windowId);
        return true;
    } catch (error) {
        if (context) {
            log(`${context}: Window ${windowId} no longer exists. Error: ${error.message}`);
        }
        return false;
    }
}

/**
 * Safely gets a tab or returns null if it doesn't exist
 * @param {number} tabId - The ID of the tab to get
 * @param {string} [context=''] - Optional context string for logging
 * @returns {Promise<chrome.tabs.Tab|null>} - The tab object or null if it doesn't exist
 */
export async function safeGetTab(tabId, context = '') {
    try {
        return await chrome.tabs.get(tabId);
    } catch (error) {
        if (context) {
            log(`${context}: Cannot get tab ${tabId}. Error: ${error.message}`);
        }
        return null;
    }
}

/**
 * Safely gets a window or returns null if it doesn't exist
 * @param {number} windowId - The ID of the window to get
 * @param {string} [context=''] - Optional context string for logging
 * @returns {Promise<chrome.windows.Window|null>} - The window object or null if it doesn't exist
 */
export async function safeGetWindow(windowId, context = '') {
    try {
        return await chrome.windows.get(windowId);
    } catch (error) {
        if (context) {
            log(`${context}: Cannot get window ${windowId}. Error: ${error.message}`);
        }
        return null;
    }
} 