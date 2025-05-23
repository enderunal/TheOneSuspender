import { addToWhitelist, removeFromWhitelist, isWhitelisted } from './whitelist-utils.js';
import * as Const from './constants.js';
import { PREFS_KEY, WHITELIST_KEY, defaultPrefs } from './prefs.js';

document.addEventListener("DOMContentLoaded", () => {
	// Consolidated UI elements reference
	const elements = {
		status: document.getElementById("tab-status"),
		url: document.getElementById("tab-url"),
		suspendRestore: document.getElementById("suspend-restore"),
		whitelistUrl: document.getElementById("whitelist-url"),
		whitelistDomain: document.getElementById("whitelist-domain"),
		suspendOthersWindow: document.getElementById("suspend-others-window"),
		suspendOthersAll: document.getElementById("suspend-others-all"),
		unsuspendAllWindow: document.getElementById("unsuspend-all-window"),
		unsuspendAllAll: document.getElementById("unsuspend-all-all"),
		openSettings: document.getElementById("open-settings"),
		actionFeedback: document.getElementById("action-feedback-message")
	};

	// Consolidated state variables
	let currentTab = null;
	let currentPrefs = {}; // Will be populated with full prefs object from background
	let currentWhitelist = [];
	let feedbackTimeout = null;

	// --- Initialization ---
	async function loadInitialData() {
		try {
			console.debug('[Popup] loadInitialData called');
			// Ask background if a bulk operation is running
			chrome.runtime.sendMessage({ type: 'IS_BULK_OP_RUNNING' }, (response) => {
				if (chrome.runtime.lastError) {
					console.debug('[Popup] loadInitialData: runtime.lastError', chrome.runtime.lastError);
					// Background not available, assume no operation
					loadNormalUI();
					return;
				}
				if (response && response.running) {
					showFeedback('Operation in progress...', true);
					disableAllControls();
					return;
				}
				loadNormalUI();
			});
		} catch (error) {
			showError(`Error loading initial data: ${error.message}`);
			disableAllControls();
		}
	}

	function loadNormalUI() {
		Object.values(elements).forEach(el => {
			if (el && typeof el.disabled !== 'undefined') el.disabled = false;
		});
		chrome.storage.local.get([PREFS_KEY, WHITELIST_KEY], (result) => {
			if (chrome.runtime.lastError) {
				showError(chrome.runtime.lastError.message);
				return;
			}
			chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
				if (chrome.runtime.lastError) {
					showError(chrome.runtime.lastError.message);
					return;
				}
				const activeTab = tabs[0];
				if (!activeTab) {
					showError('No active tab found.');
					disableAllControls();
					return;
				}
				currentTab = activeTab;
				currentPrefs = { ...defaultPrefs, ...(result[PREFS_KEY] || {}) };
				currentWhitelist = result[WHITELIST_KEY] || [];
				updateUI();
			});
		});
	}

	// Listen for changes to BULK_OP_IN_PROGRESS to update UI live
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === 'local' && changes.BULK_OP_IN_PROGRESS) {
			console.debug('[Popup] BULK_OP_IN_PROGRESS changed:', changes.BULK_OP_IN_PROGRESS);
			loadInitialData();
		}
	});

	function disableAllControls() {
		Object.values(elements).forEach(el => {
			if (el && typeof el.disabled !== 'undefined') el.disabled = true;
		});
		if (elements.status) elements.status.textContent = "Error";
		if (elements.openSettings) elements.openSettings.disabled = false; // Settings should always be accessible
	}

	// --- UI Update Logic ---
	function updateUI() {
		if (!currentTab || !elements.status || Object.keys(currentPrefs).length === 0) {
			if (elements.status) elements.status.textContent = "Loading...";
			return;
		}

		const isSuspendedPage = currentTab.url && currentTab.url.startsWith(chrome.runtime.getURL("suspended.html"));
		const isSpecialPage = currentTab.url &&
			(currentTab.url.startsWith('chrome://') ||
				currentTab.url.startsWith('about:') ||
				currentTab.url.startsWith('file://') ||
				!currentTab.url.match(/^https?:\/\//)); // Also consider non http/https as special for suspension

		elements.url.textContent = currentTab.title || currentTab.url;
		elements.url.title = currentTab.url;

		if (isSuspendedPage) {
			elements.status.textContent = "Suspended";
			elements.suspendRestore.textContent = "Restore Tab";
			elements.suspendRestore.disabled = false;
			disableWhitelistControls(true, "Tab is suspended");
		} else if (isSpecialPage) {
			elements.status.textContent = "Special Page";
			elements.suspendRestore.textContent = "Suspend Tab";
			elements.suspendRestore.disabled = true;
			disableWhitelistControls(true, "Cannot whitelist special pages");
		} else {
			elements.status.textContent = "Active";
			elements.suspendRestore.textContent = "Suspend Tab";
			elements.suspendRestore.disabled = false;
			updateWhitelistControls();
		}
	}

	function disableWhitelistControls(disabled, title = '') {
		elements.whitelistUrl.disabled = disabled;
		elements.whitelistDomain.disabled = disabled;
		elements.whitelistUrl.title = title;
		elements.whitelistDomain.title = title;
	}

	function updateWhitelistControls() {
		if (!currentTab || !currentTab.url) return;
		disableWhitelistControls(false);

		try {
			const urlObj = new URL(currentTab.url); // Might fail for invalid URLs, caught below
			const fullUrl = urlObj.href;
			// Use the same normalization as in handleWhitelistToggle
			const domain = normalizeDomain(urlObj.hostname);

			// Use shared utils for whitelist checks
			const urlWhitelisted = isWhitelisted(currentWhitelist, fullUrl);
			const domainWhitelisted = isWhitelisted(currentWhitelist, domain);

			elements.whitelistUrl.textContent = urlWhitelisted ? "URL Whitelisted ✓" : "Never Suspend URL";
			elements.whitelistDomain.textContent = domainWhitelisted ? "Domain Whitelisted ✓" : "Never Suspend Domain";

			// Add visual indication (button style) for both URL and domain
			if (urlWhitelisted) {
				elements.whitelistUrl.classList.add('whitelisted');
			} else {
				elements.whitelistUrl.classList.remove('whitelisted');
			}

			if (domainWhitelisted) {
				elements.whitelistDomain.classList.add('whitelisted');
			} else {
				elements.whitelistDomain.classList.remove('whitelisted');
			}
		} catch (e) {
			disableWhitelistControls(true, "Invalid tab URL for whitelisting");
		}
	}

	// --- Event Handlers ---
	async function handleSuspendRestore() {
		if (!currentTab || !currentTab.id) return;
		const isSuspendedPage = currentTab.url && currentTab.url.startsWith(chrome.runtime.getURL("suspended.html"));
		const action = isSuspendedPage
			? { type: Const.MSG_UNSUSPEND_TAB, tabId: currentTab.id, shouldFocus: false }
			: { type: Const.MSG_SUSPEND_TAB, tabId: currentTab.id, isManual: true };
		const feedback = isSuspendedPage ? "Unsuspending tab..." : "Suspending tab...";
		await sendMessageAndFeedback(action, feedback, () => window.close());
	}

	// --- Helper functions for normalization/validation ---
	function normalizeDomain(domain) {
		return domain.replace(/^www\./i, '').toLowerCase();
	}
	function isValidDomain(domain) {
		// Simple regex for domain validation
		return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
	}
	function isValidUrl(url) {
		try { new URL(url); return true; } catch { return false; }
	}

	async function handleWhitelistToggle(type) {
		if (!currentTab || !currentTab.url) return;
		let entry;
		try {
			const urlObj = new URL(currentTab.url);
			if (type === 'url') {
				entry = urlObj.href;
				if (!isValidUrl(entry)) {
					showError('Invalid URL for whitelisting.');
					return;
				}
			} else {
				entry = normalizeDomain(urlObj.hostname);
				if (!isValidDomain(entry)) {
					showError('Invalid domain for whitelisting.');
					return;
				}
			}
		} catch (e) {
			showError('Invalid URL for whitelisting.');
			return;
		}
		if (!entry) {
			showError('Cannot determine URL/domain for whitelisting.');
			return;
		}
		let newWhitelist = [...currentWhitelist];
		const isCurrentlyWhitelisted = isWhitelisted(newWhitelist, entry);
		if (isCurrentlyWhitelisted) {
			newWhitelist = removeFromWhitelist(newWhitelist, entry);
		} else {
			newWhitelist = addToWhitelist(newWhitelist, entry);
		}

		// Display appropriate message based on action
		const typeDisplay = type === 'url' ? 'URL' : 'Domain';
		const actionMessage = isCurrentlyWhitelisted
			? `Removing ${typeDisplay} from whitelist...`
			: `Adding ${typeDisplay} to whitelist...`;
		const successMessage = isCurrentlyWhitelisted
			? `Removed ${typeDisplay} from whitelist`
			: `Added ${typeDisplay} to whitelist`;

		await sendMessageAndFeedback(
			{ type: Const.MSG_SAVE_WHITELIST, newWhitelist: newWhitelist },
			actionMessage,
			() => {
				currentWhitelist = newWhitelist;
				updateUI();
				showFeedback(successMessage, false, 2000);
			}
		);
	}

	function setupEventListeners() {
		elements.suspendRestore.addEventListener("click", handleSuspendRestore);
		elements.whitelistUrl.addEventListener("click", () => handleWhitelistToggle('url'));
		elements.whitelistDomain.addEventListener("click", () => handleWhitelistToggle('domain'));
		elements.openSettings.addEventListener("click", () => { chrome.runtime.openOptionsPage(); window.close(); });

		elements.suspendOthersWindow.addEventListener("click", () => {
			if (currentTab && currentTab.windowId) {
				sendMessageAndFeedback({ type: Const.MSG_SUSPEND_ALL_TABS_IN_WINDOW, windowId: currentTab.windowId }, "Suspending other tabs in window...");
			} else {
				showError("Could not determine current window.");
			}
		});
		elements.suspendOthersAll.addEventListener("click", () => sendMessageAndFeedback({ type: Const.MSG_SUSPEND_ALL_TABS_ALL_SPECS }, "Suspending all other tabs..."));
		elements.unsuspendAllWindow.addEventListener("click", () => {
			if (currentTab && currentTab.windowId) {
				sendMessageAndFeedback({ type: Const.MSG_UNSUSPEND_ALL_TABS_IN_WINDOW, windowId: currentTab.windowId }, "Unsuspending all tabs in window...");
			} else {
				showError("Could not determine current window.");
			}
		});
		elements.unsuspendAllAll.addEventListener("click", () => sendMessageAndFeedback({ type: Const.MSG_UNSUSPEND_ALL_TABS_ALL_SPECS }, "Unsuspending all tabs..."));
	}

	// --- Communication & Feedback ---
	async function sendMessageAndFeedback(action, feedbackText, onSuccessCallback, onFailureCallback) {
		// Ask background if a bulk operation is running
		chrome.runtime.sendMessage({ type: 'IS_BULK_OP_RUNNING' }, (response) => {
			if (chrome.runtime.lastError) {
				// Background not available, assume no operation
				loadInitialData();
				return;
			}
			if (response && response.running) {
				showFeedback('Operation in progress...', true);
				disableAllControls();
				return;
			}
			// Disable all controls during operation
			disableAllControls();
			showFeedback(feedbackText, true); // Persistent while processing
			chrome.runtime.sendMessage(action).then((response) => {
				if (response && response.success) {
					showFeedback(feedbackText.replace("...", "succeeded!"), false, 2000);
					if (onSuccessCallback) onSuccessCallback();
				} else if (response && response.error) {
					showError(response.error);
					if (onFailureCallback) onFailureCallback();
				} else {
					showError(`Action failed: ${action.type}`);
					if (onFailureCallback) onFailureCallback();
				}
			}).catch((error) => {
				showError(`Error during ${action.type}: ${error.message}`);
				if (onFailureCallback) onFailureCallback();
			}).finally(() => {
				// Re-enable controls after operation
				loadInitialData();
			});
		});
	}

	function showFeedback(message, persistent = false, duration = 2000) {
		if (!elements.actionFeedback) return;
		elements.actionFeedback.textContent = message;
		elements.actionFeedback.className = 'feedback-message visible success';
		clearTimeout(feedbackTimeout);
		if (!persistent) {
			feedbackTimeout = setTimeout(() => {
				elements.actionFeedback.className = 'feedback-message';
			}, duration);
		}
	}

	function showError(message) {
		if (!elements.actionFeedback) return;
		elements.actionFeedback.textContent = message;
		elements.actionFeedback.className = 'feedback-message visible error';
		clearTimeout(feedbackTimeout);
		feedbackTimeout = setTimeout(() => {
			elements.actionFeedback.className = 'feedback-message';
		}, 5000);
	}

	// --- Startup Sequence ---
	loadInitialData();
	setupEventListeners();
});
