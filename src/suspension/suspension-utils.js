import * as Logger from '../common/logger.js';


/**
 * Utility to extract original tab data from suspended page URL
 * @param {string} suspendedUrl - The URL of the suspended page
 * @returns {Object|null} The original tab data or null
 */
export function getOriginalDataFromUrl(suspendedUrl) {
    try {
        const hash = suspendedUrl.split('#')[1] || '';

        // Extract URL from the end since it's unencoded and may contain & characters
        // This matches the same logic used in suspended.js
        const urlMatch = hash.match(/&url=(.+)$/);
        if (urlMatch) {
            const url = urlMatch[1];
            if (url && /^https?:\/\//.test(url)) {
                return { url };
            }
        }

        // fallback to query string for backward compatibility
        const urlObj = new URL(suspendedUrl);
        const qUrl = urlObj.searchParams.get('url');
        if (qUrl && /^https?:\/\//.test(qUrl)) return { url: qUrl };
        return null;
    } catch (e) {
        Logger.logError('getOriginalDataFromUrl', e);
        return null;
    }
}