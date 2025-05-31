/**
 * Constructs the URL for the suspended.html page with essential parameters.
 * 
 * @param {chrome.tabs.Tab} tab - The tab object being suspended.
 * @returns {string} The fully constructed suspended.html URL string.
 */
import * as Logger from './logger.js';

export function buildSuspendedUrl(tab) {
    const suspendedUrlBase = chrome.runtime.getURL("suspended.html");
    const urlObj = new URL(suspendedUrlBase);

    // Build hash with plain original URL and encoded title/fav only as needed
    let hash = "";
    if (tab.title) hash += `title=${encodeURIComponent(tab.title)}&`;
    hash += `timestamp=${Date.now()}`;
    if (tab.favIconUrl) hash += `&fav=${encodeURIComponent(tab.favIconUrl)}`;
    hash += `&url=${tab.url}`;
    urlObj.hash = hash;
    Logger.detailedLog(`[TheOneSuspender] Built suspended URL with hash for tab ${tab.id}: ${urlObj.toString()}`);
    return urlObj.toString();
} 