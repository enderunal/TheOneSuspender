/**
 * Constructs the URL for the suspended.html page with essential parameters.
 * 
 * @param {chrome.tabs.Tab} tab - The tab object being suspended.
 * @returns {string} The fully constructed suspended.html URL string.
 */
import { detailedLog } from './logger.js';

export function buildSuspendedUrl(tab) {
    const suspendedUrlBase = chrome.runtime.getURL("suspended.html");
    const urlObj = new URL(suspendedUrlBase);
    const params = new URLSearchParams();

    // Essential parameters only
    params.set('title', tab.title || tab.url || "Tab Suspended");
    params.set('timestamp', Date.now().toString());

    // Original URL - encode consistently
    if (tab.url) {
        try {
            // Ensure it's not double-encoded. Decode first, then re-encode.
            let decodedOriginalUrl = tab.url;
            try { // Attempt to decode if it looks percent-encoded
                if (tab.url.includes('%')) {
                    decodedOriginalUrl = decodeURIComponent(tab.url);
                }
            } catch (e) { /* Ignore decode error, use original if it fails */ }
            params.set('url', encodeURIComponent(decodedOriginalUrl));
        } catch (e) {
            console.error(`[TheOneSuspender] Error encoding original URL for suspension: ${e.message}. Using raw URL as fallback.`);
            params.set('url', tab.url); // Fallback to raw URL
        }
    }

    if (tab.favIconUrl) {
        params.set('fav', tab.favIconUrl);
    }
    urlObj.search = params.toString();

    detailedLog(`[TheOneSuspender] Built simplified suspended URL for tab ${tab.id}: ${urlObj.toString()}`);
    return urlObj.toString();
} 