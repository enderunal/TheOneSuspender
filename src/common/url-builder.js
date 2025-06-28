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
    if (tab.title) params.set("title", tab.title);
    params.set("timestamp", Date.now());
    params.set("url", tab.url);
    urlObj.hash = params.toString();
    Logger.detailedLog(`[TheOneSuspender] Built suspended URL with hash for tab ${tab.id}: ${urlObj.toString()}`);
    return urlObj.toString();
} 