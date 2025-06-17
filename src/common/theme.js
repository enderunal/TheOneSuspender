// theme.js - Shared theme utility for The One Suspender

import * as Prefs from './prefs.js';

/**
 * Apply theme to the current document
 * @param {string} theme - Material Design color palette name
 */
export function applyTheme(theme) {
    // Set the data-theme attribute immediately
    document.documentElement.setAttribute('data-theme', theme);

    // Also set a data attribute for immediate background color
    document.documentElement.setAttribute('data-theme-loading', theme);

    // Update CSS class for immediate styling - preserve existing classes
    const htmlElement = document.documentElement;
    const currentClasses = htmlElement.className;
    const newClasses = currentClasses.replace(/theme-\w+(-\w+)*/g, '').trim();
    htmlElement.className = newClasses ? `${newClasses} theme-${theme}` : `theme-${theme}`;

    // Update body class as well for additional coverage - preserve existing classes
    if (document.body) {
        const bodyClasses = document.body.className;
        const newBodyClasses = bodyClasses.replace(/theme-\w+(-\w+)*/g, '').trim();
        document.body.className = newBodyClasses ? `${newBodyClasses} theme-${theme}` : `theme-${theme}`;
    }
}

/**
 * Load theme immediately using synchronous storage access
 * This should be called as early as possible to prevent theme flash
 * @returns {Promise<string>} The applied theme
 */
export async function loadThemeImmediately() {
    try {
        // Use chrome.storage.local.get directly for faster access
        const result = await chrome.storage.local.get([Prefs.PREFS_KEY]);
        const savedPrefs = result[Prefs.PREFS_KEY] || {};
        const theme = savedPrefs.theme || 'gold';
        applyTheme(theme);
        return theme;
    } catch (error) {
        console.warn('Failed to load theme immediately, using gold theme:', error);
        applyTheme('gold');
        return 'gold';
    }
}

/**
 * Load and apply the saved theme preference
 * @returns {Promise<string>} The applied theme
 */
export async function loadAndApplyTheme() {
    try {
        // Load preferences to get the theme
        await Prefs.loadPrefs();
        const theme = Prefs.prefs.theme || 'gold';
        applyTheme(theme);
        return theme;
    } catch (error) {
        console.warn('Failed to load theme preference, using gold theme:', error);
        applyTheme('gold');
        return 'gold';
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
                const newTheme = newPrefs.theme || 'gold';
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
    // Use immediate theme loading for faster application
    const theme = await loadThemeImmediately();

    // Listen for theme changes with standard logging
    onThemeChange((newTheme) => {
        console.log('Theme changed to:', newTheme);
    });

    return theme;
} 