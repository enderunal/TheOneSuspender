/**
 * Utility functions for manipulating and checking whitelist entries.
 * All functions are pure and do not interact with storage directly.
 */

import { SUSPENDED_PAGE_PATH } from './constants.js';

/**
 * Parse a whitelist string (textarea value) into a clean array of entries.
 * Sanitizes input: removes entries with dangerous characters (<, >, ", ', `, ;, etc).
 * Only allows valid domain names or URLs.
 * @param {string} text - Multiline string from textarea.
 * @returns {string[]} Array of trimmed, non-empty, sanitized entries.
 */
export function parseWhitelistText(text) {
    const dangerousPattern = /[<>"'`;]/;
    return text
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
        .filter(entry => !dangerousPattern.test(entry))
        .filter(entry => isValidDomain(entry) || isValidUrl(entry));
}

// Helper: validate domain
function isValidDomain(domain) {
    // Simple regex for domain validation
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}
// Helper: validate URL
function isValidUrl(url) {
    try { new URL(url); return true; } catch { return false; }
}

/**
 * Add an entry (URL or domain) to a whitelist array if not already present.
 * @param {string[]} whitelistArr - Current whitelist array.
 * @param {string} entry - Entry to add.
 * @returns {string[]} New whitelist array with entry added if not present.
 */
export function addToWhitelist(whitelistArr, entry) {
    if (!entry || whitelistArr.includes(entry)) return whitelistArr.slice();
    return [...whitelistArr, entry];
}

/**
 * Remove an entry (URL or domain) from a whitelist array.
 * @param {string[]} whitelistArr - Current whitelist array.
 * @param {string} entry - Entry to remove.
 * @returns {string[]} New whitelist array with entry removed.
 */
export function removeFromWhitelist(whitelistArr, entry) {
    return whitelistArr.filter(item => item !== entry);
}

/**
 * Check if an entry (URL or domain) is in the whitelist array.
 * @param {string[]} whitelistArr - Current whitelist array.
 * @param {string} entry - Entry to check.
 * @returns {boolean} True if entry is present.
 */
export function isWhitelisted(whitelistArr, entry) {
    return whitelistArr.includes(entry);
}

/**
 * Resolves the real URL for a tab, handling the case where the tab is a suspended placeholder.
 * @param {chrome.tabs.Tab} tab - The tab object.
 * @returns {Promise<string|null>} The real URL, or null if not found.
 */
export async function resolveTabUrl(tab) {
    if (!tab?.url) return null;
    const suspendedPageBase = chrome.runtime.getURL(SUSPENDED_PAGE_PATH);
    // Check if the tab.url starts with the base suspended page URL, ignoring query params for this check
    if (tab.url.startsWith(suspendedPageBase)) {
        try {
            const urlParams = new URLSearchParams(new URL(tab.url).search);
            const originalEncodedUrl = urlParams.get('url');
            if (originalEncodedUrl) {
                return decodeURIComponent(originalEncodedUrl);
            }
            return null; // No 'url' parameter found
        } catch (e) {
            // Log error or handle appropriately if URL parsing fails
            console.error("[TheOneSuspender whitelist-utils] Error parsing suspended tab URL:", e);
            return null;
        }
    }
    return tab.url;
} 