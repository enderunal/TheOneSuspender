/**
 * Favicon utility for TheOneSuspender
 */
import * as Logger from './logger.js';

const FAVICON_CACHE_KEY = 'TS_favicon_cache_v1';
const MAX_CACHE_ENTRIES = 4000;

function getHostname(url) {
    try { return new URL(url).hostname; } catch { return null; }
}

async function loadCache() {
    try {
        const result = await chrome.storage.local.get([FAVICON_CACHE_KEY]);
        const cache = result[FAVICON_CACHE_KEY] || {};
        return cache;
    } catch (e) {
        Logger.logError('Failed to load favicon cache', e, Logger.LogComponent.SUSPENDED);
        return {};
    }
}

async function saveCache(cache) {
    try {
        // Trim if too large
        const keys = Object.keys(cache);
        if (keys.length > MAX_CACHE_ENTRIES) {
            const toRemove = keys.slice(0, keys.length - MAX_CACHE_ENTRIES);
            for (const k of toRemove) delete cache[k];
        }
        await chrome.storage.local.set({ [FAVICON_CACHE_KEY]: cache });
    } catch (e) {
        Logger.logError('Failed to save favicon cache', e, Logger.LogComponent.SUSPENDED);
    }
}

/**
 * Constructs a favicon URL using Chrome extension API
 * @param {string} pageUrl - The URL of the page whose favicon we want
 * @param {number} [size=16] - The size of the favicon (16, 32, etc.)
 * @returns {string} The Chrome extension favicon API URL
 */
export function buildChromeExtensionFaviconUrl(pageUrl, size = 16) {
    if (!pageUrl) return null;

    try {
        const url = new URL(chrome.runtime.getURL("/_favicon/"));
        url.searchParams.set("pageUrl", pageUrl);
        url.searchParams.set("size", size.toString());
        return url.toString();
    } catch (error) {
        Logger.logError('Error building Chrome extension favicon URL', error, Logger.LogComponent.SUSPENDED);
        return null;
    }
}

/**
 * Attempts to get favicon from direct URLs and external services
 * @param {string} originalUrl - The original URL of the page
 * @returns {Promise<string|null>} Direct favicon URL if found, null otherwise
 */
export async function getFaviconFromDirectSources(originalUrl) {
    if (!originalUrl) return null;

    try {
        const url = new URL(originalUrl);
        const hostname = url.hostname;
        const baseUrl = `${url.protocol}//${hostname}`;

        // Try direct favicon paths first
        const directPaths = [
            `${baseUrl}/favicon.ico`,
            `${baseUrl}/favicon.png`,
            `${baseUrl}/apple-touch-icon.png`
        ];

        for (const faviconPath of directPaths) {
            try {
                const isAvailable = await testDirectFavicon(faviconPath);
                if (isAvailable) {
                    Logger.log(`Found direct favicon at: ${faviconPath}`, Logger.LogComponent.SUSPENDED);
                    return faviconPath;
                }
            } catch (e) {
                Logger.logError(`Error testing direct favicon: ${faviconPath}`, e, Logger.LogComponent.SUSPENDED);
                // Continue to next path
            }
        }

        // Try external favicon services as fallback
        const externalServices = [
            `https://www.google.com/s2/favicons?domain_url=${hostname}`,
            `https://icons.duckduckgo.com/ip2/${hostname}.ico`,
            `https://favicon.yandex.net/favicon/${hostname}/`
        ];

        for (const serviceUrl of externalServices) {
            try {
                const isAvailable = await testDirectFavicon(serviceUrl);
                if (isAvailable) {
                    Logger.log(`Found favicon from external service: ${serviceUrl}`, Logger.LogComponent.SUSPENDED);
                    return serviceUrl;
                }
            } catch (e) {
                Logger.logError(`Error testing external favicon: ${serviceUrl}`, e, Logger.LogComponent.SUSPENDED);
                // Continue to next service
            }
        }

        return null;
    } catch (error) {
        Logger.logError('Error getting favicon from direct sources', error, Logger.LogComponent.SUSPENDED);
        return null;
    }
}

/**
 * Tests if a direct favicon URL is accessible
 * @param {string} faviconUrl - The URL to test
 * @returns {Promise<boolean>} True if accessible, false otherwise
 */
function testDirectFavicon(faviconUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // Check if it's actually a favicon and not a 404 page or generic image
            if (img.width > 0 && img.height > 0 && img.width <= 256 && img.height <= 256) {
                resolve(true);
            } else {
                resolve(false);
            }
        };
        img.onerror = () => resolve(false);
        img.src = faviconUrl;

        // Timeout after 3 seconds
        setTimeout(() => resolve(false), 3000);
    });
}

/**
 * Processes any favicon URL to apply grayscale and opacity effects with caching
 * @param {string} faviconUrl - The favicon URL (Chrome API, direct, or external service)
 * @param {string} originalUrl - The original page URL for cache key generation
 * @returns {Promise<string|null>} Processed data URL or null if processing fails
 */
