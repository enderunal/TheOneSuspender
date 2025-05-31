import * as Logger from '../common/logger.js';


/**
 * Utility to extract original tab data from suspended page URL
 * @param {string} suspendedUrl - The URL of the suspended page
 * @returns {Object|null} The original tab data or null
 */
export function getOriginalDataFromUrl(suspendedUrl) {
    try {
        // Try to parse from hash first (new format)
        const hash = suspendedUrl.split('#')[1] || '';
        const hashParams = {};
        for (const part of hash.split('&')) {
            const [key, ...rest] = part.split('=');
            if (key) hashParams[key] = rest.join('=');
        }
        if (hashParams.url) return { url: hashParams.url };
        // Fallback to old query param method
        const url = new URL(suspendedUrl);
        const encodedOriginalUrl = url.searchParams.get('url');
        if (!encodedOriginalUrl) return null;
        let originalUrl = encodedOriginalUrl;
        try {
            if (encodedOriginalUrl.includes('%')) {
                originalUrl = decodeURIComponent(encodedOriginalUrl);
            }
        } catch (e) { /* ignore decode error, use as-is */ }
        return {
            url: originalUrl,
        };
    } catch (e) {
        Logger.logError('getOriginalDataFromUrl', e);
        return null;
    }
}