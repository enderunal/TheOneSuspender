# The One Suspender

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/kbnejigpbcogccaakoafohhkpjpdnipo.svg)](https://chromewebstore.google.com/detail/unasuspender-theonesuspen/kbnejigpbcogccaakoafohhkpjpdnipo)

**Available now on the Chrome Web Store!** 🎉

**[📦 Install from Chrome Web Store](https://chromewebstore.google.com/detail/unasuspender-theonesuspen/kbnejigpbcogccaakoafohhkpjpdnipo)**

## Why The One Suspender?

I developed this extension because The Marvelous Suspender (TMS) could not support Manifest V3, and I couldn't find an alternative that met my specific needs. I found that rewriting TMS from scratch was a more viable path than attempting to port it. The One Suspender includes all the features you're familiar with from The Great Suspender and TMS, plus additional enhancements.

Auto-suspend inactive tabs with full manual controls, robust scheduling, advanced security for Chrome (Manifest V3), and a beautiful dark mode.

## Easy Migration From The Marvelous Suspender

![image](https://github.com/user-attachments/assets/3076f48a-59f0-4fda-8ccc-06b7100e99fa)


---

## Screenshots

Here's a glimpse of The One Suspender in action:

**Migration Tool:**
![Migration Tool](docs/screenshots/ss_migration.png)

**Suspended Page (Light & Dark Theme):**

![Suspended Page Light](docs/screenshots/ss_suspended_page.png)
![Suspended Page Dark](docs/screenshots/ss_dark_suspended_page.png)

**Popup Menu (Light & Dark Theme):**

![Popup Menu Light](docs/screenshots/ss_popup.png)
![Popup Menu Dark](docs/screenshots/ss_dark_popup.png)

**Options Page (Light & Dark Theme):**

![Options Page Light](docs/screenshots/ss_options.png)
![Options Page Dark](docs/screenshots/ss_dark_options.png)

**Dimmed Icon for Suspended Tabs:**
![Dimmed Icon](docs/screenshots/ss_icon_dim.png)

---

## Features

- **Automatic Tab Suspension**: Frees memory by suspending inactive tabs after a user-defined timeout (Minimum 1 min).
- **Manual Controls**: Suspend/unsuspend individual tabs or all tabs in a window/all windows from the popup.
- **Export/Import Suspended Tabs**: Export all suspended tabs (with window/tab structure) as JSON or TXT, and import them later—even across extension reinstalls or devices. (See below for details.)
- **Two Suspension Modes**: 
  - **Preserve History (default):** Uses regular suspension, keeping tab history and state.
  - **Close & Reopen:** Experimental! Might free more RAM when preserve history does not help but loses tab history. Might consume more CPU.
- **Whitelist Management**: Never suspend specific URLs/domains (with wildcard support).
- **Conditional Exceptions**: Never suspend pinned tabs, tabs playing audio, active tabs, tabs with unsaved form data, etc.
- **Ask Before Suspending**: Prompts user if unsaved form data is detected (see below).
- **Visual Indicators**: Grayed-out favicon for suspended tabs, with robust CORS/SVG handling.
- **Customizable Settings**: All options available in a modern, responsive Options page with theme selection.
- **🌙 Dark Mode**: Beautiful Material UI-inspired dark theme that applies across all extension pages (options, popup, suspended pages). Toggle between light and dark themes in settings.
- **Security-First**: Strict CSP, minimal permissions, secure messaging, and no user-supplied DOM injection.

---

## Export/Import Suspended Tabs

**Easily backup or migrate your suspended tabs!**

- **Export:**
  - Go to the Options page.
  - Use the Export section to download all currently suspended tabs (with window/tab structure) as a `.json` or `.txt` file.
  - The export includes all suspended tabs, grouped by window, with titles, favicons, and original URLs.

- **Import:**
  - Use the Import section in the Options page to select a previously exported file.
  - The extension will recreate the original window/tab structure and immediately suspend the imported tabs.
  - **Extension ID Handling:** If you import on a different device or after reinstalling, the extension will automatically update the internal suspended tab URLs to match the new extension ID—no manual editing required.
  - Comprehensive error handling and validation is included.

---

## Installation

### Option 1: Chrome Web Store (Recommended)

**[📦 Install from Chrome Web Store](https://chromewebstore.google.com/detail/unasuspender-theonesuspen/kbnejigpbcogccaakoafohhkpjpdnipo)**

1. Visit the Chrome Web Store link above
2. Click "Add to Chrome"
3. The extension icon will appear in your toolbar

### Option 2: Manual Installation (Development)

1. Download or clone this repository.
2. Go to `chrome://extensions` in Chrome.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the project directory.
5. The extension icon will appear in your toolbar.

---

## Usage

- Click the extension icon for quick actions: suspend/restore, whitelist URL/domain, bulk suspend/unsuspend, and open settings.
- Use the Options page to configure all preferences, exceptions, the whitelist, and to export/import suspended tabs.
- **Theme Selection**: Switch between light and dark themes in the Appearance section of the Options page. The theme applies instantly across all extension pages.
- Suspended tabs can be restored with a single click.

---

## Permissions & Security

- **Permissions**: Only requests `tabs`, `storage`, `alarms`, `idle`, `contextMenus`, and `scripting`.
- **Host Permissions**: Only for `http://*/*` and `https://*/*` (no file or internal pages).
- **Content Security Policy**: Strict CSP for all extension pages. No remote code or user-supplied HTML.
- **Messaging**: All messages are validated for sender and origin.
- **No User Data Leakage**: No analytics, tracking, or remote requests.

---

## Architecture & Scheduling Flow

- **Centralized Scheduling**: All tabs are tracked in a single `tabSuspendTimes` map (see [tab-scheduling-flow.md](docs/tab-scheduling-flow.md)).
- **Single Scan Alarm**: A single Chrome alarm periodically checks all tabs for suspension eligibility.
- **Tab Classification**: Tabs are classified with robust rules (see [tab-classifier.js](src/common/tab-classifier.js)).
- **Debounced Rescheduling**: Prevents alarm thrashing on rapid changes.
- **Error Handling**: All tab/window queries are robust to missing/closed entities.

See the following diagrams for a visual overview:
- [Alarm Flow Diagram](docs/alarm-flow.puml)
- [Event Flow Diagram](docs/event-flow.puml)
- [Extension Alarms & Messaging](docs/extension-alarms-messaging.puml)

---

## Ask-Before-Suspend Flow

When "Ask Before Suspending" is enabled for unsaved form data:
1. Scheduler detects a tab is due for suspension and checks for unsaved form data.
2. If unsaved data is found, the background sends a `PROMPT_SUSPEND` message to the content script.
3. The content script displays a modal dialog asking the user to confirm suspension.
4. If the user confirms, the content script sends a `MSG_SUSPEND_TAB` message back to the background, which then suspends the tab manually.
5. If the user cancels, the tab is left active and not suspended.

See [tab-scheduling-flow.md](docs/tab-scheduling-flow.md) and the diagrams above for details.

---

## Contributing

- PRs and issues are welcome! Please follow the code style and security guidelines.
- See [docs/tab-scheduling-flow.md](docs/tab-scheduling-flow.md) and the diagrams for architecture details.

---

## License

MIT License. See [LICENSE](LICENSE) file. 
