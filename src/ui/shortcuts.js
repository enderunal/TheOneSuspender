// shortcuts.js - Keyboard shortcuts configuration page
import * as Logger from '../common/logger.js';
import * as Prefs from '../common/prefs.js';

document.addEventListener("DOMContentLoaded", async () => {
    Logger.log("Shortcuts page loaded", Logger.LogComponent.UI);

    try {
        // Load preferences to apply theme
        await Prefs.loadPrefs();
        applyTheme();

        // Load and display current shortcuts
        await loadCurrentShortcuts();

        // Set up event listeners
        setupEventListeners();

    } catch (error) {
        Logger.logError("Error initializing shortcuts page", error, Logger.LogComponent.UI);
        showError("Failed to load shortcuts configuration");
    }
});

/**
 * Apply the current theme to the page
 */
function applyTheme() {
    const theme = Prefs.prefs.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    Logger.detailedLog(`Applied theme: ${theme}`, Logger.LogComponent.UI);
}

/**
 * Load and display current keyboard shortcuts
 */
async function loadCurrentShortcuts() {
    try {
        const commands = await chrome.commands.getAll();
        Logger.detailedLog("Loaded commands:", Logger.LogComponent.UI, commands);

        // Update the display for each command
        commands.forEach(command => {
            const shortcutElement = document.querySelector(`[data-command="${command.name}"]`);
            if (shortcutElement) {
                const keyDisplay = shortcutElement.querySelector('.key-display');
                if (keyDisplay) {
                    if (command.shortcut) {
                        keyDisplay.textContent = command.shortcut;
                        keyDisplay.classList.remove('not-set');
                    } else {
                        keyDisplay.textContent = 'Not set';
                        keyDisplay.classList.add('not-set');
                    }
                }
            }
        });

        Logger.log("Current shortcuts loaded and displayed", Logger.LogComponent.UI);
    } catch (error) {
        Logger.logError("Error loading current shortcuts", error, Logger.LogComponent.UI);
        showError("Failed to load current shortcuts");
    }
}

/**
 * Set up event listeners for the shortcuts page
 */
function setupEventListeners() {
    // Add click listeners to all "Change" buttons
    const changeButtons = document.querySelectorAll('.change-shortcut-btn');
    changeButtons.forEach(button => {
        button.addEventListener('click', handleChangeShortcut);
    });

    Logger.log("Event listeners set up for shortcuts page", Logger.LogComponent.UI);
}

/**
 * Handle changing a keyboard shortcut
 */
function handleChangeShortcut(event) {
    const button = event.target;
    const shortcutElement = button.closest('.shortcut-key');
    const command = shortcutElement.getAttribute('data-command');

    Logger.log(`Opening Chrome shortcuts page for command: ${command}`, Logger.LogComponent.UI);

    // Open Chrome's extensions shortcuts page
    chrome.tabs.create({
        url: 'chrome://extensions/shortcuts'
    });
}

/**
 * Show an error message
 */
function showError(message) {
    Logger.logError("Shortcuts page error", message, Logger.LogComponent.UI);

    // Create error element if it doesn't exist
    let errorElement = document.getElementById('error-message');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = 'error-message';
        errorElement.className = 'error-message';
        document.querySelector('.container').prepend(errorElement);
    }

    errorElement.textContent = message;
    errorElement.style.display = 'block';

    // Hide error after 5 seconds
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

/**
 * Refresh shortcuts display when the page gains focus
 * (in case user changed shortcuts in chrome://extensions/shortcuts)
 */
window.addEventListener('focus', async () => {
    Logger.detailedLog("Shortcuts page gained focus, refreshing shortcuts display", Logger.LogComponent.UI);
    await loadCurrentShortcuts();
});

// Also listen for visibility changes
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
        Logger.detailedLog("Shortcuts page became visible, refreshing shortcuts display", Logger.LogComponent.UI);
        await loadCurrentShortcuts();
    }
}); 