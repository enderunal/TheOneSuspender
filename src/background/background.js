// ===================== Imports =====================
import * as Logger from '../common/logger.js';
import * as Prefs from '../common/prefs.js';
import * as Const from '../common/constants.js';
import * as State from '../common/state.js';

import * as Suspension from '../suspension/suspension.js';

import * as Scheduling from './scheduling.js';
import * as Listeners from './listeners.js';


// ===================== Constants and Global State =====================
let isInitialized = false;
let initializationInProgress = false;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

Logger.log("Initializing TheOneSuspender Service Worker...", Logger.LogComponent.BACKGROUND);

// ===================== Utility/Helper Functions =====================
//+reviewed
async function setupStatePersistence() {
    chrome.alarms.create(Const.TS_ALARM_CLEANUP_NAME, { periodInMinutes: Const.ALARM_CLEANUP_INTERVAL_MINUTES });
    Logger.log(`Alarm cleanup routine scheduled for every ${Const.ALARM_CLEANUP_INTERVAL_MINUTES} minutes`, Logger.LogComponent.BACKGROUND);
    chrome.alarms.create(Const.TS_STATE_CLEANUP_NAME, { periodInMinutes: Const.ALARM_CLEANUP_INTERVAL_MINUTES / 2 });
    Logger.log(`State cleanup routine scheduled for every ${Const.ALARM_CLEANUP_INTERVAL_MINUTES / 2} minutes`, Logger.LogComponent.BACKGROUND);

    // Set up frequent session backup with configurable frequency (only if not already exists)
    const existingSessionAlarm = await chrome.alarms.get('TS_SESSION_FREQUENT_SAVE');
    if (!existingSessionAlarm) {
        // Read from storage to get the latest value
        const result = await chrome.storage.local.get([Prefs.PREFS_KEY]);
        const currentPrefs = { ...Prefs.defaultPrefs, ...(result[Prefs.PREFS_KEY] || {}) };
        const saveFrequency = currentPrefs.sessionAutoSaveFrequency || 5;
        chrome.alarms.create('TS_SESSION_FREQUENT_SAVE', { periodInMinutes: saveFrequency });
        Logger.log(`Session auto-save scheduled for every ${saveFrequency} minutes`, Logger.LogComponent.BACKGROUND);
    } else {
        Logger.log(`Session auto-save alarm already exists, skipping creation`, Logger.LogComponent.BACKGROUND);
    }

    try {
        if (State.prefs?.autoSuspendEnabled === false || (typeof State.prefs === 'undefined' && typeof prefs !== 'undefined' && prefs.autoSuspendEnabled === false)) {
            await chrome.alarms.clear(Const.TS_TAB_SCAN_ALARM_NAME);
            Logger.log('Auto suspension is disabled; tab scan alarm cleared.', Logger.LogComponent.BACKGROUND);
        } else {
            await Scheduling.scheduleAllTabs();
            Logger.log("Initial tab scheduling complete", Logger.LogComponent.BACKGROUND);
        }
    } catch (e) {
        Logger.logError("Error during initial tab scheduling", e, Logger.LogComponent.BACKGROUND);
    }
}

// ===================== Core Logic =====================
//+revieWIP
async function initialize() {
    if (isInitialized || initializationInProgress) {
        Logger.log("Initialization already complete or in progress.", Logger.LogComponent.BACKGROUND);
        return;
    }
    initializationInProgress = true;
    initializationAttempts++;
    Logger.log(`Starting extension initialization (attempt ${initializationAttempts})...`, Logger.LogComponent.BACKGROUND);
    const initTimeoutMs = 30000;
    const initTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Initialization timed out")), initTimeoutMs);
    });
    try {
        await Promise.race([initializeCore(), initTimeoutPromise]);
        isInitialized = true;
        initializationInProgress = false;
        initializationAttempts = 0; // Reset attempts on success
        Logger.log("Initialization complete!", Logger.LogComponent.BACKGROUND);

        // Clear startup, retry, and onInstalled alarms upon successful initialization
        try {
            await chrome.alarms.clear(Const.TS_INIT_STARTUP_ALARM_NAME);
            Logger.detailedLog("Cleared startup alarm on successful init.", Logger.LogComponent.BACKGROUND);
        } catch (e) {
            Logger.logWarning("Error clearing startup alarm:", Logger.LogComponent.BACKGROUND);
        }

        const allAlarms = await chrome.alarms.getAll();
        for (const anAlarm of allAlarms) {
            if (anAlarm.name.startsWith(Const.TS_INIT_RETRY_PREFIX) || anAlarm.name.startsWith(Const.TS_INIT_ON_ALARM_PREFIX)) {
                try {
                    await chrome.alarms.clear(anAlarm.name);
                    Logger.detailedLog(`Cleared init-related alarm ${anAlarm.name} on successful init.`, Logger.LogComponent.BACKGROUND);
                } catch (e) {
                    Logger.logWarning(`Error clearing init-related alarm ${anAlarm.name}:`, Logger.LogComponent.BACKGROUND);
                }
            }
        }

        Listeners.initListeners();
        await processPostInitializationTasks(); // This will re-process any "deferred" alarms
    } catch (error) {
        initializationInProgress = false;
        Logger.logError("initialization", error, Logger.LogComponent.BACKGROUND);
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            const retryDelayMinutes = Const.INIT_RETRY_DELAY_MINUTES;
            Logger.log(`Scheduling retry (${initializationAttempts}/${MAX_INIT_ATTEMPTS}) in ${retryDelayMinutes} minutes`, Logger.LogComponent.BACKGROUND);
            const retryAlarmName = `${Const.TS_INIT_RETRY_PREFIX}${Date.now()}`;
            try {
                await chrome.alarms.create(retryAlarmName, { delayInMinutes: retryDelayMinutes });
                Logger.detailedLog(`Created retry alarm ${retryAlarmName} after failed initialization.`, Logger.LogComponent.BACKGROUND);
            } catch (e) {
                Logger.logWarning(`Error creating retry alarm ${retryAlarmName}:`, Logger.LogComponent.BACKGROUND);
            }
        } else {
            Logger.log(`Maximum initialization attempts (${MAX_INIT_ATTEMPTS}) reached. Entering degraded mode.`, Logger.LogComponent.BACKGROUND);
            isInitialized = true;
            try {
                await chrome.storage.local.set({ TS_DEGRADED_MODE: true });
                Logger.log("Set TS_DEGRADED_MODE flag in storage.", Logger.LogComponent.BACKGROUND);
            } catch (err) {
                Logger.logWarning("Error setting TS_DEGRADED_MODE flag in storage:", Logger.LogComponent.BACKGROUND);
            }
            try {
                await Prefs.loadPrefs().catch(() => { });
            } catch (err) {
                Logger.logWarning("degraded mode initialization", Logger.LogComponent.BACKGROUND);
            }
        }
    }
}

