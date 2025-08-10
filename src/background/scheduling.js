// scheduling.js
import * as Const from '../common/constants.js';
import * as State from '../common/state.js';
import * as Logger from '../common/logger.js';
import * as Prefs from '../common/prefs.js';
import * as Suspension from '../suspension/suspension.js';

// Persistent storage key for scheduled suspension times
const SCHEDULES_STORAGE_KEY = 'TS_tab_suspend_times_v1';

export const SMALL_DELAY_MS = 50;
export const DEBOUNCE_DELAY_MS = 5000; // For debouncing frequent events like settings changes before rescheduling

// Object to store tab suspension times (efficient, no per-tab alarms)
let tabSuspendTimes = new Map();

// Debounced persistence timeout
let persistTimeoutId = null;
const PERSIST_DEBOUNCE_MS = 1000;

/**
 * Persist current tabSuspendTimes Map to chrome.storage.local in a compact form
 */
async function persistSchedules() {
	try {
		const entries = [];
		for (const [tabId, data] of tabSuspendTimes.entries()) {
			const info = typeof data === 'number' ? { scheduledTime: data, delayMinutes: -1 } : data;
			entries.push({ tabId, scheduledTime: info.scheduledTime, delayMinutes: info.delayMinutes });
		}
		await chrome.storage.local.set({ [SCHEDULES_STORAGE_KEY]: entries });
		Logger.detailedLog(`Persisted ${entries.length} scheduled tab entries`, Logger.LogComponent.SCHEDULING);
	} catch (e) {
		Logger.logError('persistSchedules', e, Logger.LogComponent.SCHEDULING);
	}
}

function persistSchedulesDebounced() {
	try {
		if (persistTimeoutId) clearTimeout(persistTimeoutId);
		persistTimeoutId = setTimeout(() => {
			persistTimeoutId = null;
			// Fire and forget
			persistSchedules();
		}, PERSIST_DEBOUNCE_MS);
	} catch (e) {
		Logger.logError('persistSchedulesDebounced', e, Logger.LogComponent.SCHEDULING);
	}
}

/**
 * Initialize in-memory scheduling state from persisted storage.
 * Should be called on service worker startup before any scans run.
 */
export async function initializeSchedulingState() {
	try {
		// Clear in-memory state first
		tabSuspendTimes.clear();

		// If auto suspension is disabled, also clear persisted schedules
		if (!Prefs.prefs.autoSuspendEnabled) {
			await chrome.storage.local.set({ [SCHEDULES_STORAGE_KEY]: [] });
			Logger.detailedLog('Auto suspension disabled; cleared persisted schedules', Logger.LogComponent.SCHEDULING);
			return;
		}

		const result = await chrome.storage.local.get([SCHEDULES_STORAGE_KEY]);
		const entries = Array.isArray(result[SCHEDULES_STORAGE_KEY]) ? result[SCHEDULES_STORAGE_KEY] : [];

		if (entries.length === 0) {
			Logger.detailedLog('No persisted schedules found on startup', Logger.LogComponent.SCHEDULING);
			return;
		}

		// Rehydrate map with only existing tabs; adjust overdue times to "now" so next scan suspends immediately
		const existingTabs = await chrome.tabs.query({});
		const existingIds = new Set(existingTabs.map(t => t.id));

		const now = Date.now();
		let restored = 0;
		for (const entry of entries) {
			if (!entry || typeof entry.tabId !== 'number') continue;
			if (!existingIds.has(entry.tabId)) continue;
			const scheduledTime = Math.min(Math.max(0, entry.scheduledTime || 0), Number.MAX_SAFE_INTEGER);
			const delayMinutes = typeof entry.delayMinutes === 'number' ? entry.delayMinutes : Prefs.prefs.suspendAfter;
			const normalizedTime = scheduledTime <= now ? now : scheduledTime;
			tabSuspendTimes.set(entry.tabId, { scheduledTime: normalizedTime, delayMinutes });
			restored++;
		}
		Logger.log(`Restored ${restored} scheduled tabs from storage`, Logger.LogComponent.SCHEDULING);

		// Ensure scan alarm exists
		await setupTabScanAlarm();
	} catch (e) {
		Logger.logError('initializeSchedulingState', e, Logger.LogComponent.SCHEDULING);
	}
}