export async function processAnyFaviconUrl(faviconUrl, originalUrl = null) {
    if (!faviconUrl) return null;

    try {
        const img = await loadImageWithCrossOrigin(faviconUrl);

        // Create canvas and apply grayscale + opacity effect
        const canvas = document.createElement('canvas');
        const size = 16;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            Logger.logWarning('Failed to get canvas context for favicon processing', Logger.LogComponent.SUSPENDED);
            return faviconUrl; // Return original if processing fails
        }

        // Apply the same grayscale and opacity effect as before
        ctx.filter = 'grayscale(60%) opacity(50%)';
        ctx.drawImage(img, 0, 0, size, size);

        const processedDataUrl = canvas.toDataURL();

        // Cache the result if we have originalUrl and got a data URL
        if (originalUrl && processedDataUrl.startsWith('data:')) {
            const hostname = getHostname(originalUrl);
            if (hostname) {
                const cache = await loadCache();
                cache[hostname] = processedDataUrl;
                await saveCache(cache);
                Logger.log(`Cached processed favicon for ${hostname}`, Logger.LogComponent.SUSPENDED);
            }
        }

        return processedDataUrl;

    } catch (error) {
        Logger.logWarning(`Failed to process favicon ${faviconUrl}, using original: ${error.message}`, Logger.LogComponent.SUSPENDED);
        return faviconUrl; // Return original URL if processing fails
    }
}

/**
 * Loads an image with proper cross-origin handling
 * @param {string} src - Image source URL
 * @returns {Promise<HTMLImageElement>} Loaded image
 */
function loadImageWithCrossOrigin(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => {
            Logger.logError(`Failed to load image: ${src}`, e, Logger.LogComponent.SUSPENDED);
            reject(new Error('Failed to load image'));
        };
        try {
            Logger.log(`Loading image with crossOrigin: ${img.crossOrigin}`, Logger.LogComponent.SUSPENDED);
            // Set crossOrigin for external URLs to avoid CORS taint
            if (src.startsWith('https://') && !src.includes(chrome.runtime.id)) {
                try {
                    img.crossOrigin = 'anonymous';
                } catch (e) {
                    Logger.logError(`Failed to set crossOrigin for image: ${src}`, e, Logger.LogComponent.SUSPENDED);
                }
            }
            Logger.log(`Loaded image with crossOrigin: ${img.crossOrigin}`, Logger.LogComponent.SUSPENDED);
        } catch (e) {
            Logger.logError(`Error during crossOrigin assignment for image: ${src}`, e, Logger.LogComponent.SUSPENDED);
        }
        img.src = src;
    });
}

/**
 * Gets the suspended favicon for a URL, using cache, Chrome API, direct, and external sources.
 * Always returns a processed (grayscale) data URL or fallback icon.
 * @param {string} originalUrl
 * @returns {Promise<string>} data URL or fallback icon path
 */
export async function getOrCreateSuspendedFavicon(originalUrl) {
    if (!originalUrl) return 'icons/icon16.png';
    const hostname = getHostname(originalUrl);
    if (!hostname) return 'icons/icon16.png';
    const cache = await loadCache();
    if (cache[hostname]) {
        Logger.log(`Favicon cache hit for ${hostname}`, Logger.LogComponent.SUSPENDED);
        return cache[hostname];
    }
    // Try Chrome API
    const chromeApiFaviconUrl = buildChromeExtensionFaviconUrl(originalUrl, 16);
    if (chromeApiFaviconUrl) {
        try {
            const testImg = await loadImageWithCrossOrigin(chromeApiFaviconUrl);
            // If not globe icon, process and cache
            if (testImg.naturalWidth > 16 || testImg.naturalHeight > 16 || testImg.src.includes('data:image')) {
                const processed = await processAnyFaviconUrl(chromeApiFaviconUrl, originalUrl);
                if (processed && processed.startsWith('data:')) {
                    Logger.log(`Favicon processed and cached for ${hostname} (Chrome API)`, Logger.LogComponent.SUSPENDED);
                    return processed;
                }
            }
        } catch (e) {
            Logger.logError(`Error in Chrome API favicon pipeline for ${originalUrl} (url: ${chromeApiFaviconUrl})`, e, Logger.LogComponent.SUSPENDED);
            // Ignore and try next
        }
    }
    // Try direct/external sources
    const altFaviconUrl = await getFaviconFromDirectSources(originalUrl);
    if (altFaviconUrl) {
        try {
            const processed = await processAnyFaviconUrl(altFaviconUrl, originalUrl);
            if (processed && processed.startsWith('data:')) {
                Logger.log(`Favicon processed and cached for ${hostname} (external)`, Logger.LogComponent.SUSPENDED);
                return processed;
            }
        } catch (e) {
            Logger.logError(`Error in external favicon pipeline for ${originalUrl} (url: ${altFaviconUrl})`, e, Logger.LogComponent.SUSPENDED);
            // Ignore and fallback
        }
    }
    Logger.logWarning(`Favicon fallback for ${hostname}`, Logger.LogComponent.SUSPENDED);
    return 'icons/icon16.png';
}

