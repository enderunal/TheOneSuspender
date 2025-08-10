// constants.js

// For alarm handling and cleanup
export const ALARM_CLEANUP_INTERVAL_MINUTES = 60; // Once per hour
export const TS_TAB_SCAN_INTERVAL_MINUTES = 0.5; // Check tabs every 30 seconds
export const TS_TAB_SCAN_ALARM_NAME = 'TS_tabScanAlarm'; // The single alarm name for tab scanning
export const TS_ALARM_CLEANUP_NAME = 'TS_alarmCleanup';
export const TS_STATE_CLEANUP_NAME = 'TS_stateCleanup';
export const TS_SESSION_FREQUENT_SAVE = 'TS_session_frequent_save';
export const TS_SCHEDULE_DEBOUNCE_ALARM = 'TS_scheduleAllTabs_debounce';

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
export const MSG_CLEAR_FAVICON_CACHE = 'MSG_clearFaviconCache';
export const MSG_REFRESH_ALL_SUSPENDED_FAVICONS = 'MSG_refreshAllSuspendedFavicons';
export const MSG_GET_EXTENSION_STATS = 'MSG_getExtensionStats';
