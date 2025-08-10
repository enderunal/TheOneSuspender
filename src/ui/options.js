// options.js
import * as Prefs from '../common/prefs.js'; // Import PREFS_KEY and WHITELIST_KEY
import * as Logger from '../common/logger.js';
import * as Const from '../common/constants.js';
import * as WhitelistUtils from '../common/whitelist-utils.js';
import * as Theme from '../common/theme.js';
import * as SessionManager from '../common/session-manager.js';
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

	// Logging control elements
	const enableStandardLogsInput = document.getElementById("enableStandardLogs");
	const enableDetailedLogsInput = document.getElementById("enableDetailedLogs");
	const enableWarningLogsInput = document.getElementById("enableWarningLogs");
	const enableErrorLogsInput = document.getElementById("enableErrorLogs");

	// --- Export/Import Suspended Tabs ---
	const exportBtn = document.getElementById("export-suspended-tabs");
	const exportFormat = document.getElementById("export-format");
	const importFileInput = document.getElementById("import-file");
	const importBtn = document.getElementById("import-suspended-tabs");
	const exportImportStatus = document.getElementById("export-import-status");
	// Favicon tools elements
	const clearFaviconCacheBtn = document.getElementById('clear-favicon-cache');
	const refreshFaviconsBtn = document.getElementById('refresh-favicons');
	const faviconToolsStatus = document.getElementById('favicon-tools-status');

	// Stats elements
	const refreshStatsBtn = document.getElementById('refresh-stats');
	const statTotalEl = document.getElementById('stat-total');
	const statSuspendedEl = document.getElementById('stat-suspended');
	const statScheduledEl = document.getElementById('stat-scheduled');
	const statOtherEl = document.getElementById('stat-other');

	function setFaviconToolsStatus(msg, type = 'info') {
		if (!faviconToolsStatus) return;
		faviconToolsStatus.textContent = msg;
		faviconToolsStatus.className = `md-feedback visible ${type}`;
		if (msg) faviconToolsStatus.classList.add('visible');
		else faviconToolsStatus.classList.remove('visible');
	}

	async function refreshStats() {
		try {
			const resp = await new Promise((resolve) => chrome.runtime.sendMessage({ type: Const.MSG_GET_EXTENSION_STATS }, resolve));
			if (!resp || !resp.success) throw new Error(resp?.error || 'Failed to get stats');
			if (statTotalEl) statTotalEl.textContent = String(resp.total);
			if (statSuspendedEl) statSuspendedEl.textContent = String(resp.suspended);
			if (statScheduledEl) statScheduledEl.textContent = String(resp.scheduled);
			if (statOtherEl) statOtherEl.textContent = String(resp.total - resp.suspended - resp.scheduled);
		} catch (e) {
			console.error('Failed to refresh stats', e);
		}
	}


	// Session Manager elements
	const saveCurrentSessionBtn = document.getElementById("save-current-session");
	const sessionAutoSaveEnabledCheckbox = document.getElementById("sessionAutoSaveEnabled");
	const clearAllSessionsBtn = document.getElementById("clear-all-sessions");
	const sessionSortSelect = document.getElementById("session-sort");
	const sessionStatus = document.getElementById("session-status");
	const sessionsLoading = document.getElementById("sessions-loading");
	const sessionsEmpty = document.getElementById("sessions-empty");
	const sessionsList = document.getElementById("sessions-list");

	// Session Configuration elements (now part of main form)
	const sessionMaxSessionsInput = document.getElementById("sessionMaxSessions");
	const sessionAutoSaveFrequencyInput = document.getElementById("sessionAutoSaveFrequency");

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

	function validateSessionSettings() {
		let isValid = true;

		// Validate max sessions
		const maxSessions = parseInt(sessionMaxSessionsInput.value, 10);
		if (isNaN(maxSessions) || maxSessions < 1) {
			// Could add error display here if needed
			isValid = false;
		}

		// Validate auto-save frequency
		const frequency = parseInt(sessionAutoSaveFrequencyInput.value, 10);
		if (isNaN(frequency) || frequency < 1 || frequency > 1440) {
			// Could add error display here if needed
			isValid = false;
		}

		return isValid;
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
	// Tools: Favicon cache clear
	if (clearFaviconCacheBtn) {
		clearFaviconCacheBtn.addEventListener('click', async () => {
			setFaviconToolsStatus('Clearing favicon cache...', 'info');
			try {
				const resp = await new Promise((resolve) => chrome.runtime.sendMessage({ type: Const.MSG_CLEAR_FAVICON_CACHE }, resolve));
				if (!resp || !resp.success) throw new Error(resp?.error || 'Failed');
				setFaviconToolsStatus('Favicon cache cleared.', 'success');
			} catch (e) {
				setFaviconToolsStatus('Error clearing favicon cache: ' + (e.message || e), 'error');
			}
			setTimeout(() => setFaviconToolsStatus(''), 2500);
		});
	}

	// Tools: Refresh favicons for suspended tabs
	if (refreshFaviconsBtn) {
		refreshFaviconsBtn.addEventListener('click', async () => {
			setFaviconToolsStatus('Refreshing suspended favicons...', 'info');
			try {
				const resp = await new Promise((resolve) => chrome.runtime.sendMessage({ type: Const.MSG_REFRESH_ALL_SUSPENDED_FAVICONS }, resolve));
				if (!resp || !resp.success) throw new Error(resp?.error || 'Failed');
				setFaviconToolsStatus(`Triggered refresh on ${resp.count} suspended tabs.`, 'success');
			} catch (e) {
				setFaviconToolsStatus('Error refreshing favicons: ' + (e.message || e), 'error');
			}
			setTimeout(() => setFaviconToolsStatus(''), 2500);
		});
	}

	// Tools: Stats refresh
	if (refreshStatsBtn) {
		refreshStatsBtn.addEventListener('click', refreshStats);
	}


	// --- Load Settings ---
	async function loadSettings() {
		// Populate with defaults first so we always have something
		populateForm(Prefs.defaultPrefs, []);

		try {
			const result = await chrome.storage.local.get([Prefs.PREFS_KEY, Prefs.WHITELIST_KEY]);
			const loadedSettings = { ...Prefs.defaultPrefs, ...(result[Prefs.PREFS_KEY] || {}) };
			if (loadedSettings.suspendAfter > 0) {
				loadedSettings.lastPositiveSuspendAfter = loadedSettings.suspendAfter;
			} else if (!loadedSettings.lastPositiveSuspendAfter || loadedSettings.lastPositiveSuspendAfter <= 0) {
				loadedSettings.lastPositiveSuspendAfter = Prefs.defaultPrefs.suspendAfter > 0 ? Prefs.defaultPrefs.suspendAfter : 1;
			}
			populateForm(loadedSettings, result[Prefs.WHITELIST_KEY] || []);
			validateInactivityMinutes();
		} catch (error) {
			showError(error.message || 'Failed to load settings');
		}
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

		// Update theme selection UI
		selectTheme(settings.theme || 'gold');

		// Session configuration values
		sessionMaxSessionsInput.value = settings.sessionMaxSessions || 50;
		sessionAutoSaveFrequencyInput.value = settings.sessionAutoSaveFrequency || 5;

		// Update session auto-save checkbox (load status from SessionManager)
		updateAutoSaveStatus();

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

		// Load logging settings
		enableStandardLogsInput.checked = settings.enableStandardLogs !== false; // Default to true
		enableDetailedLogsInput.checked = settings.enableDetailedLogs !== false; // Default to true
		enableWarningLogsInput.checked = settings.enableWarningLogs !== false; // Default to true
		enableErrorLogsInput.checked = settings.enableErrorLogs !== false; // Default to true

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
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (!validateInactivityMinutes() || !validateSessionSettings()) {
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
			sessionMaxSessions: parseInt(sessionMaxSessionsInput.value, 10),
			sessionAutoSaveFrequency: parseInt(sessionAutoSaveFrequencyInput.value, 10),
			// Logging settings
			enableStandardLogs: enableStandardLogsInput.checked,
			enableDetailedLogs: enableDetailedLogsInput.checked,
			enableWarningLogs: enableWarningLogsInput.checked,
			enableErrorLogs: enableErrorLogsInput.checked
		};

		Logger.log(`Value of whitelistTextarea.value before splitting: ${whitelistTextarea.value}`, Logger.LogComponent.OPTIONS);

		const newWhitelist = WhitelistUtils.parseWhitelistText(whitelistTextarea.value);
		Logger.log(`Constructed newWhitelist array: ${newWhitelist}`, Logger.LogComponent.OPTIONS);

		// Save all settings using proper async/await pattern
		try {
			// 1. Save main settings
			const settingsResponse = await new Promise((resolve) => {
				chrome.runtime.sendMessage({ type: Const.MSG_SAVE_SETTINGS, settings: newSettings }, resolve);
			});

			if (chrome.runtime.lastError || !settingsResponse?.success) {
				throw new Error(chrome.runtime.lastError?.message || settingsResponse?.error || "Failed to save settings");
			}

			// 2. Save session auto-save enabled state
			await SessionManager.setAutoSaveEnabled(sessionAutoSaveEnabledCheckbox?.checked || false);

			// 3. Trim sessions if max was reduced
			const removedCount = await SessionManager.trimSessionsToLimit();

			// 4. Save whitelist
			const whitelistResponse = await new Promise((resolve) => {
				chrome.runtime.sendMessage({ type: Const.MSG_SAVE_WHITELIST, newWhitelist: newWhitelist }, resolve);
			});

			if (chrome.runtime.lastError || !whitelistResponse?.success) {
				throw new Error(chrome.runtime.lastError?.message || whitelistResponse?.error || "Failed to save whitelist");
			}

			// 5. Notify background script about preferences change (handles session auto-save rescheduling automatically)
			const prefsResponse = await new Promise((resolve) => {
				chrome.runtime.sendMessage({ type: Const.MSG_PREFS_CHANGED }, resolve);
			});

			if (chrome.runtime.lastError || !prefsResponse?.success) {
				if (prefsResponse?.stillInitializing) {
					Logger.logWarning("Warning: Background script is still initializing, preferences may not be fully applied yet", Logger.LogComponent.OPTIONS);
				} else {
					const errorMsg = chrome.runtime.lastError?.message || prefsResponse?.error || "Unknown error";
					Logger.logWarning(`Warning: Failed to notify background script of preference changes: ${errorMsg}`, Logger.LogComponent.OPTIONS);
				}
			}

			// Success message
			let message = "Settings and whitelist saved!";
			if (removedCount > 0) {
				message += ` (${removedCount} old sessions removed)`;
			}
			setSaveStatus(message, "success");

			// Reload sessions list if any were removed and we're on the sessions tab
			if (removedCount > 0) {
				const activeTab = document.querySelector('.tab-content.active');
				if (activeTab && activeTab.id === 'tab-sessions') {
					await loadSessions();
				}
			}

		} catch (error) {
			Logger.logError("Error saving settings", error, Logger.LogComponent.OPTIONS);
			setSaveStatus("Error saving settings: " + error.message, "error");
		} finally {
			// Clear status after 3 seconds
			setTimeout(() => { setSaveStatus(""); }, 3000);
		}
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

	// ===================== Session Manager Functions =====================

	function setSessionStatus(msg, type = "info") {
		sessionStatus.textContent = msg;
		sessionStatus.className = `md-feedback visible ${type}`;
		if (msg) {
			sessionStatus.classList.add('visible');
		} else {
			sessionStatus.classList.remove('visible');
		}

		// Clear status after delay
		if (type !== "error") {
			setTimeout(() => {
				sessionStatus.classList.remove('visible');
			}, 3000);
		}
	}

	async function loadSessions() {
		try {
			sessionsLoading.classList.remove('hidden');
			sessionsEmpty.classList.add('hidden');
			sessionsList.innerHTML = '';

			const sessions = await SessionManager.getSavedSessions();

			if (sessions.length === 0) {
				sessionsLoading.classList.add('hidden');
				sessionsEmpty.classList.remove('hidden');
				return;
			}

			// Sort sessions
			const sortBy = sessionSortSelect.value;
			sortSessions(sessions, sortBy);

			// Create table structure
			const table = document.createElement('table');
			table.className = 'sessions-table';
			table.innerHTML = `
				<thead>
					<tr>
						<th>Name</th>
						<th>Date</th>
						<th>Windows</th>
						<th>Tabs</th>
						<th>Suspended</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody></tbody>
			`;

			const tbody = table.querySelector('tbody');

			// Render sessions as table rows
			sessions.forEach(session => {
				const sessionFragment = createSessionRow(session);
				tbody.appendChild(sessionFragment);
			});

			sessionsList.appendChild(table);
			sessionsLoading.classList.add('hidden');
		} catch (error) {
			Logger.logError("Error loading sessions", error, Logger.LogComponent.OPTIONS);
			setSessionStatus("Error loading sessions: " + error.message, "error");
			sessionsLoading.classList.add('hidden');
		}
	}

	function sortSessions(sessions, sortBy) {
		switch (sortBy) {
			case 'newest':
				sessions.sort((a, b) => b.timestamp - a.timestamp);
				break;
			case 'oldest':
				sessions.sort((a, b) => a.timestamp - b.timestamp);
				break;
			case 'name':
				sessions.sort((a, b) => a.name.localeCompare(b.name));
				break;
		}
	}

	function createSessionRow(session) {
		const row = document.createElement('tr');
		row.className = 'session-row';
		row.setAttribute('data-session-id', session.id);
		row.innerHTML = `
			<td class="session-name">
				<div class="session-name-container">
					<span class="session-name-text">${escapeHtml(session.name)} ${session.isAutoSave ? '<span class="session-auto-badge">Auto</span>' : ''}</span>
					<button type="button" class="session-expand-btn" aria-label="Toggle session details">
						<span class="expand-icon"></span>
					</button>
				</div>
			</td>
			<td class="session-date">${formatDate(session.timestamp)}</td>
			<td class="session-windows">${session.stats.totalWindows}</td>
			<td class="session-tabs">${session.stats.totalTabs}</td>
			<td class="session-suspended">${session.stats.suspendedTabs}</td>
			<td class="session-actions">
				<button type="button" class="md-button text compact restore-session-btn" data-session-id="${session.id}">
					Restore
				</button>
				<button type="button" class="md-button text compact delete-session-btn" data-session-id="${session.id}">
					Delete
				</button>
			</td>
		`;

		// Create details row (hidden by default)
		const detailsRow = document.createElement('tr');
		detailsRow.className = 'session-details-row hidden';
		detailsRow.innerHTML = `
			<td colspan="6" class="session-details-content">
				<div class="session-details-container">
					<h4>Session Details</h4>
					<div class="session-windows-details">
						${session.data.windows.map((window, index) => createWindowDetails(window, index)).join('')}
					</div>
				</div>
			</td>
		`;

		// Add event listeners
		const restoreBtn = row.querySelector('.restore-session-btn');
		const deleteBtn = row.querySelector('.delete-session-btn');
		const expandBtn = row.querySelector('.session-expand-btn');

		restoreBtn.addEventListener('click', () => restoreSession(session.id));
		deleteBtn.addEventListener('click', () => deleteSession(session.id));
		expandBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const isExpanded = !detailsRow.classList.contains('hidden');
			detailsRow.classList.toggle('hidden');

			// Update icon appearance
			const icon = expandBtn.querySelector('.expand-icon');
			icon.classList.toggle('expanded', !isExpanded);
		});

		// Return both rows as a DocumentFragment
		const fragment = document.createDocumentFragment();
		fragment.appendChild(row);
		fragment.appendChild(detailsRow);

		return fragment;
	}

	function createWindowDetails(windowData, windowIndex) {
		const suspendedCount = windowData.tabs.filter(tab => tab.isSuspended).length;
		return `
			<div class="window-details">
				<div class="window-header">
					<h5>Window ${windowIndex + 1}</h5>
					<span class="window-stats">${windowData.tabs.length} tabs (${suspendedCount} suspended)</span>
				</div>
				<div class="window-tabs-list">
					${windowData.tabs.map((tab, tabIndex) => `
						<div class="tab-item ${tab.isSuspended ? 'suspended' : ''}">
							<span class="tab-index">${tabIndex + 1}.</span>
							<span class="tab-title">${escapeHtml(tab.title || 'Untitled')}</span>
							<span class="tab-url">${escapeHtml(tab.originalUrl || tab.url || '')}</span>
							${tab.isSuspended ? '<span class="suspended-indicator">suspended</span>' : ''}
						</div>
					`).join('')}
				</div>
			</div>
		`;
	}

	async function saveCurrentSession() {
		try {
			setSessionStatus("Saving current session...", "info");
			const session = await SessionManager.saveCurrentSession();
			setSessionStatus(`Session saved: ${session.name}`, "success");
			await loadSessions();
		} catch (error) {
			Logger.logError("Error saving session", error, Logger.LogComponent.OPTIONS);
			setSessionStatus("Error saving session: " + error.message, "error");
		}
	}

	async function restoreSession(sessionId) {
		if (!sessionId) return;

		try {
			setRestoreLoading(sessionId, true);

			// Ask user whether to restore suspended tabs as suspended or active
			const restoreSuspended = confirm(
				'Do you want to restore suspended tabs in their suspended state?\n\n' +
				'Click OK to keep them suspended (faster, preserves memory usage)\n' +
				'Click Cancel to restore them as active tabs (may use more memory)'
			);

			const success = await SessionManager.restoreSession(sessionId, restoreSuspended);

			if (success) {
				showNotification('Session restored successfully!', 'success');
			} else {
				showNotification('Failed to restore session. Please try again.', 'error');
			}
		} catch (error) {
			console.error('Error restoring session:', error);
			showNotification('Error restoring session: ' + error.message, 'error');
		} finally {
			setRestoreLoading(sessionId, false);
		}
	}

	async function deleteSession(sessionId) {
		try {
			if (!confirm("Are you sure you want to delete this session? This cannot be undone.")) {
				return;
			}

			await SessionManager.deleteSession(sessionId);
			setSessionStatus("Session deleted", "success");
			await loadSessions();
		} catch (error) {
			Logger.logError("Error deleting session", error, Logger.LogComponent.OPTIONS);
			setSessionStatus("Error deleting session: " + error.message, "error");
		}
	}

	async function updateAutoSaveStatus() {
		try {
			const enabled = await SessionManager.getAutoSaveEnabled();
			if (sessionAutoSaveEnabledCheckbox) {
				sessionAutoSaveEnabledCheckbox.checked = enabled;
			}
		} catch (error) {
			Logger.logError("Error updating auto-save status", error, Logger.LogComponent.OPTIONS);
		}
	}


	async function clearAllSessions() {
		try {
			if (!confirm("This will delete ALL saved sessions. This action cannot be undone. Continue?")) {
				return;
			}

			setSessionStatus("Clearing all sessions...", "info");
			const success = await SessionManager.clearAllSessions();

			if (success) {
				setSessionStatus("All sessions cleared", "success");
				await loadSessions();
			} else {
				setSessionStatus("Error clearing sessions", "error");
			}
		} catch (error) {
			Logger.logError("Error clearing all sessions", error, Logger.LogComponent.OPTIONS);
			setSessionStatus("Error clearing all sessions: " + error.message, "error");
		}
	}

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	function formatDate(timestamp) {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now - date;
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 60) {
			return diffMins <= 1 ? 'Just now' : `${diffMins} minutes ago`;
		} else if (diffHours < 24) {
			return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
		} else if (diffDays < 7) {
			return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
		} else {
			return date.toLocaleDateString();
		}
	}

	// Session Manager Event Listeners
	if (saveCurrentSessionBtn) {
		saveCurrentSessionBtn.addEventListener('click', saveCurrentSession);
	}
	if (clearAllSessionsBtn) {
		clearAllSessionsBtn.addEventListener('click', clearAllSessions);
	}
	if (sessionSortSelect) {
		sessionSortSelect.addEventListener('change', loadSessions);
	}


	// --- Initial Load ---
	loadSettings();
	loadVersionInfo();

	// Check if sessions tab is currently active and load sessions
	const activeTab = document.querySelector('.tab-content.active');
	if (activeTab && activeTab.id === 'tab-sessions') {
		updateAutoSaveStatus();
		loadSessions();
	}

	// Load sessions when Sessions tab is active
	const tabButtons = document.querySelectorAll('.tab-button');
	tabButtons.forEach(button => {
		button.addEventListener('click', async () => {
			if (button.dataset.tab === 'sessions') {
				await updateAutoSaveStatus();
				await loadSessions();
			}
		});
	});
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

function setRestoreLoading(sessionId, isLoading) {
	const sessionRow = document.querySelector(`.session-row[data-session-id="${sessionId}"]`);
	if (!sessionRow) return;

	const restoreBtn = sessionRow.querySelector('.restore-session-btn');
	if (restoreBtn) {
		restoreBtn.disabled = isLoading;
		restoreBtn.textContent = isLoading ? 'Restoring...' : 'Restore';
	}
}

function showNotification(message, type = 'info') {
	// Create or update notification element
	let notification = document.getElementById('session-notification');
	if (!notification) {
		notification = document.createElement('div');
		notification.id = 'session-notification';
		notification.className = 'session-notification';
		document.querySelector('.sessions-container').prepend(notification);
	}

	notification.textContent = message;
	notification.className = `session-notification ${type} visible`;

	// Auto-hide after 5 seconds
	setTimeout(() => {
		if (notification) {
			notification.classList.remove('visible');
		}
	}, 5000);
}
