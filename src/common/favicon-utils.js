/**
 * Favicon utility for TheOneSuspender
 */
import * as Logger from './logger.js';

/**
 * Constructs a favicon URL
 * @param {string} pageUrl - The URL of the page whose favicon we want
 * @param {number} [size=16] - The size of the favicon (16, 32, etc.)
 * @returns {string} The Chrome favicon API URL
 */
export function buildFaviconUrl(pageUrl, size = 16) {
    if (!pageUrl) return null;

    try {
        const url = new URL(chrome.runtime.getURL("/_favicon/"));
        url.searchParams.set("pageUrl", pageUrl);
        url.searchParams.set("size", size.toString());
        return url.toString();
    } catch (error) {
        Logger.logError('Error building favicon URL', error, Logger.LogComponent.SUSPENDED);
        return null;
    }
}

/**
 * Gets a favicon URL for the given page URL
 * @param {string} originalUrl - The original URL of the page
 * @param {function} callback - Callback function with (faviconUrl) or (null) if none found
 * @param {number} [size=16] - The size of the favicon to retrieve
 */
export function discoverFavicon(originalUrl, callback, size = 16) {
    if (!originalUrl) {
        callback(null);
        return;
    }

    try {
        const faviconUrl = buildFaviconUrl(originalUrl, size);

        if (!faviconUrl) {
            Logger.logWarning(`Failed to build favicon URL for: ${originalUrl}`, Logger.LogComponent.SUSPENDED);
            callback(null);
            return;
        }

        // Test if the favicon loads successfully
        const img = new Image();

        img.onload = () => {
            Logger.log(`Successfully loaded favicon via Chrome API for: ${originalUrl.substring(0, 60)}`, Logger.LogComponent.SUSPENDED);
            callback(faviconUrl);
        };

        img.onerror = () => {
            Logger.logWarning(`Failed to load favicon via Chrome API for: ${originalUrl.substring(0, 60)}`, Logger.LogComponent.SUSPENDED);
            callback(null);
        };

        img.src = faviconUrl;

    } catch (error) {
        Logger.logError('Error discovering favicon via Chrome API', error, Logger.LogComponent.SUSPENDED);
        callback(null);
    }
}