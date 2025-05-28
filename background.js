// ===================== Imports =====================
import { log, detailedLog, logError, logWarning, LogComponent } from './logger.js';
import { loadPrefs } from './prefs.js';
import { scheduleAllTabs, clearDebouncedTimeouts } from './scheduling.js';
import * as Listeners from './listeners.js'; // Import logic handlers
import * as Const from './constants.js';
import * as State from './state.js'; // Import shared state

// ===================== Constants and Global State =====================
let isInitialized = false;
let initializationInProgress = false;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

log("Initializing TheOneSuspender Service Worker...", LogComponent.BACKGROUND);

// ===================== Utility/Helper Functions =====================
//+reviewed
async function setupStatePersistence() {
    chrome.alarms.create(Const.TS_ALARM_CLEANUP_NAME, { periodInMinutes: Const.ALARM_CLEANUP_INTERVAL_MINUTES });
    log(`Alarm cleanup routine scheduled for every ${Const.ALARM_CLEANUP_INTERVAL_MINUTES} minutes`, LogComponent.BACKGROUND);
    chrome.alarms.create(Const.TS_STATE_CLEANUP_NAME, { periodInMinutes: Const.ALARM_CLEANUP_INTERVAL_MINUTES / 2 });
    log(`State cleanup routine scheduled for every ${Const.ALARM_CLEANUP_INTERVAL_MINUTES / 2} minutes`, LogComponent.BACKGROUND);
    try {
        if (State.prefs?.autoSuspendEnabled === false || (typeof State.prefs === 'undefined' && typeof prefs !== 'undefined' && prefs.autoSuspendEnabled === false)) {
            await chrome.alarms.clear(Const.TS_TAB_SCAN_ALARM_NAME);
            log('Auto suspension is disabled; tab scan alarm cleared.', LogComponent.BACKGROUND);
        } else {
            await scheduleAllTabs();
            log("Initial tab scheduling complete", LogComponent.BACKGROUND);
        }
    } catch (e) {
        logError("Error during initial tab scheduling", e, LogComponent.BACKGROUND);
    }
}

// ===================== Core Logic =====================
//+revieWIP
async function initialize() {
    if (isInitialized || initializationInProgress) {
        log("Initialization already complete or in progress.", LogComponent.BACKGROUND);
        return;
    }
    initializationInProgress = true;
    initializationAttempts++;
    log(`Starting extension initialization (attempt ${initializationAttempts})...`, LogComponent.BACKGROUND);
    const initTimeoutMs = 30000;
    const initTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Initialization timed out")), initTimeoutMs);
    });
    try {
        await Promise.race([initializeCore(), initTimeoutPromise]);
        isInitialized = true;
        initializationInProgress = false;
        initializationAttempts = 0; // Reset attempts on success
        log("Initialization complete!", LogComponent.BACKGROUND);

        // Clear startup, retry, and onInstalled alarms upon successful initialization
        try {
            await chrome.alarms.clear(Const.TS_INIT_STARTUP_ALARM_NAME);
            detailedLog("Cleared startup alarm on successful init.", LogComponent.BACKGROUND);
        } catch (e) {
            logWarning("Error clearing startup alarm:", LogComponent.BACKGROUND);
        }

        const allAlarms = await chrome.alarms.getAll();
        for (const anAlarm of allAlarms) {
            if (anAlarm.name.startsWith(Const.TS_INIT_RETRY_PREFIX) || anAlarm.name.startsWith(Const.TS_INIT_ON_ALARM_PREFIX)) {
                try {
                    await chrome.alarms.clear(anAlarm.name);
                    detailedLog(`Cleared init-related alarm ${anAlarm.name} on successful init.`, LogComponent.BACKGROUND);
                } catch (e) {
                    logWarning(`Error clearing init-related alarm ${anAlarm.name}:`, LogComponent.BACKGROUND);
                }
            }
        }

        Listeners.initListeners();
        await processPostInitializationTasks(); // This will re-process any "deferred" alarms
    } catch (error) {
        initializationInProgress = false;
        logError("initialization", error, LogComponent.BACKGROUND);
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            const retryDelayMinutes = Const.INIT_RETRY_DELAY_MINUTES;
            log(`Scheduling retry (${initializationAttempts}/${MAX_INIT_ATTEMPTS}) in ${retryDelayMinutes} minutes`, LogComponent.BACKGROUND);
            const retryAlarmName = `${Const.TS_INIT_RETRY_PREFIX}${Date.now()}`;
            try {
                await chrome.alarms.create(retryAlarmName, { delayInMinutes: retryDelayMinutes });
                detailedLog(`Created retry alarm ${retryAlarmName} after failed initialization.`, LogComponent.BACKGROUND);
            } catch (e) {
                logWarning(`Error creating retry alarm ${retryAlarmName}:`, LogComponent.BACKGROUND);
            }
        } else {
            log(`Maximum initialization attempts (${MAX_INIT_ATTEMPTS}) reached. Entering degraded mode.`, LogComponent.BACKGROUND);
            isInitialized = true;
            try {
                await chrome.storage.local.set({ TS_DEGRADED_MODE: true });
                log("Set TS_DEGRADED_MODE flag in storage.", LogComponent.BACKGROUND);
            } catch (err) {
                logWarning("Error setting TS_DEGRADED_MODE flag in storage:", LogComponent.BACKGROUND);
            }
            try {
                await loadPrefs().catch(() => { });
            } catch (err) {
                logWarning("degraded mode initialization", LogComponent.BACKGROUND);
            }
        }
    }
}

