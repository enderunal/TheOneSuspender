import * as Logger from './logger.js';

export const PREFS_KEY = 'prefs';
export const WHITELIST_KEY = 'whitelist';

/** @type {import('./types.js').Prefs} */
export const defaultPrefs = {
    suspendAfter: 10, // Default suspend time in minutes
    lastPositiveSuspendAfter: 10,
    preserveHistory: true,
    neverSuspendPinned: true,
    neverSuspendAudio: true,
    neverSuspendActive: false,
    neverSuspendLastWindow: true,
    neverSuspendOffline: false,
    unsavedFormHandling: 'ask', // Allowed: 'normal', 'never', 'ask'
    maxConcurrent: 5, // Default maximum concurrent operations
    autoSuspendEnabled: true, // New: allow user to disable auto suspension
    theme: 'gold', // default theme: sophisticated warm gold
    sessionMaxSessions: 10, // Maximum number of sessions to keep
    sessionAutoSaveFrequency: 30, // Auto-save frequency in minutes
    // Logging preferences
    enableStandardLogs: false,
    enableDetailedLogs: false,
    enableWarningLogs: false,
    enableErrorLogs: false
};

/** @type {import('./types.js').Prefs} */
export let prefs = { ...defaultPrefs };
/** @type {string[]} */
export let whitelist = [];

/**
 * Loads preferences and whitelist from chrome.storage.local.
 * Updates the global prefs and whitelist variables.
 * @returns {Promise<void>}
 */
export async function loadPrefs() {
    try {
        const result = await chrome.storage.local.get([PREFS_KEY, WHITELIST_KEY]);

        // Merge stored prefs over defaults, ensuring all keys from defaultPrefs exist.
        const loadedSettings = result.prefs || {};
        prefs = { ...defaultPrefs, ...loadedSettings };

        // Ensure lastPositiveSuspendAfter is sensible
        if (prefs.suspendAfter > 0) {
            prefs.lastPositiveSuspendAfter = prefs.suspendAfter;
        } else if (!prefs.lastPositiveSuspendAfter || prefs.lastPositiveSuspendAfter <= 0) {
            // If current suspendAfter is off, and lastPositive is invalid, reset to default
            prefs.lastPositiveSuspendAfter = defaultPrefs.suspendAfter > 0 ? defaultPrefs.suspendAfter : 1;
        }

        whitelist = Array.isArray(result.whitelist) ? result.whitelist : [];

        Logger.detailedLog("[TheOneSuspender] Prefs loaded:", JSON.stringify(prefs));
        Logger.detailedLog("Whitelist loaded:", whitelist);

        // Update logger configuration with loaded preferences
        Logger.updateLoggingConfig(prefs);
    } catch (error) {
        Logger.logError("Error loading settings from storage", error);
        prefs = { ...defaultPrefs }; // Fallback to defaults on error
        whitelist = [];
        Logger.detailedLog("[TheOneSuspender] Prefs set to default due to error:", JSON.stringify(prefs));
    }
}

/**
 * Validates a prefs object before saving.
 * Throws an error if validation fails.
 * @param {object} prefsToValidate
 */
