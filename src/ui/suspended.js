// suspended.js
import * as Logger from '../common/logger.js';
import * as Theme from '../common/theme.js';
import * as FaviconUtils from '../common/favicon-utils.js';
import * as SuspensionUtils from '../suspension/suspension-utils.js';

(async () => {
	try {
		// Initialize theme using common method
		await Theme.initializeThemeForPage();

		// Use centralized URL parsing logic
		const originalData = SuspensionUtils.getOriginalDataFromUrl(location.href);
		const originalUrl = originalData ? originalData.url : "";

		// Parse other parameters from the hash
		const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
		const paramsString = hash.replace(/&url=.+$/, '');
		const params = new URLSearchParams(paramsString);
		
		const pageTitle = params.get('title') || (originalUrl || "Tab Suspended");
		const timestamp = params.has('timestamp') ? parseInt(params.get('timestamp'), 10) : 0;
		const faviconUrl = params.get('favicon') || ""; // Get favicon URL from parameters

		Logger.log("Using centralized URL parsing logic.", Logger.LogComponent.SUSPENDED);

		// 1) Title & header
		try {
			document.title = pageTitle;
			const headerElement = document.getElementById("suspend-header");
			if (headerElement) headerElement.textContent = pageTitle;

			// 2) Info fields
			const pageTitleElement = document.getElementById("page-title");
			if (pageTitleElement) pageTitleElement.textContent = pageTitle;

			const pageUrlElement = document.getElementById("page-url");
			const urlLink = document.getElementById("url-link");
			const copyNotif = document.getElementById("copy-notification");
			if (pageUrlElement && urlLink && copyNotif && originalUrl && /^https?:\/\//.test(originalUrl)) {
				urlLink.href = originalUrl;
				urlLink.textContent = originalUrl;

				function showCopyNotification(success) {
					copyNotif.textContent = success ? "Copied!" : "Failed to copy";
					copyNotif.classList.add("show");
					setTimeout(() => {
						copyNotif.classList.remove("show");
					}, 1200);
				}

				pageUrlElement.addEventListener("click", function (e) {
					if (e.button !== 0) return;
					e.preventDefault();
					e.stopPropagation();
					navigator.clipboard.writeText(originalUrl)
						.then(() => showCopyNotification(true))
						.catch(() => showCopyNotification(false));
				});
			} else if (urlLink) {
				urlLink.textContent = "URL not available";
				urlLink.removeAttribute("href");
			}

			const timestampElement = document.getElementById("timestamp");
			if (timestampElement) timestampElement.textContent = timestamp ? new Date(timestamp).toLocaleString() : 'N/A';
		} catch (domError) {
			Logger.logError("Error updating DOM elements", domError, Logger.LogComponent.SUSPENDED);
			// Continue despite DOM errors, as restore functionality is more important
		}

		// 3) Restore logic
		const restoreButton = document.getElementById("restore-button");
		const restore = () => {
			if (!originalUrl) {
				alert("Original URL is missing. Cannot restore the tab.");
				if (restoreButton) restoreButton.disabled = false; // Re-enable button if failed
				return;
			}

			try {
				document.body.removeEventListener("click", restore);
				if (restoreButton) {
					restoreButton.removeEventListener("click", restoreOnClick);
					restoreButton.disabled = true;
					restoreButton.textContent = "Restoring…";
				}

				try {
					new URL(originalUrl); // Validate URL before navigating
					location.href = originalUrl;
				} catch (e) {
					Logger.logError("restore", `Invalid URL for restore: ${originalUrl}`, Logger.LogComponent.SUSPENDED, e);
					alert(`Error restoring tab: The original URL (${originalUrl.substring(0, 50)}...) appears to be invalid. Please report this issue.`);
					if (restoreButton) {
						restoreButton.disabled = false;
						restoreButton.textContent = "Try Restore Again";
					}
					// Re-add listeners if restore failed badly
					document.body.addEventListener("click", restore);
					if (restoreButton) restoreButton.addEventListener("click", restoreOnClick);
				}
			} catch (error) {
				// Handle extension context invalidation or other errors during restore
				Logger.logError("Error during restore preparation", error, Logger.LogComponent.SUSPENDED);
				// Attempt direct navigation as last resort
				if (originalUrl) {
					try {
						location.href = originalUrl;
					} catch (navError) {
						Logger.logError("Failed even direct navigation", navError, Logger.LogComponent.SUSPENDED);
					}
				}
			}
		};

		const restoreOnClick = (e) => {
			try {
				e.stopPropagation(); // Prevent body click handler from firing as well
				restore();
			} catch (error) {
				Logger.logError("Error in click handler", error, Logger.LogComponent.SUSPENDED);
				// Attempt direct navigation as fallback
				if (originalUrl) location.href = originalUrl;
			}
		};

		try {
			if (restoreButton) {
				restoreButton.addEventListener("click", restoreOnClick);
			}
			document.body.addEventListener("click", restore);
		} catch (eventError) {
			Logger.logError("Error setting up event listeners", eventError, Logger.LogComponent.SUSPENDED);
		}

		// 4) Favicon - Simplified Canvas approach to gray out favicons
		try {
			const faviconLink = document.getElementById("favicon");
			const setFallbackIcon = () => {
				if (!faviconLink) return;
				faviconLink.onerror = null;
				faviconLink.href = 'icons/icon16.png';
				// Apply grayscale to fallback icon via Canvas
				processWithCanvas('icons/icon16.png');
				Logger.log("Setting grayed fallback icon.", Logger.LogComponent.SUSPENDED);
			};

			const processWithCanvas = (imageUrl) => {
				if (!faviconLink) return;
				const img = new Image();

				img.onload = () => {
					try {
						const canvas = document.createElement('canvas');
						const size = 16; // Standard favicon size
						canvas.width = size;
						canvas.height = size;
						const ctx = canvas.getContext('2d');

						if (ctx) {
							ctx.filter = 'grayscale(40%) opacity(60%)';
							ctx.drawImage(img, 0, 0, size, size);
							faviconLink.href = canvas.toDataURL();
							Logger.log(`Applied grayscale to favicon: ${imageUrl.substring(0, 60)}`, Logger.LogComponent.SUSPENDED);
						} else {
							// Fallback if Canvas fails
							faviconLink.href = imageUrl;
							Logger.logWarning(`Canvas context failed, using original favicon: ${imageUrl.substring(0, 60)}`, Logger.LogComponent.SUSPENDED);
						}
					} catch (e) {
						// Fallback if Canvas processing fails
						faviconLink.href = imageUrl;
						Logger.logWarning(`Canvas processing failed, using original favicon: ${imageUrl.substring(0, 60)}`, Logger.LogComponent.SUSPENDED, e);
					}
				};

				img.onerror = () => {
					Logger.logWarning(`Failed to load image: ${imageUrl.substring(0, 60)}`, Logger.LogComponent.SUSPENDED);
					faviconLink.href = 'icons/icon16.png';
				};

				// Set crossOrigin for external images
				if (imageUrl.startsWith("http")) {
					img.crossOrigin = "anonymous";
				}

				img.src = imageUrl;
			};

			if (faviconLink) {
				faviconLink.onerror = () => {
					Logger.logWarning(`Failed to load favicon via <link> tag. Using fallback.`, Logger.LogComponent.SUSPENDED);
					setFallbackIcon();
				};

				// Use favicon URL from parameters if available, otherwise use dynamic discovery
				if (faviconUrl) {
					Logger.log(`Using favicon from URL parameter: ${faviconUrl.substring(0, 60)}`, Logger.LogComponent.SUSPENDED);
					processWithCanvas(faviconUrl);
				} else if (originalUrl) {
					Logger.log(`No favicon URL parameter found. Attempting to discover favicon for: ${originalUrl.substring(0, 60)}`, Logger.LogComponent.SUSPENDED);
					await FaviconUtils.discoverFavicon(originalUrl, (discoveredFaviconUrl) => {
						if (discoveredFaviconUrl) {
							Logger.log(`Processing discovered favicon: ${discoveredFaviconUrl.substring(0, 60)}`, Logger.LogComponent.SUSPENDED);
							processWithCanvas(discoveredFaviconUrl);
						} else {
							Logger.log("No favicon discovered. Using fallback.", Logger.LogComponent.SUSPENDED);
							setFallbackIcon();
						}
					});
				} else {
					Logger.log("No original URL available for favicon discovery. Using fallback.", Logger.LogComponent.SUSPENDED);
					setFallbackIcon();
				}
			} else {
				Logger.logWarning("Favicon link element not found in DOM.", Logger.LogComponent.SUSPENDED);
			}
		} catch (faviconError) {
			Logger.logError("Error handling favicon", faviconError, Logger.LogComponent.SUSPENDED);
		}
	} catch (globalError) {
		// Top-level try-catch to prevent complete script failure
		console.error("[TheOneSuspender ERROR] Fatal error in suspended.js:", globalError);

		// Try to extract and use the original URL for restore functionality
		// even if the rest of the script fails
		try {
			const params = new URLSearchParams(location.search);
			const encodedUrlParam = params.get('url');
			if (encodedUrlParam) {
				// Add a simple way to restore the tab despite errors
				document.body.innerHTML = `
					<div style="text-align:center; padding:20px; font-family:system-ui;">
						<h1>Tab Suspended (Recovery Mode)</h1>
						<p>An error occurred while loading the suspended page.</p>
						<button id="emergency-restore" style="padding:10px;">Click to Restore Tab</button>
					</div>
				`;
				document.getElementById('emergency-restore')?.addEventListener('click', () => {
					location.href = originalUrl;
				});
				document.title = "Tab Suspended (Recovery)";
			}
		} catch (recoveryError) {
			console.error("[TheOneSuspender ERROR] Even recovery failed:", recoveryError);
		}
	}
})();