//+reviewed
async function initializeCore() {
    Logger.log("Step 1: Loading preferences...", Logger.LogComponent.BACKGROUND);
    try {
        await Promise.race([
            Prefs.loadPrefs(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Loading preferences timed out")), 10000)
            )
        ]);
    } catch (prefsError) {
        console.error("[TheOneSuspender] Error loading preferences:", prefsError);
        Logger.log("Continuing with default preferences", Logger.LogComponent.BACKGROUND);
    }
    Logger.log("Step 2: Initializing browser status...", Logger.LogComponent.BACKGROUND);
    State.updateOfflineStatus();
    Logger.log("Step 3: Initializing window and tab info...", Logger.LogComponent.BACKGROUND);
    try {
        const windows = await chrome.windows.getAll();
        const focusedWindows = windows.filter(w => w.focused);
        if (focusedWindows.length > 0) {
            State.updateLastFocusedWindow(focusedWindows[0].id);
        }
        const activeTabs = await chrome.tabs.query({ active: true });
        for (const tab of activeTabs) {
            if (tab.windowId != null && tab.id != null) {
                State.setActiveTabForWindow(tab.windowId, tab.id);
            }
        }
    } catch (windowError) {
        Logger.logError("Error initializing window info:", windowError, Logger.LogComponent.BACKGROUND);
    }
}

//+reviewed
async function processPostInitializationTasks() {
    Logger.log("Processing post-initialization tasks...", Logger.LogComponent.BACKGROUND);
    try {
        await setupStatePersistence();
        const alarms = await chrome.alarms.getAll();
        // NOTE: To avoid double-processing, ensure handleAlarmEvent is idempotent or track processed alarms.
        for (const alarm of alarms) {
            Logger.log(`Processing previously deferred alarm: ${alarm.name}`, Logger.LogComponent.BACKGROUND);
            try {
                Listeners.handleAlarmEvent(alarm);
            } catch (alarmError) {
                console.error(`[TheOneSuspender] Error handling deferred alarm ${alarm.name}:`, alarmError);
            }
        }
    } catch (error) {
        console.error('[TheOneSuspender] Error in post-initialization tasks:', error);
    }
}

