// ===================== Imports =====================
import * as Logger from '../common/logger.js';
import * as Prefs from '../common/prefs.js';
import * as Const from '../common/constants.js';
import * as State from '../common/state.js';

import * as Scheduling from './scheduling.js';
import * as Listeners from './listeners.js';

Logger.log("Starting TheOneSuspender Service Worker...", Logger.LogComponent.BACKGROUND);

// ===================== Simple Initialization =====================
async function initialize() {
    Logger.log("Initializing extension...", Logger.LogComponent.BACKGROUND);

    try {
        // Initialize logging
        await Logger.initializeLogging();

        // Load preferences
        Logger.log("Loading preferences...", Logger.LogComponent.BACKGROUND);
        await Prefs.loadPrefs();
        Logger.log("Preferences loaded", Logger.LogComponent.BACKGROUND);

        // Initialize browser state
        Logger.log("Initializing browser state...", Logger.LogComponent.BACKGROUND);
        State.updateOfflineStatus();

        // Initialize window and tab tracking
        const windows = await chrome.windows.getAll();
        Logger.log(`Found ${windows.length} window(s)`, Logger.LogComponent.BACKGROUND);

        const focusedWindows = windows.filter(w => w.focused);
        if (focusedWindows.length > 0) {
            State.updateLastFocusedWindow(focusedWindows[0].id);
        }

        const activeTabs = await chrome.tabs.query({ active: true });
        Logger.log(`Found ${activeTabs.length} active tab(s)`, Logger.LogComponent.BACKGROUND);

        for (const tab of activeTabs) {
            if (tab.windowId != null && tab.id != null) {
                State.setActiveTabForWindow(tab.windowId, tab.id);
            }
        }

        // Restore scheduling state before creating alarms or rescheduling
        await Scheduling.initializeSchedulingState();

        // Set up necessary alarms
        await setupNecessaryAlarms();

        // Initialize event listeners
        Listeners.initListeners();

        // Schedule existing tabs (will respect restored per-tab times)
        if (Prefs.prefs.autoSuspendEnabled) {
            Logger.log("Scheduling existing tabs...", Logger.LogComponent.BACKGROUND);
            const scheduleResult = await Scheduling.scheduleAllTabs();
            if (scheduleResult && typeof scheduleResult === 'object') {
                Logger.log(`Tab scheduling complete - ${scheduleResult.success} scheduled, ${scheduleResult.skipped} skipped, ${scheduleResult.failed} failed out of ${scheduleResult.total} total tabs`, Logger.LogComponent.BACKGROUND);
            }
        }

        Logger.log("Extension initialized successfully!", Logger.LogComponent.BACKGROUND);

    } catch (error) {
        Logger.logError("Extension initialization failed:", error, Logger.LogComponent.BACKGROUND);
        // Don't retry - just log the error and continue
    }
}

// ===================== Setup Necessary Alarms =====================
async function setupNecessaryAlarms() {
    Logger.log("Setting up necessary alarms...", Logger.LogComponent.BACKGROUND);

    // Set up cleanup alarms
    await chrome.alarms.create(Const.TS_ALARM_CLEANUP_NAME, {
        periodInMinutes: Const.ALARM_CLEANUP_INTERVAL_MINUTES
    });

    await chrome.alarms.create(Const.TS_STATE_CLEANUP_NAME, {
        periodInMinutes: Const.ALARM_CLEANUP_INTERVAL_MINUTES / 2
    });

    // Set up session auto-save alarm
    const existingSessionAlarm = await chrome.alarms.get(Const.TS_SESSION_FREQUENT_SAVE);
    if (!existingSessionAlarm) {
        const result = await chrome.storage.local.get([Prefs.PREFS_KEY]);
        const currentPrefs = { ...Prefs.defaultPrefs, ...(result[Prefs.PREFS_KEY] || {}) };
        const saveFrequency = currentPrefs.sessionAutoSaveFrequency || 5;
        await chrome.alarms.create(Const.TS_SESSION_FREQUENT_SAVE, {
            periodInMinutes: saveFrequency
        });
        Logger.log(`Session auto-save scheduled for every ${saveFrequency} minutes`, Logger.LogComponent.BACKGROUND);
    }

    // Set up tab scanning alarm if auto-suspend is enabled
    if (Prefs.prefs.autoSuspendEnabled) {
        await Scheduling.setupTabScanAlarm();
    }

    Logger.log("Necessary alarms set up", Logger.LogComponent.BACKGROUND);
}

// ===================== Event Handlers =====================
// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!alarm || !alarm.name) return;
    Listeners.handleAlarmEvent(alarm);
    // Handle alarm-backed debounce for scheduling
    if (alarm.name === Const.TS_SCHEDULE_DEBOUNCE_ALARM) {
        try {
            await Scheduling.scheduleAllTabs();
        } catch (e) {
            Logger.logError('Error executing scheduleAllTabs from debounce alarm', e, Logger.LogComponent.BACKGROUND);
        }
    }
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
    Logger.log(`Extension ${details.reason} event received`, Logger.LogComponent.BACKGROUND);
    // No need for complex initialization - just log the event
});

// Handle browser startup
chrome.runtime.onStartup.addListener(async () => {
    Logger.log("Browser startup detected", Logger.LogComponent.BACKGROUND);
    globalThis.isBulkOpRunning = false;
});

// Set up message handler immediately
chrome.runtime.onMessage.addListener(Listeners.handleMessage);

// ===================== Start the Extension =====================
// Initialize immediately when the service worker starts
initialize().catch(error => {
    Logger.logError("Top-level initialization failed:", error, Logger.LogComponent.BACKGROUND);
});