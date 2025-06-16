// options.js
import * as Prefs from '../common/prefs.js'; // Import PREFS_KEY and WHITELIST_KEY
import * as Logger from '../common/logger.js';
import * as Const from '../common/constants.js';
import * as WhitelistUtils from '../common/whitelist-utils.js';
import * as Theme from '../common/theme.js';
import { initializeTabNavigation } from './tab-navigation.js';

document.addEventListener("DOMContentLoaded", async () => {
	// Initialize theme using common method
	await Theme.initializeThemeForPage();

	// Initialize Material Design tabs functionality
	initializeTabNavigation();

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
	const whitelistTextarea = document.getElementById("whitelist");
	const saveStatus = document.getElementById("save-status");
	const saveStatusAppearance = document.getElementById("save-status-appearance");
	const themeInput = document.getElementById("theme");
	const themePreviews = document.querySelectorAll('.theme-preview');

	const unsavedFormHandlingRadios = document.querySelectorAll('input[name="unsavedFormHandling"]');
	const saveButton = document.getElementById("save-settings");
	const autoSuspendEnabledInput = document.getElementById("autoSuspendEnabled");

	// --- Export/Import Suspended Tabs ---
	const exportBtn = document.getElementById("export-suspended-tabs");
	const exportFormat = document.getElementById("export-format");
	const importFileInput = document.getElementById("import-file");
	const importBtn = document.getElementById("import-suspended-tabs");
	const exportImportStatus = document.getElementById("export-import-status");

	function setExportImportStatus(msg, type = "info") {
		exportImportStatus.textContent = msg;
		exportImportStatus.className = `md-feedback visible ${type}`;
		if (msg) {
			exportImportStatus.classList.add('visible');
		} else {
			exportImportStatus.classList.remove('visible');
		}
	}

	function setSaveStatus(msg, type = "info") {
		// Update both save status elements
		[saveStatus, saveStatusAppearance].forEach(element => {
			if (element) {
				element.textContent = msg;
				element.className = msg ? `md-feedback visible ${type}` : 'md-feedback';
			}
		});
	}

	function validateInactivityMinutes() {
		const value = parseInt(inactivityMinutesInput.value, 10);
		if (isNaN(value) || value < 1) {
			inactivityErrorSpan.textContent = "Must be a number greater than 1.";
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

	autoSuspendEnabledInput.addEventListener('change', () => {
		inactivityMinutesInput.disabled = !autoSuspendEnabledInput.checked;
	});

	// Set up theme preview click handlers
	themePreviews.forEach(preview => {
		preview.addEventListener('click', () => {
			const selectedTheme = preview.getAttribute('data-theme');
			selectTheme(selectedTheme);
			Theme.applyTheme(selectedTheme);
		});
	});


	// Add event listeners for Material Design text field label positioning
	setupTextFieldListeners();

	// --- Load Settings ---
	function loadSettings() {
		// Populate with defaults first so we always have something
		populateForm(Prefs.defaultPrefs, []);

		// Corrected: Use chrome.storage.local and PREFS_KEY, WHITELIST_KEY
		chrome.storage.local.get([Prefs.PREFS_KEY, Prefs.WHITELIST_KEY], (result) => {
			const loadedSettings = { ...Prefs.defaultPrefs, ...(result[Prefs.PREFS_KEY] || {}) };
			if (loadedSettings.suspendAfter > 0) {
				loadedSettings.lastPositiveSuspendAfter = loadedSettings.suspendAfter;
			} else if (!loadedSettings.lastPositiveSuspendAfter || loadedSettings.lastPositiveSuspendAfter <= 0) {
				loadedSettings.lastPositiveSuspendAfter = Prefs.defaultPrefs.suspendAfter > 0 ? Prefs.defaultPrefs.suspendAfter : 1;
			}
			populateForm(loadedSettings, result[Prefs.WHITELIST_KEY] || []);
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
		whitelistTextarea.value = (Array.isArray(whitelistItems) ? whitelistItems : []).join("\n");
		autoSuspendEnabledInput.checked = settings.autoSuspendEnabled !== false; // Default to true if not set
		inactivityMinutesInput.disabled = !autoSuspendEnabledInput.checked;
		selectTheme(settings.theme || 'gold');

		// Apply theme on load
		Theme.applyTheme(settings.theme || 'gold');

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

		// Update Material Design text field labels after values are loaded
		updateTextFieldLabels();
	}

	// Function to update Material Design text field labels
	function updateTextFieldLabels() {
		const textFields = document.querySelectorAll('.md-text-field');
		textFields.forEach(field => {
			const input = field.querySelector('input, textarea, select');
			const label = field.querySelector('label');

			if (input && label) {
				// Force label positioning based on input state
				if (input.value && input.value.trim() !== '') {
					label.style.top = '-8px';
					label.style.fontSize = '12px';
					label.style.color = 'var(--md-sys-color-primary)';
				} else {
					label.style.top = '16px';
					label.style.fontSize = '16px';
					label.style.color = 'var(--md-sys-color-on-surface-variant)';
				}
			}
		});
	}

	// Function to select a theme and update the UI
	function selectTheme(themeName) {
		// Update hidden input
		themeInput.value = themeName;

		// Update visual selection
		themePreviews.forEach(preview => {
			if (preview.getAttribute('data-theme') === themeName) {
				preview.classList.add('selected');
			} else {
				preview.classList.remove('selected');
			}
		});
	}

	// Function to setup event listeners for text field label positioning
	function setupTextFieldListeners() {
		const textFields = document.querySelectorAll('.md-text-field');
		textFields.forEach(field => {
			const input = field.querySelector('input, textarea, select');
			const label = field.querySelector('label');

			if (input && label) {
				// Handle focus events
				input.addEventListener('focus', () => {
					label.style.top = '-8px';
					label.style.fontSize = '12px';
					label.style.color = 'var(--md-sys-color-primary)';
				});

				// Handle blur events
				input.addEventListener('blur', () => {
					if (!input.value || input.value.trim() === '') {
						label.style.top = '16px';
						label.style.fontSize = '16px';
						label.style.color = 'var(--md-sys-color-on-surface-variant)';
					}
				});

				// Handle input events for real-time updates
				input.addEventListener('input', () => {
					if (input.value && input.value.trim() !== '') {
						label.style.top = '-8px';
						label.style.fontSize = '12px';
						label.style.color = 'var(--md-sys-color-primary)';
					} else {
						label.style.top = '16px';
						label.style.fontSize = '16px';
						label.style.color = 'var(--md-sys-color-on-surface-variant)';
					}
				});
			}
		});
	}



	// --- Save Settings ---
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		if (!validateInactivityMinutes()) {
			return; // Don't submit if invalid
		}

		setSaveStatus("Saving...", "info");

		const selectedUnsavedHandling = document.querySelector('input[name="unsavedFormHandling"]:checked');
		let suspendAfterValue = parseInt(inactivityMinutesInput.value, 10);
		if (isNaN(suspendAfterValue) || suspendAfterValue <= 0) {
			suspendAfterValue = Prefs.defaultPrefs.lastPositiveSuspendAfter > 0 ? Prefs.defaultPrefs.lastPositiveSuspendAfter : 1;
		}

		const newSettings = {
			suspendAfter: suspendAfterValue,
			preserveHistory: preserveHistoryInput.checked,
			neverSuspendPinned: neverSuspendPinnedInput.checked,
			neverSuspendAudio: neverSuspendAudioInput.checked,
			neverSuspendActive: neverSuspendActiveInput.checked,
			neverSuspendLastWindow: neverSuspendLastWindowInput.checked,
			neverSuspendOffline: neverSuspendOfflineInput.checked,
			unsavedFormHandling: selectedUnsavedHandling ? selectedUnsavedHandling.value : 'normal',
			autoSuspendEnabled: autoSuspendEnabledInput.checked,
			theme: themeInput.value,
		};

		Logger.log(`Value of whitelistTextarea.value before splitting: ${whitelistTextarea.value}`, Logger.LogComponent.OPTIONS);

		const newWhitelist = WhitelistUtils.parseWhitelistText(whitelistTextarea.value);
		Logger.log(`Constructed newWhitelist array: ${newWhitelist}`, Logger.LogComponent.OPTIONS);

		chrome.runtime.sendMessage({ type: Const.MSG_SAVE_SETTINGS, settings: newSettings }, async (response) => {
			if (chrome.runtime.lastError || !response?.success) {
				setSaveStatus("Error saving settings! " + (chrome.runtime.lastError?.message || response?.error || ""), "error");
			} else {
				chrome.runtime.sendMessage({ type: Const.MSG_SAVE_WHITELIST, newWhitelist: newWhitelist }, (wlResponse) => {
					if (chrome.runtime.lastError || !wlResponse?.success) {
						setSaveStatus("Settings saved, but error saving whitelist! " + (chrome.runtime.lastError?.message || wlResponse?.error || ""), "warning");
					} else {
						setSaveStatus("Settings and whitelist saved!", "success");
					}
					setTimeout(() => { setSaveStatus(""); }, 3000);
				});
				await chrome.runtime.sendMessage({ type: Const.MSG_PREFS_CHANGED });
			}
		});
	});

	// --- Export/Import Suspended Tabs ---
	exportBtn.addEventListener("click", async () => {
		setExportImportStatus("Exporting suspended tabs...", "info");
		try {
			const windows = await chrome.windows.getAll({ populate: true });
			const suspendedPagePrefix = chrome.runtime.getURL("suspended.html");
			const exportData = [];
			for (const win of windows) {
				const suspendedTabs = (win.tabs || []).filter(tab => tab.url && tab.url.startsWith(suspendedPagePrefix));
				if (suspendedTabs.length === 0) continue;
				exportData.push({
					windowId: win.id,
					tabs: suspendedTabs.map(tab => ({
						title: tab.title,
						url: tab.url,
						favIconUrl: tab.favIconUrl,
						pinned: tab.pinned,
						index: tab.index,
						suspendedData: tab.url // for now, store the suspended URL
					}))
				});
			}
			if (exportData.length === 0) {
				setExportImportStatus("No suspended tabs found to export.", "info");
				return;
			}
			const now = new Date();
			const pad = n => n.toString().padStart(2, '0');
			const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
			const format = exportFormat.value;
			let blob, filename;
			if (format === "json") {
				blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
				filename = `suspended-tabs-${timestamp}.json`;
			} else {
				// TXT: human-readable
				let txt = "";
				exportData.forEach((win, i) => {
					txt += `Window ${i + 1} (ID: ${win.windowId})\n`;
					win.tabs.forEach((tab, j) => {
						txt += `  Tab ${j + 1}: ${tab.title || '(no title)'}\n    Suspended URL: ${tab.url}\n    Favicon: ${tab.favIconUrl || ''}\n    Pinned: ${tab.pinned}\n    Index: ${tab.index}\n`;
					});
					txt += "\n";
				});
				blob = new Blob([txt], { type: "text/plain" });
				filename = `suspended-tabs-${timestamp}.txt`;
			}
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			setTimeout(() => {
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}, 100);
			setExportImportStatus(`Exported ${exportData.reduce((acc, w) => acc + w.tabs.length, 0)} suspended tabs.`, "success");
		} catch (e) {
			setExportImportStatus("Error exporting suspended tabs: " + (e.message || e), "error");
		}
	});

	importBtn.addEventListener("click", async () => {
		setExportImportStatus("Importing suspended tabs...", "info");
		const file = importFileInput.files && importFileInput.files[0];
		if (!file) {
			setExportImportStatus("Please select a file to import.", "error");
			return;
		}
		try {
			const text = await file.text();
			let data;
			if (file.name.endsWith('.json')) {
				data = JSON.parse(text);
			} else {
				// Try to parse TXT (very basic, expects export format)
				data = [];
				const winBlocks = text.split(/\n\s*\n/).filter(Boolean);
				for (const block of winBlocks) {
					const lines = block.split(/\n/).map(l => l.trim());
					if (!lines[0].startsWith('Window')) continue;
					const windowId = parseInt((lines[0].match(/ID: (\d+)/) || [])[1] || 0, 10);
					const tabs = [];
					for (let i = 1; i < lines.length; i += 5) {
						const title = (lines[i] || '').replace(/^Tab \d+: /, '');
						const url = (lines[i + 1] || '').replace(/^Suspended URL: /, '');
						const favIconUrl = (lines[i + 2] || '').replace(/^Favicon: /, '');
						const pinned = (lines[i + 3] || '').replace(/^Pinned: /, '') === 'true';
						const index = parseInt((lines[i + 4] || '').replace(/^Index: /, ''), 10);
						if (url) tabs.push({ title, url, favIconUrl, pinned, index, suspendedData: url });
					}
					if (tabs.length) data.push({ windowId, tabs });
				}
			}
			if (!Array.isArray(data) || data.length === 0) throw new Error("No valid suspended tab data found in file.");

			// --- Fix extension ID in suspended tab URLs ---
			const suspendedPrefixPattern = /^chrome-extension:\/\/[^/]+\/suspended\.html/;
			const currentSuspendedPrefix = chrome.runtime.getURL('suspended.html');
			for (const win of data) {
				for (const tab of win.tabs) {
					if (suspendedPrefixPattern.test(tab.url)) {
						tab.url = tab.url.replace(suspendedPrefixPattern, currentSuspendedPrefix);
					}
				}
			}

			let totalTabs = 0, totalWindows = 0, errors = 0;
			for (const win of data) {
				const createData = { url: win.tabs.map(tab => tab.url), focused: false, state: 'minimized' };
				let createdWin;
				try {
					createdWin = await chrome.windows.create(createData);
					totalWindows++;
				} catch (e) {
					errors++;
					continue;
				}
				// For each tab, immediately suspend it (if not already)
				for (let i = 0; i < win.tabs.length; ++i) {
					const tabId = createdWin.tabs[i]?.id;
					if (!tabId) { errors++; continue; }
					try {
						// Send a message to background to suspend this tab (manual=true to skip unsaved checks)
						await chrome.runtime.sendMessage({ type: Const.MSG_SUSPEND_TAB, tabId, isManual: true });
						totalTabs++;
					} catch (e) {
						errors++;
					}
				}
			}
			setExportImportStatus(`Imported ${totalTabs} tabs in ${totalWindows} windows.${errors ? ' Errors: ' + errors : ''}`, errors ? "warning" : "success");
		} catch (e) {
			setExportImportStatus("Error importing suspended tabs: " + (e.message || e), "error");
		}
	});

	// --- Initial Load ---
	loadSettings();
	loadVersionInfo();
});

// ===================== Version Information =====================

/**
 * Load and display version information
 */
function loadVersionInfo() {
	try {
		const manifest = chrome.runtime.getManifest();
		const version = manifest.version;

		// Update version in About tab
		const extensionVersionSpan = document.getElementById('extension-version');
		if (extensionVersionSpan) {
			extensionVersionSpan.textContent = version;
		}

		// Update version in footer
		const footerVersionSpan = document.getElementById('footer-version');
		if (footerVersionSpan) {
			footerVersionSpan.textContent = version;
		}

		Logger.detailedLog(`Loaded version: ${version}`, Logger.LogComponent.OPTIONS);
	} catch (error) {
		Logger.logError("Error loading version info", error, Logger.LogComponent.OPTIONS);

		// Fallback if version can't be loaded
		const extensionVersionSpan = document.getElementById('extension-version');
		const footerVersionSpan = document.getElementById('footer-version');

		if (extensionVersionSpan) {
			extensionVersionSpan.textContent = 'Unknown';
		}
		if (footerVersionSpan) {
			footerVersionSpan.textContent = 'Unknown';
		}
	}
}
