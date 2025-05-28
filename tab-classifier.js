// tab-classifier.js
import { log, detailedLog, logError, withErrorHandling } from './logger.js';
import { prefs, whitelist } from './prefs.js';
import * as State from './state.js';
import * as Const from './constants.js';

const ALLOWED_PROTOCOLS = ["http:", "https:"];

/**
 * Determines if a URL is from an allowed protocol (http/https)
 * @param {string} url - URL to check
 * @returns {boolean} - Whether the URL is from an allowed protocol
 */
export function isAllowedProtocol(url) {
    if (!url) return false;
    try {
        const urlObj = new URL(url);
        return ALLOWED_PROTOCOLS.includes(urlObj.protocol);
    } catch (e) {
        // If URL construction fails, it's not a valid URL
        return false;
    }
}

/**
 * Escapes special regex characters but preserves wildcards (*) for pattern matching
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string with wildcards preserved for regex
 */
function escapeRegexButPreserveWildcards(str) {
    // First escape special regex characters
    return str.replace(/[\[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
}

/**
 * Checks if the URL matches any whitelist pattern.
 * @param {string} url - The URL to check.
 * @returns {Promise<string|null>} The matched pattern or null if no match.
 */
export async function isUrlWhitelisted(url) {
    if (!url) return null;

    try {
        // Parse URL or exit early
        let hostname;
        try {
            hostname = new URL(url).hostname;
        } catch {
            return null;
        }

        // Use in-memory whitelist from prefs.js instead of fetching from storage each time
        // This is more efficient for high-frequency calls
        if (!Array.isArray(whitelist) || whitelist.length === 0) {
            return null;
        }

        // Check for global wildcard
        if (whitelist.includes('*')) {
            return '*';
        }

        // Find matching pattern
        const match = whitelist.find(pattern => {
            if (!pattern || pattern.trim() === '') return false;

            // Direct matches
            if (pattern === url) return true;

            // Domain matches
            if (hostname === pattern || hostname.endsWith(`.${pattern}`)) return true;

            // Wildcard matching with proper escaping and anchoring
            if (pattern.includes('*')) {
                const regexPattern = new RegExp('^' + escapeRegexButPreserveWildcards(pattern) + '$');
                return regexPattern.test(url);
            }

            // Substring match - disabled to avoid accidental broad matches
            // return url.includes(pattern);

            return false;
        });

        return match || null;
    } catch (e) {
        logError(`Error in isUrlWhitelisted: ${e.message}`);
        return null;
    }
}

/**
 * Checks if a tab should be skipped for suspension based on its properties and current preferences.
 * Uses early returns for each check to improve readability.
 * 
 * @param {chrome.tabs.Tab} tab - The tab object to check.
 * @param {boolean} [debug=false] - Whether to return reason for debugging.
 * @returns {Promise<string|boolean>} 
 *   - When debug=false: boolean - true if tab should be skipped, false if it can be suspended.
 *   - When debug=true: string - reason why tab should be skipped, or false if it can be suspended.
 */
export async function shouldSkipTab(tab, debug = false) {
    const skip = (reason) => debug ? reason : true;

    // Basic tab validation
    if (!tab) {
        return skip("tab is null");
    }

    if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE) {
        return skip("no valid tabId");
    }

    // URL checks
    if (!tab.url) {
        return skip("no url");
    }

    if (!isAllowedProtocol(tab.url)) {
        return skip("special url");
    }

    if (tab.url.toLowerCase().startsWith(chrome.runtime.getURL(Const.SUSPENDED_PAGE_PATH).toLowerCase())) {
        return skip("already suspended");
    }

    // Preference-based checks
    if (prefs.neverSuspendPinned && tab.pinned) {
        return skip("pinned tab");
    }

    if (prefs.neverSuspendAudio && tab.audible) {
        return skip("playing audio");
    }

    if (prefs.neverSuspendOffline && State.isOffline()) {
        return skip("browser is offline");
    }

    if (prefs.neverSuspendActive && tab.active) {
        return skip("active in window");
    }

    // Last focused window check
    if (prefs.neverSuspendLastWindow && tab.active &&
        tab.windowId === State.getLastFocusedWindow()) {
        return skip("active in last focused window");
    }

    // Whitelist check
    try {
        const matchedPattern = await isUrlWhitelisted(tab.url);
        if (matchedPattern) {
            return skip(`URL matches whitelist pattern: ${matchedPattern}`);
        }
    } catch (e) {
        logError(`Error checking whitelist: ${e.message}`);
    }

    // If we reach here, no reason to skip was found
    return false;
}