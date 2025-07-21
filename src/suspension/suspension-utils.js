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
            let url = urlMatch[1];
            
            // Check if the URL is valid as-is (current format)
            if (url && /^https?:\/\//.test(url)) {
                return { url };
            }
            
            // Backward compatibility: try to decode URL-encoded URLs from old system
            try {
                const decodedUrl = decodeURIComponent(url);
                if (decodedUrl && /^https?:\/\//.test(decodedUrl)) {
                    Logger.log(`getOriginalDataFromUrl: Decoded legacy URL-encoded URL for backward compatibility: ${url} -> ${decodedUrl}`);
                    return { url: decodedUrl };
                }
            } catch (decodeError) {
                Logger.detailedLog(`getOriginalDataFromUrl: Failed to decode URL '${url}': ${decodeError.message}`);
            }
        }

        // fallback to query string for backward compatibility
        const urlObj = new URL(suspendedUrl);
        const qUrl = urlObj.searchParams.get('url');
        if (qUrl && /^https?:\/\//.test(qUrl)) return { url: qUrl };
        
        // Also try to decode query string URL for backward compatibility
        if (qUrl) {
            try {
                const decodedQUrl = decodeURIComponent(qUrl);
                if (decodedQUrl && /^https?:\/\//.test(decodedQUrl)) {
                    Logger.log(`getOriginalDataFromUrl: Decoded legacy URL-encoded query URL for backward compatibility: ${qUrl} -> ${decodedQUrl}`);
                    return { url: decodedQUrl };
                }
            } catch (decodeError) {
                Logger.detailedLog(`getOriginalDataFromUrl: Failed to decode query URL '${qUrl}': ${decodeError.message}`);
            }
        }
        
        return null;
    } catch (e) {
        Logger.logError('getOriginalDataFromUrl', e);
        return null;
    }
}