//+reviewed
async function initializeCore() {
    log("Step 1: Loading preferences...", LogComponent.BACKGROUND);
    try {
        await Promise.race([
            loadPrefs(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Loading preferences timed out")), 10000)
            )
        ]);
    } catch (prefsError) {
        console.error("[TheOneSuspender] Error loading preferences:", prefsError);
        log("Continuing with default preferences", LogComponent.BACKGROUND);
    }
    log("Step 2: Initializing browser status...", LogComponent.BACKGROUND);
    State.updateOfflineStatus();
    log("Battery API not available in service workers, assuming always connected", LogComponent.BACKGROUND);
    //todo review-note: look at this later
    State.updatePowerStatus(true);
    log("Step 3: Initializing window and tab info...", LogComponent.BACKGROUND);
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
        logError("Error initializing window info:", windowError, LogComponent.BACKGROUND);
    }
}

//+reviewed
async function processPostInitializationTasks() {
    log("Processing post-initialization tasks...", LogComponent.BACKGROUND);
    try {
        await setupStatePersistence();
        const alarms = await chrome.alarms.getAll();
        // NOTE: To avoid double-processing, ensure handleAlarmEvent is idempotent or track processed alarms.
        for (const alarm of alarms) {
            log(`Processing previously deferred alarm: ${alarm.name}`, LogComponent.BACKGROUND);
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
        detailedLog(`[Background] Initialization-triggering alarm received: ${alarmName}`, LogComponent.BACKGROUND);
        if (!isInitialized && !initializationInProgress) {
            // For onInstalled (TS_INIT_ON_ALARM_PREFIX) and retry (TS_INIT_RETRY_PREFIX) alarms, 
            // they are one-shot and should be cleared before attempting initialization.
            // The startup alarm (TS_INIT_STARTUP_ALARM_NAME) might be cleared by a successful initialize().
            if (alarmName.startsWith(Const.TS_INIT_ON_ALARM_PREFIX) || alarmName.startsWith(Const.TS_INIT_RETRY_PREFIX)) {
                try {
                    await chrome.alarms.clear(alarmName);
                    detailedLog(`Cleared one-shot init alarm ${alarmName} before attempt.`, LogComponent.BACKGROUND);
                } catch (e) { /*ignore*/ }
            }
            await initialize(); // This will set isInitialized = true on success and clear appropriate alarms
        } else if (isInitialized) {
            // If already initialized, clear any stray one-shot init alarms.
            // Startup alarm should have been cleared by successful initialize().
            if (alarmName.startsWith(Const.TS_INIT_ON_ALARM_PREFIX) || alarmName.startsWith(Const.TS_INIT_RETRY_PREFIX)) {
                try {
                    await chrome.alarms.clear(alarmName);
                    detailedLog(`Cleared stray one-shot init alarm ${alarmName} post-init.`, LogComponent.BACKGROUND);
                } catch (e) { /*ignore*/ }
            }
        } else {
            detailedLog(`[Background] Init alarm ${alarmName} received, but init already in progress. Alarm will run again if periodic or be cleared if one-shot.`, LogComponent.BACKGROUND);
        }
        return; // Handled this alarm type
    }

    // For all other alarms, require initialization to be complete
    if (!isInitialized) {
        detailedLog(`[Deferred] Non-init alarm event for ${alarmName} received before initialization complete. It should be processed by processPostInitializationTasks.`, LogComponent.BACKGROUND);
        return; // Defer to processPostInitializationTasks, which re-processes all alarms.
    }

    Listeners.handleAlarmEvent(alarm);
});

//+reviewed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isInitialized) {
        detailedLog(`[Deferred] Message of type ${message?.type} received before initialization complete`, LogComponent.BACKGROUND);
        sendResponse({ error: "Extension is still initializing. Please try again shortly." });
        return true;
    }
    // Listen for prefs changed and update scheduling if needed
    if (message?.type === Const.MSG_PREFS_CHANGED) {
        scheduleAllTabs();
        sendResponse?.({ success: true });
        return true;
    }
    return Listeners.handleMessage(message, sender, sendResponse);
});

//+reviewed
chrome.runtime.onInstalled.addListener(async (details) => {
    try {
        log(`Extension ${details.reason} event received: ${JSON.stringify(details)}`, LogComponent.BACKGROUND);
        const initAlarmName = `${Const.TS_INIT_ON_ALARM_PREFIX}${details.reason}_${Date.now()}`;
        await chrome.alarms.create(initAlarmName, { delayInMinutes: 0.02 });
        log(`Created alarm ${initAlarmName} to trigger initialization after ${details.reason} event.`, LogComponent.BACKGROUND);
    } catch (e) {
        console.error(`[TheOneSuspender] Error setting up init alarm during ${details.reason} event:`, e);
        if (!isInitialized && !initializationInProgress) {
            await initialize();
        }
    }
});

//+reviewed
chrome.runtime.onSuspend.addListener(() => {
    log("Extension being suspended", LogComponent.BACKGROUND);
    // No manual cleanup needed; Chrome manages service worker lifecycle and listener cleanup.
});

// ===================== Startup Logic =====================
//+reviewed
chrome.alarms.create(Const.TS_INIT_STARTUP_ALARM_NAME, { delayInMinutes: 0.02 }); // ~1 second delay

// On startup, clear the lock in storage and globalThis
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.set({ BULK_OP_IN_PROGRESS: false, BULK_OP_TIMESTAMP: null });
    globalThis.isBulkOpRunning = false;
});