import { logError } from './logger.js';


/**
 * Utility to extract original tab data from suspended page URL
 * @param {string} suspendedUrl - The URL of the suspended page
 * @returns {Object|null} The original tab data or null
 */
export function getOriginalDataFromUrl(suspendedUrl) {
    try {
        const url = new URL(suspendedUrl);
        const encodedOriginalUrl = url.searchParams.get('url');
        if (!encodedOriginalUrl) return null;
        return {
            url: decodeURIComponent(encodedOriginalUrl),
        };
    } catch (e) {
        logError('getOriginalDataFromUrl', e);
        return null;
    }
}