// Track timeouts for debounced functions so they can be cleared during cleanup
const debounceTimeouts = new Map();

/**
 * Removes a tab's suspension time entry from the Map
 * @param {number} tabId - The tab ID to remove
 * @returns {boolean} - Whether an entry was found and removed
 */
export function removeTabSuspendTime(tabId) {
	const hadEntry = tabSuspendTimes.has(tabId);
	tabSuspendTimes.delete(tabId);
	if (hadEntry) persistSchedulesDebounced();
	return hadEntry;
}

/**
 * Sets up the tab scanning alarm that will periodically check for tabs to suspend.
 * Only a single scan alarm is used.
 * @returns {Promise<boolean>} - Whether the alarm was successfully created.
 */
export async function setupTabScanAlarm() {
	try {
		await chrome.alarms.clear(Const.TS_TAB_SCAN_ALARM_NAME);
		if (!Prefs.prefs.autoSuspendEnabled) {
			Logger.log('Auto suspension is disabled; tab scan alarm will not be created.');
			return false;
		}
		await chrome.alarms.create(Const.TS_TAB_SCAN_ALARM_NAME, {
			periodInMinutes: Const.TS_TAB_SCAN_INTERVAL_MINUTES
		});
		Logger.log(`Tab scan alarm created with interval of ${Const.TS_TAB_SCAN_INTERVAL_MINUTES} minutes`);
		return true;
	} catch (e) {
		Logger.logError(`Error setting up tab scan alarm:`, e);
		return false;
	}
}

/**
 * Scans all tabs and suspends those that have reached their suspension time.
 * This is called by the tab scan alarm.
 * @returns {Promise<{ scanned: number, suspended: number, errors: number, cleaned: number }>} Stats about the scan operation.
 */
export async function scanTabsForSuspension() {
	if (!Prefs.prefs.autoSuspendEnabled) {
		Logger.log('Auto suspension is disabled; skipping tab scan.');
		return { scanned: 0, suspended: 0, errors: 0, cleaned: 0 };
	}
	const stats = { scanned: 0, suspended: 0, errors: 0, cleaned: 0 };
	const now = Date.now();

	try {
		const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
		const existingTabIds = new Set(tabs.map(tab => tab.id));

		// Clean up any suspension times for tabs that no longer exist
		const mapSizeBefore = tabSuspendTimes.size;
		for (const tabId of tabSuspendTimes.keys()) {
			if (!existingTabIds.has(tabId)) {
				tabSuspendTimes.delete(tabId);
				stats.cleaned++;
				Logger.detailedLog(`Removed non-existent tab ${tabId} from suspension tracking`);
			}
		}

		if (stats.cleaned > 0) {
			Logger.log(`Tab suspension map cleanup: removed ${stats.cleaned} stale entries, size reduced from ${mapSizeBefore} to ${tabSuspendTimes.size}`);
		}

		State.updateOfflineStatus();

		for (let i = 0; i < tabs.length; i += Const.MAX_TABS_PER_SCAN) {
			const batch = tabs.slice(i, i + Const.MAX_TABS_PER_SCAN);

			for (const tab of batch) {
				stats.scanned++;
				if (!tab.id) continue;

				try {
					const suspendData = tabSuspendTimes.get(tab.id);
					if (!suspendData) continue;
					const suspendTime = typeof suspendData === 'number'
						? suspendData
						: suspendData.scheduledTime;
					if (suspendTime <= now) {
						const skipReason = await Suspension.shouldSkipTabForScheduling(tab, true);
						if (skipReason) {
							Logger.detailedLog(`Tab ${tab.id} will not be suspended: ${skipReason}`);
							tabSuspendTimes.delete(tab.id);
							continue;
						}
						Logger.log(`Tab ${tab.id} has reached its suspension time, suspending...`);
						const success = await Suspension.suspendTab(tab.id);
						if (success) {
							stats.suspended++;
							tabSuspendTimes.delete(tab.id);
							persistSchedulesDebounced();
						} else {
							stats.errors++;
						}
					}
				} catch (e) {
					stats.errors++;
					Logger.logError(`Error processing tab ${tab.id} during scan:`, e);
				}
			}

			if (i + Const.MAX_TABS_PER_SCAN < tabs.length) {
				await new Promise(resolve => setTimeout(resolve, SMALL_DELAY_MS));
			}
		}

		Logger.log(`Tab scan complete: ${stats.scanned} scanned, ${stats.suspended} suspended, ${stats.cleaned} cleaned, ${stats.errors} errors`);
		// Persist after a scan in case of cleanup or changes
		persistSchedulesDebounced();
		return stats;
	} catch (e) {
		Logger.logError(`Error in scanTabsForSuspension:`, e);
		return stats;
	}
}

