// constants.js

// For alarm handling and cleanup
export const ALARM_CLEANUP_INTERVAL_MINUTES = 60; // Once per hour
export const TS_TAB_SCAN_INTERVAL_MINUTES = 0.5; // Check tabs every 30 seconds
export const TS_TAB_SCAN_ALARM_NAME = 'TS_tabScanAlarm'; // The single alarm name for tab scanning
export const TS_ALARM_CLEANUP_NAME = 'TS_alarmCleanup';
export const TS_STATE_CLEANUP_NAME = 'TS_stateCleanup';
export const TS_INIT_STARTUP_ALARM_NAME = 'TS_init_startup';
export const TS_INIT_ON_ALARM_PREFIX = 'TS_init_on_';
export const TS_INIT_RETRY_PREFIX = 'TS_init_retry_';

// For background.js initialization
export const INIT_RETRY_DELAY_MINUTES = 1; // Time to wait before retrying initialization

// Other constants
export const MAX_TABS_PER_SCAN = 1000; // Maximum tabs to process in one scan cycle

// Suspended page path - use this consistently throughout the codebase
export const SUSPENDED_PAGE_PATH = "suspended.html";

// Message Types
export const MSG_SAVE_SETTINGS = 'MSG_saveSettings';
export const MSG_SAVE_WHITELIST = 'MSG_saveWhitelist';
export const MSG_SUSPEND_TAB = 'MSG_suspendTab';
export const MSG_UNSUSPEND_TAB = 'MSG_unsuspendTab';
export const MSG_SUSPEND_ALL_TABS_IN_WINDOW = 'MSG_suspendAllTabsInWindow';
export const MSG_UNSUSPEND_ALL_TABS_IN_WINDOW = 'MSG_unsuspendAllTabsInWindow';
export const MSG_SUSPEND_ALL_TABS_ALL_SPECS = 'MSG_suspendAllTabsAllSpecs';
export const MSG_UNSUSPEND_ALL_TABS_ALL_SPECS = 'MSG_unsuspendAllTabsAllSpecs';
export const MSG_PREFS_CHANGED = 'MSG_prefsChanged';
export const MSG_PROMPT_SUSPEND = 'PROMPT_SUSPEND';
