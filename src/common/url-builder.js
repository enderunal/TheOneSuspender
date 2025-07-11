/**
 * Constructs the URL for the suspended.html page with essential parameters.
 * 
 * @param {chrome.tabs.Tab} tab - The tab object being suspended.
 * @returns {string} The fully constructed suspended.html URL string.
 */
import * as Logger from './logger.js';

export function buildSuspendedUrl(tab) {
    if (!tab.url || typeof tab.url !== 'string') throw new Error('Invalid tab.url');
    const suspendedUrlBase = chrome.runtime.getURL("suspended.html");
    const urlObj = new URL(suspendedUrlBase);
    const params = new URLSearchParams();

    // Add encoded parameters first
    if (tab.title) params.set("title", tab.title);
    params.set("timestamp", Date.now());
    if (tab.favIconUrl) params.set("favicon", tab.favIconUrl);

    // Build the hash with original URL at the end as clear text (not encoded)
    let hashString = params.toString();
    hashString += `&url=${tab.url}`;

    urlObj.hash = hashString;
    Logger.detailedLog(`[TheOneSuspender] Built suspended URL with hash for tab ${tab.id}: ${urlObj.toString()}`);
    return urlObj.toString();
} 