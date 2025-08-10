// content.js

(function () {
	if (window.__theOneSuspenderContentScriptInjected) return;
	window.__theOneSuspenderContentScriptInjected = true;

	// Only the constants and logic needed for the suspend prompt
	const MSG_PROMPT_SUSPEND = 'PROMPT_SUSPEND';
	const LOG_COMPONENT = "CS";
	const LOG_PREFIX = "TheOneSuspender";
	const MSG_SUSPEND_TAB = 'MSG_suspendTab';

	function log(message, ...args) {
		console.log(`[${LOG_PREFIX} ${LOG_COMPONENT}]`, message, ...args);
	}
	function logWarning(message, ...args) {
		console.warn(`[${LOG_PREFIX} ${LOG_COMPONENT} WARNING]`, message, ...args);
	}
	function logError(message, ...args) {
		console.error(`[${LOG_PREFIX} ${LOG_COMPONENT} ERROR]`, message, ...args);
	}

	// Securely listen for PROMPT_SUSPEND from extension only
	if (chrome && chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			if (message.type === MSG_PROMPT_SUSPEND && sender.id === chrome.runtime.id) {
				// Use native confirm dialog to avoid page CSP issues with inline styles
				try {
					const agreed = window.confirm('Suspend this tab? Unsaved changes on this page may be lost.');
					if (agreed) {
						chrome.runtime.sendMessage({ type: MSG_SUSPEND_TAB, isManual: true }, () => { });
					}
				} catch (e) {
					logError('Error showing confirm dialog', e);
				}
				sendResponse({ success: true });
				return true;
			}
			return false;
		});
	} else {
		logWarning('chrome.runtime.onMessage.addListener is not available. Content script message listener not registered.');
	}
	// Note: We intentionally avoid injecting any styled DOM to comply with strict page CSP.
})();
