/**
 * Favicon utility for TheOneSuspender
 */
import * as Logger from './logger.js';

const FAVICON_CACHE_KEY = 'TS_favicon_cache_v1';
const MAX_CACHE_ENTRIES = 5000;

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
export async function discoverFavicon(originalUrl, callback, size = 16) {
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

/**
 * Returns a processed (grayscale + opacity) favicon data URL for a page.
 * Uses Chrome's internal _favicon endpoint to avoid CORS tainting and caches results by hostname.
 * @param {string} originalUrl
 * @returns {Promise<string|null>} data URL or null
 */
export async function getProcessedFaviconDataUrl(originalUrl) {
    const hostname = getHostname(originalUrl);
    if (!hostname) return null;

    // Try cache first
    const cache = await loadCache();
    if (cache[hostname]) {
        return cache[hostname];
    }

    // Stagger to avoid thundering herd after browser restart
    try {
        const delayMs = Math.floor(Math.random() * 800);
        await new Promise(r => setTimeout(r, delayMs));
    } catch { }

    // Try multiple sizes and a couple retries
    const sizes = [32, 16, 64];
    for (const size of sizes) {
        const url = buildFaviconUrl(originalUrl, size);
        if (!url) continue;

        const dataUrl = await loadAndProcess(url);
        if (dataUrl) {
            cache[hostname] = dataUrl;
            await saveCache(cache);
            return dataUrl;
        }
    }
    return null;
}

async function loadAndProcess(imageUrl) {
    try {
        const img = await loadImage(imageUrl);
        try {
            const canvas = document.createElement('canvas');
            const size = 16;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.filter = 'grayscale(60%) opacity(50%)';
            ctx.drawImage(img, 0, 0, size, size);
            return canvas.toDataURL();
        } catch (e) {
            Logger.logWarning('Canvas processing failed for favicon', Logger.LogComponent.SUSPENDED, e);
            return null;
        }
    } catch (e) {
        return null;
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image error'));
        // _favicon endpoint is extension-origin; no crossOrigin needed
        img.src = src;
    });
}