/**
 * Cancels the suspension tracking for a specific tab.
 * @param {number} tabId - ID of the tab to cancel tracking for.
 * @returns {Promise<boolean>} - Whether the tracking was successfully cancelled.
 */
export async function cancelTabSuspendTracking(tabId) {
	try {
		tabSuspendTimes.delete(tabId);
		Logger.detailedLog(`Cancelled suspend tracking for tab ${tabId}`);
		persistSchedulesDebounced();
		return true;
	} catch (e) {
		Logger.logError(`Error cancelling tab suspend tracking for ${tabId}:`, e);
		return false;
	}
}

/**
 * Schedules a tab for suspension by setting a suspension time in the map.
 * @param {number} tabId - ID of the tab to schedule.
 * @param {chrome.tabs.Tab} [tab] - Optional tab object to avoid duplicate lookup.
 * @returns {Promise<boolean>} - Whether the tab was successfully scheduled.
 */
export async function scheduleTab(tabId, tab = null) {
	if (!Prefs.prefs.autoSuspendEnabled) {
		Logger.detailedLog(`Auto suspension is disabled; not scheduling tab ${tabId}`);
		await cancelTabSuspendTracking(tabId);
		return false;
	}
	try {
		const tabInfo = tab || await chrome.tabs.get(tabId);
		const skipReason = await Suspension.shouldSkipTabForScheduling(tabInfo, true);
		if (skipReason) {
			Logger.detailedLog(`Tab ${tabId} skipped scheduling: ${skipReason}`);
			await cancelTabSuspendTracking(tabId);
			return false;
		}
		const existingAlarm = await getTabSuspendTime(tabId);
		const currentDelay = Prefs.prefs.suspendAfter;
		if (!existingAlarm || existingAlarm.delayMinutes !== currentDelay) {
			if (existingAlarm) {
				await cancelTabSuspendTracking(tabId);
			}
			const success = await scheduleTabInMap(tabId);
			if (success) {
				Logger.detailedLog(`Tab ${tabId} scheduled for suspension in ${currentDelay} minutes`);
			}
			return success;
		} else {
			Logger.detailedLog(`Tab ${tabId} already scheduled with correct timing (${existingAlarm.delayMinutes} min), no changes needed`);
			return true;
		}
	} catch (e) {
		if (e.message && e.message.includes('No tab with id')) {
			Logger.detailedLog(`Tab ${tabId} no longer exists, can't schedule`);
		} else {
			Logger.logError(`Error scheduling tab ${tabId}:`, e);
		}
		return false;
	}
}

/**
 * Creates a new suspension time for a tab in the map.
 * @param {number} tabId - ID of the tab to create the suspension time for.
 * @param {number} [delayMinutes=prefs.suspendAfter] - Delay in minutes before suspension.
 * @returns {Promise<boolean>} - Whether the suspension time was successfully created.
 */
export async function scheduleTabInMap(tabId, delayMinutes = null) {
	if (!Prefs.prefs.autoSuspendEnabled) {
		Logger.detailedLog(`Auto suspension is disabled; not scheduling tab ${tabId} in map`);
		await cancelTabSuspendTracking(tabId);
		return false;
	}
	const delay = delayMinutes !== null ? delayMinutes : Prefs.prefs.suspendAfter;
	if (delay <= 0 || !Number.isFinite(delay)) {
		Logger.logError(`Invalid suspension delay for tab ${tabId}: ${delay}`);
		return false;
	}
	try {
		const suspendTime = Date.now() + (delay * 60 * 1000);
		tabSuspendTimes.set(tabId, {
			scheduledTime: suspendTime,
			delayMinutes: delay
		});
		await setupTabScanAlarm();
		Logger.detailedLog(`Scheduled tab ${tabId} for suspension at ${new Date(suspendTime).toLocaleTimeString()}`);
		persistSchedulesDebounced();
		return true;
	} catch (e) {
		Logger.logError(`Error scheduling tab ${tabId} for suspension:`, e);
		return false;
	}
}

