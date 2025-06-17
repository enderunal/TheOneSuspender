# Chrome Extension Packaging

This directory contains all the automated packaging tools for The One Suspender Chrome extension.

## Quick Start

From the **project root directory**, run:

```bash
# First time setup
npm run install-packaging

# Create a package
npm run build
```

## Available Commands (from root)

- `npm run install-packaging` - Install packaging dependencies
- `npm run package` - Create extension ZIP file
- `npm run clean` - Remove old packages
- `npm run build` - Clean + Package (recommended)
- `npm run verify` - Verify package contents

## Files in this directory

- `package.json` - Packaging dependencies and scripts
- `package-lock.json` - Dependency lock file
- `package.js` - Main packaging script
- `clean.js` - Cleanup script
- `verify-package.js` - Package verification script
- `node_modules/` - Packaging dependencies (auto-generated)

## Output

Creates `TheOneSuspender-v{version}.zip` in the project root directory, ready for:
- Chrome Web Store upload
- Manual installation
- Distribution

## Dependencies

- Node.js 14+
- npm (comes with Node.js)
- archiver (ZIP creation)
- chalk (colored output)
- adm-zip (ZIP verification)

Dependencies are automatically installed with `npm run install-packaging`. 

---

# Screenshot Resizer for Chrome Web Store

This tool automatically resizes screenshots to the Chrome Web Store format (1280×800 pixels) with proper aspect ratio preservation and background filling.

## Features

- **Smart Resizing**: Maintains aspect ratio while fitting images to 1280×800
- **Background Filling**: Adds appropriate background colors (light/dark theme detection)
- **Batch Processing**: Processes multiple screenshots automatically
- **Theme-Aware**: Different background colors for light and dark theme screenshots

## Quick Start

### Windows Users
1. Double-click `resize-screenshots.bat` 
2. The script will automatically install dependencies and process screenshots

### Manual Run
1. Install Python dependencies:
   ```bash
   pip install Pillow
   ```

2. Run the Python script:
   ```bash
   python resize-screenshots.py
   ```

## How It Works

The script processes the following screenshots:
- `options-gold.png`
- `appearance-gold-dark.png`
- `popup-gold.png`
- `suspended-gold-dark.png`
- `tools-gold-dark.png`

### Resizing Logic
1. **If image is smaller than 1280×800**: Scales up and adds background
2. **If image is larger than 1280×800**: Scales down to fit within bounds
3. **Background colors**:
   - Light theme: `#f5f5f5` (light gray)
   - Dark theme: `#2d2d2d` (dark gray)

### Output
Resized screenshots are saved to `docs/screenshots/store/` directory, ready for Chrome Web Store submission.

## Example Processing

```
Processing: options-gold.png
  Original dimensions: 1280x1600
  Scaled dimensions: 640x800
  Position: (320, 0)
  Scale factor: 0.500
  Background: #f5f5f5
  ✓ Saved: docs/screenshots/store/options-gold.png
```

## Files

- `resize-screenshots.py` - Main Python script
- `resize-screenshots.bat` - Windows batch file for easy execution
- `requirements.txt` - Python dependencies
- `docs/screenshots/store/` - Output directory for resized screenshots

## Requirements

- Python 3.6+
- Pillow (PIL) library

The batch file will automatically install dependencies for you on Windows. 