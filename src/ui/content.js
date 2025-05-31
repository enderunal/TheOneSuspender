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
			console.log('Received message:', message, sender);
			if (message.type === MSG_PROMPT_SUSPEND && sender.id === chrome.runtime.id) {
				console.log('Showing suspend dialog');
				showSuspendDialog();
				sendResponse({ success: true });
				return true;
			}
			return false;
		});
	} else {
		logWarning('chrome.runtime.onMessage.addListener is not available. Content script message listener not registered.');
	}

	function showSuspendDialog() {
		// The HTML for this modal is static and does not include any user-supplied or dynamic content, so it is safe from injection vulnerabilities.
		console.log('Creating suspend modal');
		const oldModal = document.getElementById('ts-suspend-modal');
		if (oldModal) oldModal.remove();
		const modal = document.createElement('div');
		modal.id = 'ts-suspend-modal';
		modal.style.position = 'fixed';
		modal.style.top = '0';
		modal.style.left = '0';
		modal.style.width = '100vw';
		modal.style.height = '100vh';
		modal.style.background = 'rgba(0,0,0,0.4)';
		modal.style.display = 'flex';
		modal.style.alignItems = 'center';
		modal.style.justifyContent = 'center';
		modal.style.zIndex = '2147483647';
		const box = document.createElement('div');
		box.style.background = '#fff';
		box.style.padding = '2em 2.5em';
		box.style.borderRadius = '10px';
		box.style.boxShadow = '0 2px 16px rgba(0,0,0,0.25)';
		box.style.maxWidth = '90vw';
		box.style.textAlign = 'center';
		box.innerHTML = `
			<div style="display:flex;align-items:center;justify-content:center;margin-bottom:1em;">
				<img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="The One Suspender" style="width:32px;height:32px;margin-right:0.5em;">
				<span style="font-size:1.3em;font-weight:bold;">The One Suspender</span>
			</div>
			<h2 style="margin:0 0 0.5em 0;">Suspend this tab?</h2>
			<p style="margin-bottom:1.5em;">This tab has unsaved form data. Are you sure you want to suspend it?<br><small style='color:#888;'>(You may lose unsaved changes.)</small></p>
			<button id="ts-suspend-confirm" style="margin-right:1em;padding:0.5em 1.5em;">Suspend</button>
			<button id="ts-suspend-cancel" style="padding:0.5em 1.5em;">Cancel</button>
		`;
		modal.appendChild(box);
		document.body.appendChild(modal);
		document.getElementById('ts-suspend-confirm').onclick = () => {
			document.body.removeChild(modal);
			// Send a suspend request to the background using the existing message type, as manual
			log(`[TheOneSuspender ${LOG_COMPONENT}] Preparing to send MSG_SUSPEND_TAB to background.`);
			chrome.runtime.sendMessage(
				{ type: MSG_SUSPEND_TAB, isManual: true },
				(response) => {
					if (chrome.runtime.lastError) {
						logError(`[TheOneSuspender ${LOG_COMPONENT}] Error sending MSG_SUSPEND_TAB: ${chrome.runtime.lastError.message}`);
					} else {
						log(`[TheOneSuspender ${LOG_COMPONENT}] MSG_SUSPEND_TAB sent, response:`, response);
					}
				}
			);
		};
		document.getElementById('ts-suspend-cancel').onclick = () => {
			document.body.removeChild(modal);
		};
	}
})();