/**
 * Gets information about an existing suspension time for a tab
 * @param {number} tabId - ID of the tab to check
 * @returns {Promise<{scheduledTime: number, delayMinutes: number}|null>} The suspension info or null if not found
 */
export async function getTabSuspendTime(tabId) {
	const suspendData = tabSuspendTimes.get(tabId);
	if (suspendData) {
		if (typeof suspendData === 'number') {
			return { scheduledTime: suspendData, delayMinutes: -1 };
		}
		return suspendData;
	}
	return null;
}

/**
 * Returns a snapshot of current scheduling map (for stats/UI)
 * @returns {Promise<{size:number, entries:Array<{tabId:number, scheduledTime:number, delayMinutes:number}>}>}
 */
export async function getSchedulingSnapshot() {
	const entries = [];
	for (const [tabId, data] of tabSuspendTimes.entries()) {
		const info = typeof data === 'number' ? { scheduledTime: data, delayMinutes: -1 } : data;
		entries.push({ tabId, scheduledTime: info.scheduledTime, delayMinutes: info.delayMinutes });
	}
	return { size: entries.length, entries };
}

/**
 * Handles the tab scan alarm event.
 * @param {string} alarmName - The name of the triggered alarm.
 * @returns {Promise<boolean>} - Whether the alarm was successfully processed.
 */
export async function handleSuspendAlarm(alarmName) {
	if (alarmName === Const.TS_TAB_SCAN_ALARM_NAME) {
		if (!Prefs.prefs.autoSuspendEnabled) {
			Logger.log('Auto suspension is disabled; ignoring tab scan alarm.');
			return false;
		}
		await scanTabsForSuspension();
		return true;
	}
	return false;
}

// --- Tab Scheduling ---

/**
 * Unschedules a tab by cancelling its suspension tracking.
 * @param {number} tabId - ID of the tab to unschedule.
 * @returns {Promise<boolean>} - Whether the tab was successfully unscheduled.
 */
export async function unscheduleTab(tabId) {
	try {
		const cancelled = await cancelTabSuspendTracking(tabId);
		if (cancelled) {
			Logger.detailedLog(`Tab ${tabId} unscheduled for suspension`);
		}
		return cancelled;
	} catch (e) {
		Logger.logError(`Error unscheduling tab ${tabId}:`, e);
		return false;
	}
}

/**
 * Reschedules all tabs after a preference change or extension restart.
 * @returns {Promise<{success: number, skipped: number, failed: number, total: number}>} 
 * - Statistics about the scheduling operation.
 */
export async function scheduleAllTabs() {
	if (!Prefs.prefs.autoSuspendEnabled) {
		Logger.detailedLog('Auto suspension is disabled; not scheduling any tabs. Clearing all suspension tracking.');
		tabSuspendTimes.clear();
		await chrome.alarms.clear(Const.TS_TAB_SCAN_ALARM_NAME);
		await chrome.storage.local.set({ [SCHEDULES_STORAGE_KEY]: [] });
		return;
	}
	const stats = { success: 0, skipped: 0, failed: 0, total: 0 };

	try {
		const focusedWindowId = State.getLastFocusedWindow();
		let focusedWindowActiveTabId = null;

		if (focusedWindowId && focusedWindowId !== chrome.windows.WINDOW_ID_NONE) {
			const [activeTab] = await chrome.tabs.query({ active: true, windowId: focusedWindowId });
			focusedWindowActiveTabId = activeTab?.id ?? null;
		}

		let activeTabIds = [];
		if (Prefs.prefs.neverSuspendActive) {
			const activeTabs = await chrome.tabs.query({ active: true });
			activeTabIds = activeTabs.map(tab => tab.id);
		}

		const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
		stats.total = tabs.length;

		const batchSize = 200;

		for (let i = 0; i < tabs.length; i += batchSize) {
			const batch = tabs.slice(i, Math.min(i + batchSize, tabs.length));

			await Promise.all(batch.map(async (tab) => {
				if (!tab.id) {
					stats.skipped++;
					return;
				}

				try {
					if ((Prefs.prefs.neverSuspendLastWindow && tab.id === focusedWindowActiveTabId) ||
						(Prefs.prefs.neverSuspendActive && activeTabIds.includes(tab.id))) {
						await cancelTabSuspendTracking(tab.id);
						stats.skipped++;
						Logger.detailedLog(`Tab ${tab.id} scheduling skipped: active tab protected by preferences`);
					} else {
						const skipReason = await Suspension.shouldSkipTabForScheduling(tab, true);

						if (skipReason) {
							await cancelTabSuspendTracking(tab.id);
							stats.skipped++;
							Logger.detailedLog(`Tab ${tab.id} scheduling skipped: ${skipReason}`);
						} else {
							const scheduled = await scheduleTab(tab.id, tab);
							if (scheduled) {
								stats.success++;
							} else {
								stats.failed++;
							}
						}
					}
				} catch (e) {
					stats.failed++;
					Logger.logError(`Error batch scheduling tab ${tab.id}:`, e);
				}
			}));

			if (i + batchSize < tabs.length) {
				await new Promise(resolve => setTimeout(resolve, SMALL_DELAY_MS));
			}
		}

		Logger.log(`Tab scheduling complete: ${stats.success} scheduled, ${stats.skipped} skipped, ${stats.failed} failed, ${stats.total} total`);
		persistSchedulesDebounced();
		return stats;
	} catch (e) {
		Logger.logError(`Error in scheduleAllTabs:`, e);
		return stats;
	}
}

