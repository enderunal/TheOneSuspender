# Chrome Extension Tests

This directory contains all testing and screenshot generation tools for TheOneSuspender Chrome extension.

## Structure

- `config/` - Test configuration files (package.json, playwright.config.js)
- `screenshots/` - Generated screenshots for Chrome Web Store
- `chrome-web-store-screenshots.test.js` - Main screenshot generation test
- Other test files for extension functionality

## Quick Start

### Generate Screenshots (Headless)

```bash
cd tests/config
npx playwright test ../chrome-web-store-screenshots.test.js
```

### Generate Screenshots (With UI)

```bash
cd tests/config
npx playwright test ../chrome-web-store-screenshots.test.js --headed
```

### Run All Tests

```bash
cd tests/config
npx playwright test
```

## Configuration

- **Headless Mode**: Default (faster, no UI)
- **Headed Mode**: Use `--headed` flag to see browser window
- **Screenshot Resolution**: 1280x800 (Chrome Web Store requirement)
- **Output Directory**: `tests/screenshots/`

## Generated Files

The screenshot test generates:
- 10 PNG screenshots (5 gold theme + 5 gold-dark theme)
- 1 README.md summary file
- Screenshots: popup, options, appearance, tools, suspended page

## Requirements

- Node.js
- Playwright (automatically installed via package.json)
- Chrome browser (for extension testing)

All dependencies are managed in `config/package.json`. 