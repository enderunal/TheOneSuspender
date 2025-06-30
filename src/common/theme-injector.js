// theme-injector.js - Minimal immediate theme injection to prevent flash
// This script runs synchronously before any CSS is processed

(function () {
    'use strict';

    // Apply theme from localStorage cache or default
    const theme = localStorage.getItem('tos_cached_theme') || 'gold';

    // Set essential attributes for immediate rendering
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme-loading', theme);
    document.documentElement.className = 'theme-' + theme;
})(); 