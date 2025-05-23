# The One Suspender

Auto-suspend inactive tabs with full manual controls, robust scheduling, and advanced security for Chrome (Manifest V3).

---

## Features

- **Automatic Tab Suspension**: Frees memory by suspending inactive tabs after a user-defined timeout (1–120 mins).
- **Manual Controls**: Suspend/unsuspend individual tabs or all tabs in a window/all windows from the popup.
- **Two Suspension Modes**: Close & Reopen (no history) or Preserve History (via tab discard).
- **Whitelist Management**: Never suspend specific URLs/domains (with wildcard support).
- **Conditional Exceptions**: Never suspend pinned tabs, tabs playing audio, active tabs, tabs with unsaved form data, etc.
- **Ask Before Suspending**: Prompts user if unsaved form data is detected (see below).
- **Visual Indicators**: Grayed-out favicon for suspended tabs, with robust CORS/SVG handling.
- **Customizable Settings**: All options available in a modern, responsive Options page.
- **Robust Error Handling**: All tab/window operations are safe to missing/closed entities.
- **Security-First**: Strict CSP, minimal permissions, secure messaging, and no user-supplied DOM injection.

---

## Installation

1. Download or clone this repository.
2. Go to `chrome://extensions` in Chrome.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the project directory.
5. The extension icon will appear in your toolbar.

---

## Usage

- Click the extension icon for quick actions: suspend/restore, whitelist URL/domain, bulk suspend/unsuspend, and open settings.
- Use the Options page to configure all preferences, exceptions, and the whitelist.
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
- **Tab Classification**: Tabs are classified with robust rules (see [tab-classifier.js](tab-classifier.js)).
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