// ===================== Event Listener Registrations =====================
//+reviewed
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!alarm || !alarm.name) return;

    const alarmName = alarm.name;

    // Check for any initialization-triggering alarms first
    const isInitTriggerAlarm = alarmName === Const.TS_INIT_STARTUP_ALARM_NAME ||
        alarmName.startsWith(Const.TS_INIT_ON_ALARM_PREFIX) ||
        alarmName.startsWith(Const.TS_INIT_RETRY_PREFIX);

    if (isInitTriggerAlarm) {
        Logger.detailedLog(`[Background] Initialization-triggering alarm received: ${alarmName}`, Logger.LogComponent.BACKGROUND);
        if (!isInitialized && !initializationInProgress) {
            // For onInstalled (TS_INIT_ON_ALARM_PREFIX) and retry (TS_INIT_RETRY_PREFIX) alarms, 
            // they are one-shot and should be cleared before attempting initialization.
            // The startup alarm (TS_INIT_STARTUP_ALARM_NAME) might be cleared by a successful initialize().
            if (alarmName.startsWith(Const.TS_INIT_ON_ALARM_PREFIX) || alarmName.startsWith(Const.TS_INIT_RETRY_PREFIX)) {
                try {
                    await chrome.alarms.clear(alarmName);
                    Logger.detailedLog(`Cleared one-shot init alarm ${alarmName} before attempt.`, Logger.LogComponent.BACKGROUND);
                } catch (e) { /*ignore*/ }
            }
            await initialize(); // This will set isInitialized = true on success and clear appropriate alarms
        } else if (isInitialized) {
            // If already initialized, clear any stray one-shot init alarms.
            // Startup alarm should have been cleared by successful initialize().
            if (alarmName.startsWith(Const.TS_INIT_ON_ALARM_PREFIX) || alarmName.startsWith(Const.TS_INIT_RETRY_PREFIX)) {
                try {
                    await chrome.alarms.clear(alarmName);
                    Logger.detailedLog(`Cleared stray one-shot init alarm ${alarmName} post-init.`, Logger.LogComponent.BACKGROUND);
                } catch (e) { /*ignore*/ }
            }
        } else {
            Logger.detailedLog(`[Background] Init alarm ${alarmName} received, but init already in progress. Alarm will run again if periodic or be cleared if one-shot.`, Logger.LogComponent.BACKGROUND);
        }
        return; // Handled this alarm type
    }

    // For all other alarms, require initialization to be complete
    if (!isInitialized) {
        Logger.detailedLog(`[Deferred] Non-init alarm event for ${alarmName} received before initialization complete. It should be processed by processPostInitializationTasks.`, Logger.LogComponent.BACKGROUND);
        return; // Defer to processPostInitializationTasks, which re-processes all alarms.
    }

    Listeners.handleAlarmEvent(alarm);
});

//+reviewed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isInitialized) {
        Logger.detailedLog(`[Deferred] Message of type ${message?.type} received before initialization complete`, Logger.LogComponent.BACKGROUND);
        sendResponse({ error: "Extension is still initializing. Please try again shortly." });
        return true;
    }
    // Listen for prefs changed and update scheduling if needed
    if (message?.type === Const.MSG_PREFS_CHANGED) {
        (async () => {
            try {
                Scheduling.scheduleAllTabs();
                await rescheduleSessionAutoSave();
                sendResponse?.({ success: true });
            } catch (error) {
                Logger.logError("Error handling prefs changed", error, Logger.LogComponent.BACKGROUND);
                sendResponse?.({ success: false, error: error.message });
            }
        })();
        return true; // async
    }
    // Handle suspendTab for import
    if (message?.type === Const.MSG_SUSPEND_TAB) {
        (async () => {
            try {
                const ok = await Suspension.suspendTab(message.tabId, message.isManual);
                sendResponse({ success: ok });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true; // async
    }
    return Listeners.handleMessage(message, sender, sendResponse);
});

//+reviewed
chrome.runtime.onInstalled.addListener(async (details) => {
    try {
        Logger.log(`Extension ${details.reason} event received: ${JSON.stringify(details)}`, Logger.LogComponent.BACKGROUND);
        const initAlarmName = `${Const.TS_INIT_ON_ALARM_PREFIX}${details.reason}_${Date.now()}`;
        await chrome.alarms.create(initAlarmName, { delayInMinutes: 0.02 });
        Logger.log(`Created alarm ${initAlarmName} to trigger initialization after ${details.reason} event.`, Logger.LogComponent.BACKGROUND);
    } catch (e) {
        console.error(`[TheOneSuspender] Error setting up init alarm during ${details.reason} event:`, e);
        if (!isInitialized && !initializationInProgress) {
            await initialize();
        }
    }
});

// ===================== Session Auto-Save Management =====================
/**
 * Reschedule the session auto-save alarm with updated frequency
 * Called when session preferences are changed
 */
async function rescheduleSessionAutoSave() {
    try {
        // Clear existing alarm
        await chrome.alarms.clear('TS_SESSION_FREQUENT_SAVE');

        // Create new alarm with updated frequency
        // Read from storage to get the latest value
        const result = await chrome.storage.local.get([Prefs.PREFS_KEY]);
        const currentPrefs = { ...Prefs.defaultPrefs, ...(result[Prefs.PREFS_KEY] || {}) };
        const saveFrequency = currentPrefs.sessionAutoSaveFrequency || 5;
        await chrome.alarms.create('TS_SESSION_FREQUENT_SAVE', { periodInMinutes: saveFrequency });

        Logger.log(`Session auto-save rescheduled for every ${saveFrequency} minutes`, Logger.LogComponent.BACKGROUND);
    } catch (error) {
        Logger.logError("Error rescheduling session auto-save alarm", error, Logger.LogComponent.BACKGROUND);
    }
}

// ===================== Startup Logic =====================
//+reviewed
chrome.alarms.create(Const.TS_INIT_STARTUP_ALARM_NAME, { delayInMinutes: 0.02 }); // ~1 second delay

// On startup, clear the lock in storage and globalThis
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.set({ BULK_OP_IN_PROGRESS: false, BULK_OP_TIMESTAMP: null });
    globalThis.isBulkOpRunning = false;
});