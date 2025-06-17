// theme-injector.js - Immediate theme injection to prevent flash
// This script must run before any CSS is processed

(function () {
    'use strict';

    // Function to apply theme immediately using data attributes
    function injectTheme(theme) {
        // Set the data-theme attribute immediately
        document.documentElement.setAttribute('data-theme', theme);

        // Also set a data attribute for immediate background color
        document.documentElement.setAttribute('data-theme-loading', theme);

        // Set CSS class for immediate styling - preserve existing classes
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

    // Try to get theme from storage and update if different
    try {
        chrome.storage.local.get(['prefs'], function (result) {
            const savedPrefs = result.prefs || {};
            const theme = savedPrefs.theme || 'gold';
            injectTheme(theme);
        });
    } catch (error) {
        console.warn('Failed to load saved theme:', error);
        // Already applied gold theme above
    }
})(); 