/**
 * Creates a debounced function that delays invocation until after wait milliseconds.
 * This version tracks timeouts for proper cleanup when the service worker is suspended.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @param {string} [key] - Optional unique key for this debounced function. If not provided, uses the function itself.
 * @returns {Function} - The debounced function.
 */
function debounce(func, wait, key) {
	const timeoutKey = key || func;

	return function executedFunction(...args) {
		const later = () => {
			try {
				debounceTimeouts.delete(timeoutKey);
				func(...args);
			} catch (error) {
				if (error.message && (
					error.message.includes("Extension context invalidated") ||
					error.message.includes("Extension context was invalidated")
				)) {
					Logger.logError(`Debounced function execution failed due to extension context invalidation: ${key || 'unknown'}`);
				} else {
					Logger.logError(`Error in debounced function execution: ${error.message}`, error);
				}
			}
		};

		try {
			const existingTimeout = debounceTimeouts.get(timeoutKey);
			if (existingTimeout) {
				clearTimeout(existingTimeout);
			}
			const newTimeout = setTimeout(later, wait);
			debounceTimeouts.set(timeoutKey, newTimeout);
		} catch (error) {
			Logger.logError(`Error setting up debounced timeout: ${error.message}`, error);
		}
	};
}

export const debouncedScheduleAllTabs = debounce(() => {
	Logger.log('Executing debounced scheduleAllTabs');
	return scheduleAllTabs().catch(e => {
		Logger.logError('Error in debouncedScheduleAllTabs:', e);
	});
}, DEBOUNCE_DELAY_MS, 'scheduleAllTabs');

/**
 * Alarm-backed debounce to survive service worker restarts
 */
export async function debouncedScheduleAllTabsAlarmBacked() {
	try {
		// Best-effort in-process debounce (fast path if worker stays alive)
		debouncedScheduleAllTabs();

		// Also schedule an alarm so reschedule happens even if worker sleeps
		await chrome.alarms.clear(Const.TS_SCHEDULE_DEBOUNCE_ALARM);
		const minDelayMinutes = 0.1; // 6 seconds is minimum allowed
		await chrome.alarms.create(Const.TS_SCHEDULE_DEBOUNCE_ALARM, { delayInMinutes: minDelayMinutes });
		Logger.detailedLog('Scheduled alarm-backed debounced scheduleAllTabs', Logger.LogComponent.SCHEDULING);
	} catch (e) {
		Logger.logError('debouncedScheduleAllTabsAlarmBacked', e, Logger.LogComponent.SCHEDULING);
		// Fall back to immediate scheduling on error
		try { await scheduleAllTabs(); } catch (_) { }
	}
}

/**
 * Clear all debounced timeouts - called during extension cleanup
 */
export function clearDebouncedTimeouts() {
	try {
		for (const timeout of debounceTimeouts.values()) {
			clearTimeout(timeout);
		}
		debounceTimeouts.clear();
		Logger.log('Cleared all debounced timeouts');
	} catch (error) {
		Logger.logError(`Error clearing debounced timeouts: ${error.message}`, error);
	}
}