function validatePrefs(prefsToValidate) {
    // Dynamically derive allowed keys from defaultPrefs
    const allowedKeys = Object.keys(defaultPrefs);
    // Allowed values for unsavedFormHandling
    // Allowed: 'normal', 'never', 'ask'
    const unsavedFormHandlingValues = ['normal', 'never', 'ask'];
    // Check for extra keys
    for (const key of Object.keys(prefsToValidate)) {
        if (!allowedKeys.includes(key)) {
            throw new Error(`Invalid preference key: ${key}`);
        }
    }
    // Type and range checks
    if (typeof prefsToValidate.suspendAfter !== 'number' || prefsToValidate.suspendAfter < 1) {
        throw new Error('suspendAfter must be a number greater than 1');
    }
    if (typeof prefsToValidate.lastPositiveSuspendAfter !== 'number' || prefsToValidate.lastPositiveSuspendAfter < 1) {
        throw new Error('lastPositiveSuspendAfter must be a number >= 1');
    }
    if (typeof prefsToValidate.preserveHistory !== 'boolean') throw new Error('preserveHistory must be boolean');
    if (typeof prefsToValidate.neverSuspendPinned !== 'boolean') throw new Error('neverSuspendPinned must be boolean');
    if (typeof prefsToValidate.neverSuspendAudio !== 'boolean') throw new Error('neverSuspendAudio must be boolean');
    if (typeof prefsToValidate.neverSuspendActive !== 'boolean') throw new Error('neverSuspendActive must be boolean');
    if (typeof prefsToValidate.neverSuspendLastWindow !== 'boolean') throw new Error('neverSuspendLastWindow must be boolean');
    if (typeof prefsToValidate.neverSuspendOffline !== 'boolean') throw new Error('neverSuspendOffline must be boolean');
    // this is not used for now, but might be in the future
    if (typeof prefsToValidate.maxConcurrent !== 'number' || prefsToValidate.maxConcurrent < 1) throw new Error('maxConcurrent must be a number >= 1');
    if (!unsavedFormHandlingValues.includes(prefsToValidate.unsavedFormHandling)) {
        throw new Error('unsavedFormHandling must be one of: normal, never, ask');
    }
    if (typeof prefsToValidate.autoSuspendEnabled !== 'boolean') throw new Error('autoSuspendEnabled must be boolean');
    if (typeof prefsToValidate.sessionMaxSessions !== 'number' || prefsToValidate.sessionMaxSessions < 1) {
        throw new Error('sessionMaxSessions must be a number greater than 1');
    }
    if (typeof prefsToValidate.sessionAutoSaveFrequency !== 'number' || prefsToValidate.sessionAutoSaveFrequency < 1 || prefsToValidate.sessionAutoSaveFrequency > 1440) {
        throw new Error('sessionAutoSaveFrequency must be a number between 1 and 1440 minutes (24 hours)');
    }
    // Validate logging preferences
    if (typeof prefsToValidate.enableStandardLogs !== 'boolean') throw new Error('enableStandardLogs must be boolean');
    if (typeof prefsToValidate.enableDetailedLogs !== 'boolean') throw new Error('enableDetailedLogs must be boolean');
    if (typeof prefsToValidate.enableWarningLogs !== 'boolean') throw new Error('enableWarningLogs must be boolean');
    if (typeof prefsToValidate.enableErrorLogs !== 'boolean') throw new Error('enableErrorLogs must be boolean');
}

/**
 * Saves the provided preferences object to chrome.storage.local and updates the global prefs variable.
 * Assumes newPrefs is a complete, validated preferences object.
 * @param {import('./types.js').Prefs} newPrefsToSave - The complete preferences object to save.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function savePrefs(newPrefsToSave) {
    try {
        if (!newPrefsToSave || typeof newPrefsToSave !== 'object') {
            throw new Error("Invalid settings object provided to savePrefs");
        }

        // Create the complete preferences object for saving to storage
        let completePrefsToSave = { ...defaultPrefs, ...newPrefsToSave };

        // Update lastPositiveSuspendAfter logic before saving
        if (completePrefsToSave.suspendAfter > 0) {
            completePrefsToSave.lastPositiveSuspendAfter = completePrefsToSave.suspendAfter;
        } else {
            // If suspendAfter is being set to 0 or less (i.e., turning off auto-suspend),
            // ensure lastPositiveSuspendAfter retains its current valid value (from loaded prefs or previous save)
            // or falls back to a default if it's somehow invalid.
            const currentLoadedPositive = prefs.lastPositiveSuspendAfter > 0 ? prefs.lastPositiveSuspendAfter : defaultPrefs.suspendAfter;
            completePrefsToSave.lastPositiveSuspendAfter = currentLoadedPositive > 0 ? currentLoadedPositive : 1;
        }

        // Validate before saving
        validatePrefs(completePrefsToSave);

        await chrome.storage.local.set({ [PREFS_KEY]: completePrefsToSave });

        // After saving, reload preferences from storage to update global state
        await loadPrefs();
        Logger.log("Preferences saved and reloaded:", prefs);
        return true;
    } catch (error) {
        Logger.logError("Error saving preferences", error);
        throw error; // Re-throw to allow caller to handle
    }
}

/**
 * Saves the current whitelist to chrome.storage.local.
 * @param {string[]} newWhitelistArray - The whitelist array to save.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function saveWhitelist(newWhitelistArray) {
    Logger.detailedLog("saveWhitelist in prefs.js called with:", newWhitelistArray);

    if (!Array.isArray(newWhitelistArray)) {
        const err = new Error("saveWhitelist: Provided whitelist is not an array");
        Logger.logError("saveWhitelist validation", err);
        throw err;
    }

    try {
        await chrome.storage.local.set({ [WHITELIST_KEY]: newWhitelistArray });

        // Update the global whitelist array by replacing its contents.
        whitelist.length = 0;
        newWhitelistArray.forEach(item => whitelist.push(String(item).trim())); // Ensure items are strings and trimmed

        Logger.log("Whitelist saved:", whitelist);
        return true;
    } catch (error) {
        Logger.logError("Error saving whitelist", error);
        throw error;
    }
} 