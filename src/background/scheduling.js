// scheduling.js
import * as Const from '../common/constants.js';
import * as State from '../common/state.js';
import * as Logger from '../common/logger.js';
import * as Prefs from '../common/prefs.js';
import * as Suspension from '../suspension/suspension.js';

export const SMALL_DELAY_MS = 50;
export const DEBOUNCE_DELAY_MS = 5000; // For debouncing frequent events like settings changes before rescheduling

// Object to store tab suspension times (efficient, no per-tab alarms)
let tabSuspendTimes = new Map();

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

		const batchSize = 10;

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