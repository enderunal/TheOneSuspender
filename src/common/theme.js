// theme.js - Theme management for The One Suspender

import * as Prefs from './prefs.js';

// Single storage change listener for all theme changes
let themeChangeCallbacks = [];
let listenerInitialized = false;

/**
 * Initialize the storage change listener (only once)
 */
function initializeStorageListener() {
    if (listenerInitialized) return;

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes[Prefs.PREFS_KEY]) {
            const newPrefs = changes[Prefs.PREFS_KEY].newValue;
            const oldPrefs = changes[Prefs.PREFS_KEY].oldValue;

            if (newPrefs?.theme !== oldPrefs?.theme) {
                const newTheme = newPrefs.theme || 'gold';
                applyTheme(newTheme);

                // Call all registered callbacks
                themeChangeCallbacks.forEach(callback => {
                    try {
                        callback(newTheme);
                    } catch (e) {
                        console.error('Error in theme change callback:', e);
                    }
                });
            }
        }
    });

    listenerInitialized = true;
}

/**
 * Apply theme to the current document
 * @param {string} theme - Theme name (e.g., 'gold', 'silver', etc.)
 */
export function applyTheme(theme) {
    // Update DOM attributes
    document.documentElement.setAttribute('data-theme', theme);

    // Update classes - remove old theme classes and add new one
    const html = document.documentElement;
    html.className = html.className.replace(/theme-\w+(-\w+)*/g, '').trim();
    html.className = html.className ? `${html.className} theme-${theme}` : `theme-${theme}`;

    // Update body classes if body exists
    if (document.body) {
        document.body.className = document.body.className.replace(/theme-\w+(-\w+)*/g, '').trim();
        document.body.className = document.body.className ?
            `${document.body.className} theme-${theme}` : `theme-${theme}`;
    }

    // Cache theme for next page load
    try {
        localStorage.setItem('tos_cached_theme', theme);
    } catch (e) {
        // Ignore localStorage errors
    }
}

/**
 * Initialize theme for any page - this is the only function pages should call
 * @returns {Promise<string>} The applied theme
 */
export async function initializeThemeForPage() {
    try {
        // Get theme from storage
        const result = await chrome.storage.local.get([Prefs.PREFS_KEY]);
        const savedPrefs = result[Prefs.PREFS_KEY] || {};
        const theme = savedPrefs.theme || 'gold';

        // Apply theme
        applyTheme(theme);

        // Initialize the storage listener
        initializeStorageListener();

        return theme;
    } catch (error) {
        console.warn('Failed to initialize theme:', error);
        applyTheme('gold');
        return 'gold';
    }
}

// For backwards compatibility - redirect old functions to the new one
export const loadThemeImmediately = initializeThemeForPage;
export const loadAndApplyTheme = initializeThemeForPage;
export const initTheme = initializeThemeForPage;

// For pages that need to listen to theme changes with custom callback
export function onThemeChange(callback) {
    if (typeof callback === 'function') {
        themeChangeCallbacks.push(callback);
        initializeStorageListener();
    }
} 