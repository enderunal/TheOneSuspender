// theme.js - Shared theme utility for The One Suspender

import * as Prefs from './prefs.js';

/**
 * Apply theme to the current document
 * @param {string} theme - 'light' or 'dark'
 */
export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Load and apply the saved theme preference
 * @returns {Promise<string>} The applied theme
 */
export async function loadAndApplyTheme() {
    try {
        // Load preferences to get the theme
        await Prefs.loadPrefs();
        const theme = Prefs.prefs.theme || 'light';
        applyTheme(theme);
        return theme;
    } catch (error) {
        console.warn('Failed to load theme preference, using light theme:', error);
        applyTheme('light');
        return 'light';
    }
}

/**
 * Initialize theme for a page - call this on DOMContentLoaded
 * @returns {Promise<string>} The applied theme
 */
export async function initTheme() {
    return await loadAndApplyTheme();
}

/**
 * Listen for theme changes from other pages/options
 * @param {function} callback - Function to call when theme changes
 */
export function onThemeChange(callback) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes[Prefs.PREFS_KEY]) {
            const newPrefs = changes[Prefs.PREFS_KEY].newValue;
            const oldPrefs = changes[Prefs.PREFS_KEY].oldValue;

            if (newPrefs?.theme !== oldPrefs?.theme) {
                const newTheme = newPrefs.theme || 'light';
                applyTheme(newTheme);
                if (callback) callback(newTheme);
            }
        }
    });
}

/**
 * Common initialization method for all pages
 * Initializes theme and sets up change listener with console logging
 * @returns {Promise<string>} The applied theme
 */
export async function initializeThemeForPage() {
    // Initialize theme first
    const theme = await initTheme();

    // Listen for theme changes with standard logging
    onThemeChange((newTheme) => {
        console.log('Theme changed to:', newTheme);
    });

    return theme;
} 