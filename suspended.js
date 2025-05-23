// suspended.js
import { log, logWarning, logError, LogComponent } from './logger.js';

(async () => {
	try {
		const params = new URLSearchParams(location.search);
		log("Using search parameters.", LogComponent.SUSPENDED);

		// Extract parameters using standardized names
		let originalUrl = "";
		const encodedUrlParam = params.get('url');
		if (encodedUrlParam) {
			try {
				originalUrl = decodeURIComponent(encodedUrlParam);
				log(`Decoded URL from 'url' parameter: ${originalUrl.substring(0, 100)}`, LogComponent.SUSPENDED);
			} catch (e) {
				originalUrl = encodedUrlParam; // Use as-is if decode fails (should be rare with new builder)
				logWarning(`Using undecoded URL from 'url' parameter due to decode error: ${originalUrl.substring(0, 100)}`, LogComponent.SUSPENDED);
			}
		} else {
			logWarning("'url' parameter missing.", LogComponent.SUSPENDED);
		}

		const pageTitle = params.get("title") || (originalUrl || "Tab Suspended");
		const timestamp = parseInt(params.get("timestamp") || "0", 10);
		const faviconUrl = params.get("fav") || "";

		// 1) Title & header
		try {
			document.title = pageTitle;
			const headerElement = document.getElementById("suspend-header");
			if (headerElement) headerElement.textContent = pageTitle;

			// 2) Info fields
			const pageTitleElement = document.getElementById("page-title");
			if (pageTitleElement) pageTitleElement.textContent = pageTitle;

			const pageUrlElement = document.getElementById("page-url");
			if (pageUrlElement) pageUrlElement.textContent = originalUrl || "URL not available";

			const timestampElement = document.getElementById("timestamp");
			if (timestampElement) timestampElement.textContent = timestamp ? new Date(timestamp).toLocaleString() : 'N/A';
		} catch (domError) {
			logError("Error updating DOM elements", domError, LogComponent.SUSPENDED);
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
					logError("restore", `Invalid URL for restore: ${originalUrl}`, LogComponent.SUSPENDED, e);
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
				logError("Error during restore preparation", error, LogComponent.SUSPENDED);
				// Attempt direct navigation as last resort
				if (originalUrl) {
					try {
						location.href = originalUrl;
					} catch (navError) {
						logError("Failed even direct navigation", navError, LogComponent.SUSPENDED);
					}
				}
			}
		};

		const restoreOnClick = (e) => {
			try {
				e.stopPropagation(); // Prevent body click handler from firing as well
				restore();
			} catch (error) {
				logError("Error in click handler", error, LogComponent.SUSPENDED);
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
			logError("Error setting up event listeners", eventError, LogComponent.SUSPENDED);
		}

		// 4) Favicon
		try {
			const faviconLink = document.getElementById("favicon");
			const setFallbackIcon = () => {
				if (!faviconLink) return;
				faviconLink.onerror = null;
				faviconLink.href = 'icons/icon16.png';
				faviconLink.style.filter = 'none';
				log("Setting fallback icon.", LogComponent.SUSPENDED);
			};

			const processFaviconWithCanvas = (imageUrl) => {
				if (!faviconLink) return;
				const img = new Image();
				let objectUrl = null;

				if (imageUrl.startsWith("http")) {
					img.crossOrigin = "anonymous";
				}

				img.onload = () => {
					try {
						const canvas = document.createElement('canvas');
						const size = (img.naturalWidth > 0 && img.naturalWidth <= 64) ? img.naturalWidth : 16;
						canvas.width = size;
						canvas.height = size;
						const ctx = canvas.getContext('2d');

						if (ctx) {
							ctx.filter = 'grayscale(60%) opacity(50%)';
							ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
							try {
								faviconLink.href = canvas.toDataURL();
								faviconLink.style.filter = 'none';
								log(`Applied canvas effect to favicon: ${imageUrl.substring(0, 60)}`, LogComponent.SUSPENDED);
							} catch (e) {
								logWarning(`Canvas toDataURL() failed for ${imageUrl.substring(0, 60)}:`, LogComponent.SUSPENDED, e);
								setFallbackIcon();
							}
						} else {
							logWarning(`Failed to get canvas 2D context for: ${imageUrl.substring(0, 60)}`, LogComponent.SUSPENDED);
							setFallbackIcon();
						}
					} catch (canvasError) {
						logError("Error processing favicon with canvas", canvasError, LogComponent.SUSPENDED);
						setFallbackIcon();
					} finally {
						if (objectUrl) URL.revokeObjectURL(objectUrl);
					}
				};

				img.onerror = () => {
					logWarning(`Failed to load image for canvas processing: ${imageUrl.substring(0, 100)}`, LogComponent.SUSPENDED);
					setFallbackIcon();
					if (objectUrl) URL.revokeObjectURL(objectUrl);
				};

				try {
					if (imageUrl.startsWith("data:image/svg+xml")) {
						const prefix = "data:image/svg+xml,";
						let svgContent = imageUrl.substring(prefix.length);
						try {
							const decodedSvgContent = decodeURIComponent(svgContent);
							const blob = new Blob([decodedSvgContent], { type: 'image/svg+xml;charset=utf-8' });
							objectUrl = URL.createObjectURL(blob);
							img.src = objectUrl;
						} catch (e) {
							logWarning(`Error creating blob/object URL for SVG: ${e}; Original URL: ${imageUrl.substring(0, 100)}`, LogComponent.SUSPENDED);
							setFallbackIcon();
						}
					} else {
						img.src = imageUrl;
					}
				} catch (imgError) {
					logError("Error setting image source", imgError, LogComponent.SUSPENDED);
					setFallbackIcon();
				}
			};

			if (faviconLink) {
				faviconLink.onerror = () => {
					logWarning(`Failed to load favicon via <link> tag: ${faviconLink.href || faviconUrl}. Using fallback.`, LogComponent.SUSPENDED);
					setFallbackIcon();
				};

				if (!faviconUrl) {
					log("No favicon URL provided. Using fallback.", LogComponent.SUSPENDED);
					setFallbackIcon();
				} else if (faviconUrl.startsWith("data:") || faviconUrl.startsWith("http")) { // Process data URIs and http/s
					log(`Processing favicon with canvas: ${faviconUrl.substring(0, 60)}`, LogComponent.SUSPENDED);
					processFaviconWithCanvas(faviconUrl);
				} else {
					logWarning(`Disallowed/unknown favicon protocol (${faviconUrl.substring(0, 30)})... using fallback.`, LogComponent.SUSPENDED);
					setFallbackIcon();
				}
			} else {
				logWarning("Favicon link element not found in DOM.", LogComponent.SUSPENDED);
			}
		} catch (faviconError) {
			logError("Error handling favicon", faviconError, LogComponent.SUSPENDED);
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
				const originalUrl = decodeURIComponent(encodedUrlParam);
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
