import * as Prefs from '../common/prefs.js';
import * as Const from '../common/constants.js';
import * as WhitelistUtils from '../common/whitelist-utils.js';
import * as Theme from '../common/theme.js';

document.addEventListener("DOMContentLoaded", async () => {
	// Initialize theme using common method
	await Theme.initializeThemeForPage();

	// Consolidated UI elements reference
	const elements = {
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
			const response = await chrome.runtime.sendMessage({ type: 'IS_BULK_OP_RUNNING' });
			if (response && response.running) {
				showFeedback('Operation in progress...', true);
				disableAllControls();
				return;
			}
			await loadNormalUI();
		} catch (error) {
			console.debug('[Popup] loadInitialData error:', error);
			// Check if it's an initialization error with more details
			if (error.message && error.message.includes('stillInitializing')) {
				const match = error.message.match(/attempt (\d+)/);
				const attemptNum = match ? match[1] : 'unknown';
				showError(`Extension is initializing (attempt ${attemptNum}). Please wait...`);
			} else if (error.message && error.message.includes('initializing')) {
				showError('Extension is initializing. Please wait and try again.');
			} else {
				showError(`Error loading initial data: ${error.message}`);
			}
			disableAllControls();
		}
	}

	async function loadNormalUI() {
		Object.values(elements).forEach(el => {
			if (el && typeof el.disabled !== 'undefined') el.disabled = false;
		});

		try {
			const result = await chrome.storage.local.get([Prefs.PREFS_KEY, Prefs.WHITELIST_KEY]);
			const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

			const activeTab = tabs[0];
			if (!activeTab) {
				showError('No active tab found.');
				disableAllControls();
				return;
			}

			currentTab = activeTab;
			currentPrefs = { ...Prefs.defaultPrefs, ...(result[Prefs.PREFS_KEY] || {}) };
			currentWhitelist = result[Prefs.WHITELIST_KEY] || [];
			updateUI();
		} catch (error) {
			showError(error.message || 'Failed to load popup data');
		}
	}

	// Bulk operation tracking simplified - no storage listener needed

	function disableAllControls() {
		Object.values(elements).forEach(el => {
			if (el && typeof el.disabled !== 'undefined') el.disabled = true;
		});
		if (elements.openSettings) elements.openSettings.disabled = false; // Settings should always be accessible
	}

	// --- UI Update Logic ---
	function updateUI() {
		if (!currentTab || Object.keys(currentPrefs).length === 0) {
			return;
		}

		const isSuspendedPage = currentTab.url && currentTab.url.startsWith(chrome.runtime.getURL("suspended.html"));
		const isSpecialPage = currentTab.url &&
			(currentTab.url.startsWith('chrome://') ||
				currentTab.url.startsWith('about:') ||
				currentTab.url.startsWith('file://') ||
				!currentTab.url.match(/^https?:\/\//)); // Also consider non http/https as special for suspension

		if (isSuspendedPage) {
			elements.suspendRestore.textContent = "Restore Tab";
			elements.suspendRestore.disabled = false;
			disableWhitelistControls(true, "Tab is suspended");
		} else if (isSpecialPage) {
			elements.suspendRestore.textContent = "Suspend Tab";
			elements.suspendRestore.disabled = true;
			disableWhitelistControls(true, "Cannot whitelist special pages");
		} else {
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
			const urlWhitelisted = WhitelistUtils.isWhitelisted(currentWhitelist, fullUrl);
			const domainWhitelisted = WhitelistUtils.isWhitelisted(currentWhitelist, domain);

			// Update only the text span to preserve the icon structure
			const urlTextSpan = elements.whitelistUrl.querySelector('.button-text');
			const domainTextSpan = elements.whitelistDomain.querySelector('.button-text');

			if (urlTextSpan) {
				urlTextSpan.textContent = urlWhitelisted ? "URL Whitelisted ✓" : "Never Suspend URL";
			}
			if (domainTextSpan) {
				domainTextSpan.textContent = domainWhitelisted ? "Domain Whitelisted ✓" : "Never Suspend Domain";
			}

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
		const isCurrentlyWhitelisted = WhitelistUtils.isWhitelisted(newWhitelist, entry);
		if (isCurrentlyWhitelisted) {
			newWhitelist = WhitelistUtils.removeFromWhitelist(newWhitelist, entry);
		} else {
			newWhitelist = WhitelistUtils.addToWhitelist(newWhitelist, entry);
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
		try {
			// Ask background if a bulk operation is running
			const bulkResponse = await chrome.runtime.sendMessage({ type: 'IS_BULK_OP_RUNNING' });
			if (bulkResponse && bulkResponse.running) {
				showFeedback('Operation in progress...', true);
				disableAllControls();
				return;
			}

			// Disable all controls during operation
			disableAllControls();
			showFeedback(feedbackText, true); // Persistent while processing

			const response = await chrome.runtime.sendMessage(action);
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
		} catch (error) {
			showError(`Error during ${action.type}: ${error.message}`);
			if (onFailureCallback) onFailureCallback();
		} finally {
			// Re-enable controls after operation
			await loadInitialData();
		}
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

	// --- Multi-tab suspend/unsuspend buttons logic ---
	// Utility function to show/hide multiple elements
	function setElementsVisibility(elements, visible) {
		elements.forEach(el => {
			if (el) {
				el.classList.toggle('hidden', !visible);
			}
		});
	}

	const suspendSelectedBtn = document.getElementById('suspend-selected-tabs');
	const unsuspendSelectedBtn = document.getElementById('unsuspend-selected-tabs');
	const selectedTabsSection = document.getElementById('selected-tabs-section');

	(async () => {
		try {
			const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });
			const show = tabs.length > 1;
			setElementsVisibility([selectedTabsSection], show);

			if (show) {
				const tabIds = tabs.map(tab => tab.id);
				if (suspendSelectedBtn) {
					suspendSelectedBtn.onclick = async function () {
						for (const tabId of tabIds) {
							await chrome.runtime.sendMessage({ type: Const.MSG_SUSPEND_TAB, tabId, isManual: true });
						}
						showFeedback("Suspending selected tabs...");
					};
				}
				if (unsuspendSelectedBtn) {
					unsuspendSelectedBtn.onclick = async function () {
						for (const tabId of tabIds) {
							await chrome.runtime.sendMessage({ type: Const.MSG_UNSUSPEND_TAB, tabId });
						}
						showFeedback("Unsuspending selected tabs...");
					};
				}
			}
		} catch (error) {
			console.error('Error setting up multi-tab buttons:', error);
		}
	})();

	// --- Startup Sequence ---
	loadInitialData();
	setupEventListeners();
});
