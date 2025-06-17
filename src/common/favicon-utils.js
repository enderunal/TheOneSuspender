/**
 * Favicon discovery utility for dynamically finding favicons
 * without needing to store them in URLs
 */
import * as Logger from './logger.js';

/**
 * Gets the possible favicon URLs for a given domain/URL
 * @param {string} originalUrl - The original URL of the page
 * @returns {string[]} Array of possible favicon URLs to try
 */
export function getFaviconUrls(originalUrl) {
    if (!originalUrl) return [];

    try {
        const url = new URL(originalUrl);
        const baseUrl = `${url.protocol}//${url.hostname}`;

        // Common favicon locations in order of preference
        const faviconUrls = [
            `${baseUrl}/favicon.ico`,
            `${baseUrl}/favicon.png`,
            `${baseUrl}/apple-touch-icon.png`,
            `${baseUrl}/apple-touch-icon-precomposed.png`,
            `${baseUrl}/assets/favicon.ico`,
            `${baseUrl}/assets/favicon.png`,
            `${baseUrl}/assets/img/favicon.ico`,
            `${baseUrl}/assets/img/favicon.png`,
            `${baseUrl}/img/favicon.ico`,
            `${baseUrl}/img/favicon.png`,
            `${baseUrl}/images/favicon.ico`,
            `${baseUrl}/images/favicon.png`,
            `${baseUrl}/static/favicon.ico`,
            `${baseUrl}/static/favicon.png`,
            `${baseUrl}/public/favicon.ico`,
            `${baseUrl}/public/favicon.png`
        ];

        return faviconUrls;
    } catch (error) {
        Logger.logError('Error generating favicon URLs', error, Logger.LogComponent.SUSPENDED);
        return [];
    }
}

/**
 * Attempts to find a working favicon URL by testing multiple possibilities
 * @param {string} originalUrl - The original URL of the page
 * @param {function} callback - Callback function with (faviconUrl) or (null) if none found
 */
export function discoverFavicon(originalUrl, callback) {
    const faviconUrls = getFaviconUrls(originalUrl);

    if (faviconUrls.length === 0) {
        callback(null);
        return;
    }

    let currentIndex = 0;

    const tryNext = () => {
        if (currentIndex >= faviconUrls.length) {
            callback(null);
            return;
        }

        const testUrl = faviconUrls[currentIndex];
        const img = new Image();

        img.onload = () => {
            // Successfully loaded favicon
            Logger.log(`Found favicon at: ${testUrl}`, Logger.LogComponent.SUSPENDED);
            callback(testUrl);
        };

        img.onerror = () => {
            // Try next URL
            currentIndex++;
            tryNext();
        };

        // Set crossOrigin to handle CORS issues
        img.crossOrigin = 'anonymous';
        img.src = testUrl;
    };

    tryNext();
}

/**
 * Extracts favicon URL from HTML content (for future use if needed)
 * @param {string} htmlContent - HTML content to parse
 * @returns {string|null} Favicon URL if found
 */
export function extractFaviconFromHtml(htmlContent) {
    try {
        // Create a temporary DOM element to parse HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        // Try different favicon selectors in order of preference
        const selectors = [
            'link[rel="icon"]',
            'link[rel="shortcut icon"]',
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]'
        ];

        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (element && element.href) {
                return element.href;
            }
        }

        return null;
    } catch (error) {
        Logger.logError('Error extracting favicon from HTML', error, Logger.LogComponent.SUSPENDED);
        return null;
    }
} 