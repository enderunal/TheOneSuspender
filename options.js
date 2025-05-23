// options.js
import { defaultPrefs, PREFS_KEY, WHITELIST_KEY } from './prefs.js'; // Import PREFS_KEY and WHITELIST_KEY
import { log, logError, LogComponent } from './logger.js';
import { parseWhitelistText, addToWhitelist, isWhitelisted, resolveTabUrl } from './whitelist-utils.js';
import * as Const from './constants.js';

document.addEventListener("DOMContentLoaded", () => {
	const form = document.getElementById("settings-form");
	const inactivityMinutesInput = document.getElementById("inactivityMinutes");
	// Create an error span for inactivityMinutes if it doesn't exist
	let inactivityErrorSpan = document.getElementById("inactivityMinutesError");
	if (!inactivityErrorSpan) {
		inactivityErrorSpan = document.createElement('span');
		inactivityErrorSpan.id = "inactivityMinutesError";
		inactivityErrorSpan.className = 'error-message';
		inactivityMinutesInput.parentNode.insertBefore(inactivityErrorSpan, inactivityMinutesInput.nextSibling);
	}

	const preserveHistoryInput = document.getElementById("preserveHistory");
	const neverSuspendPinnedInput = document.getElementById("neverSuspendPinned");
	const neverSuspendAudioInput = document.getElementById("neverSuspendAudio");
	const neverSuspendActiveInput = document.getElementById("neverSuspendActive");
	const neverSuspendLastWindowInput = document.getElementById("neverSuspendLastWindow");
	const neverSuspendOfflineInput = document.getElementById("neverSuspendOffline");
	const neverSuspendWhenChargingInput = document.getElementById("neverSuspendWhenCharging");
	const restoreOnStartupInput = document.getElementById("restoreOnStartup");
	const whitelistTextarea = document.getElementById("whitelist");
	const saveStatus = document.getElementById("save-status");

	const unsavedFormHandlingRadios = document.querySelectorAll('input[name="unsavedFormHandling"]');
	const autoReloadOnUpdateInput = document.getElementById("autoReloadOnUpdate");
	const saveButton = document.getElementById("save-settings");

	function validateInactivityMinutes() {
		const value = parseInt(inactivityMinutesInput.value, 10);
		if (isNaN(value) || value < 1 || value > 120) {
			inactivityErrorSpan.textContent = "Must be a number between 1 and 120.";
			inactivityErrorSpan.style.display = 'block';
			saveButton.disabled = true;
			return false;
		} else {
			inactivityErrorSpan.textContent = "";
			inactivityErrorSpan.style.display = 'none';
			saveButton.disabled = false;
			return true;
		}
	}

	inactivityMinutesInput.addEventListener('input', validateInactivityMinutes);

	// --- Load Settings ---
	function loadSettings() {
		// Populate with defaults first so we always have something
		populateForm(defaultPrefs, []);

		// Corrected: Use chrome.storage.local and PREFS_KEY, WHITELIST_KEY
		chrome.storage.local.get([PREFS_KEY, WHITELIST_KEY], (result) => {
			const loadedSettings = { ...defaultPrefs, ...(result[PREFS_KEY] || {}) };
			if (loadedSettings.suspendAfter > 0) {
				loadedSettings.lastPositiveSuspendAfter = loadedSettings.suspendAfter;
			} else if (!loadedSettings.lastPositiveSuspendAfter || loadedSettings.lastPositiveSuspendAfter <= 0) {
				loadedSettings.lastPositiveSuspendAfter = defaultPrefs.suspendAfter > 0 ? defaultPrefs.suspendAfter : 1;
			}
			populateForm(loadedSettings, result[WHITELIST_KEY] || []);
			validateInactivityMinutes();
		});
	}

	function populateForm(settings, whitelistItems) {
		inactivityMinutesInput.value = settings.suspendAfter > 0 ? settings.suspendAfter : settings.lastPositiveSuspendAfter;
		preserveHistoryInput.checked = settings.preserveHistory;
		neverSuspendPinnedInput.checked = settings.neverSuspendPinned;
		neverSuspendAudioInput.checked = settings.neverSuspendAudio;
		neverSuspendActiveInput.checked = settings.neverSuspendActive;
		neverSuspendLastWindowInput.checked = settings.neverSuspendLastWindow;
		neverSuspendOfflineInput.checked = settings.neverSuspendOffline;
		neverSuspendWhenChargingInput.checked = settings.neverSuspendWhenCharging;
		restoreOnStartupInput.checked = settings.restoreOnStartup;
		autoReloadOnUpdateInput.checked = settings.autoReloadOnUpdate !== false; // Default to true if not set
		whitelistTextarea.value = (Array.isArray(whitelistItems) ? whitelistItems : []).join("\n");

		// Set unsaved form handling radio
		let foundRadio = false;
		unsavedFormHandlingRadios.forEach(radio => {
			if (radio.value === settings.unsavedFormHandling) {
				radio.checked = true;
				foundRadio = true;
			}
		});
		if (!foundRadio) { // Default to 'normal' if value from storage is invalid
			const defaultRadio = document.querySelector('input[name="unsavedFormHandling"][value="normal"]');
			if (defaultRadio) defaultRadio.checked = true;
		}
	}

	// --- Save Settings ---
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		if (!validateInactivityMinutes()) {
			return; // Don't submit if invalid
		}

		saveStatus.textContent = "Saving...";
		saveStatus.className = 'status-message info';

		const selectedUnsavedHandling = document.querySelector('input[name="unsavedFormHandling"]:checked');
		let suspendAfterValue = parseInt(inactivityMinutesInput.value, 10);
		if (isNaN(suspendAfterValue) || suspendAfterValue <= 0) {
			suspendAfterValue = defaultPrefs.lastPositiveSuspendAfter > 0 ? defaultPrefs.lastPositiveSuspendAfter : 1;
		}

		const newSettings = {
			suspendAfter: suspendAfterValue,
			preserveHistory: preserveHistoryInput.checked,
			neverSuspendPinned: neverSuspendPinnedInput.checked,
			neverSuspendAudio: neverSuspendAudioInput.checked,
			neverSuspendActive: neverSuspendActiveInput.checked,
			neverSuspendLastWindow: neverSuspendLastWindowInput.checked,
			neverSuspendOffline: neverSuspendOfflineInput.checked,
			neverSuspendWhenCharging: neverSuspendWhenChargingInput.checked,
			unsavedFormHandling: selectedUnsavedHandling ? selectedUnsavedHandling.value : 'normal',
			autoReloadOnUpdate: autoReloadOnUpdateInput.checked,
			restoreOnStartup: restoreOnStartupInput.checked,
		};

		Object.keys(defaultPrefs).forEach(key => {
			if (newSettings[key] === undefined) {
				newSettings[key] = defaultPrefs[key];
			}
		});

		log(`Value of whitelistTextarea.value before splitting: ${whitelistTextarea.value}`, LogComponent.OPTIONS);

		const newWhitelist = parseWhitelistText(whitelistTextarea.value);
		log(`Constructed newWhitelist array: ${newWhitelist}`, LogComponent.OPTIONS);

		chrome.runtime.sendMessage({ type: Const.MSG_SAVE_SETTINGS, settings: newSettings }, (response) => {
			if (chrome.runtime.lastError || !response?.success) {
				saveStatus.textContent = "Error saving settings! " + (chrome.runtime.lastError?.message || response?.error || "");
				saveStatus.className = 'status-message error';
			} else {
				chrome.runtime.sendMessage({ type: Const.MSG_SAVE_WHITELIST, newWhitelist: newWhitelist }, (wlResponse) => {
					if (chrome.runtime.lastError || !wlResponse?.success) {
						saveStatus.textContent = "Settings saved, but error saving whitelist! " + (chrome.runtime.lastError?.message || wlResponse?.error || "");
						saveStatus.className = 'status-message warning';
					} else {
						saveStatus.textContent = "Settings and whitelist saved!";
						saveStatus.className = 'status-message success';
						if (newSettings.suspendAfter > 0) {
							// No direct access to prefs object here to update, background handles it.
						}
					}
					setTimeout(() => { saveStatus.textContent = ""; saveStatus.className = 'status-message'; }, 3000);
				});
			}
		});
	});

	// --- Initial Load ---
	loadSettings();
});
