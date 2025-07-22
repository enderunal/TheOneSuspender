# Chrome Extension Packaging

This directory contains all the automated packaging tools for The One Suspender Chrome extension.

## Quick Start

From the **packaging** directory, run:

```bash
cd packaging
npm install
npm run build
```

## Available Commands (from packaging directory)

- `npm run package` - Create extension ZIP file
- `npm run package-crx` - Create extension CRX file
- `npm run clean` - Remove old packages
- `npm run build` - Clean + Package + CRX (recommended)
- `npm run build-zip-only` - Clean + Package (ZIP only)
- `npm run verify` - Verify package contents
- `npm run generate-key` - Generate new private key for CRX signing

## Files in this directory

- `package.json` - Packaging dependencies and scripts
- `package-lock.json` - Dependency lock file
- `package.js` - Main ZIP packaging script
- `package-crx.js` - CRX packaging script
- `clean.js` - Cleanup script
- `verify-package.js` - Package verification script
- `generate-key.js` - Private key generation script
- `extension-key.pem` - Private key for CRX signing (auto-generated, keep safe!)
- `node_modules/` - Packaging dependencies (auto-generated)

## Output

Creates both files in the project root directory:
- `TheOneSuspender-v{version}.zip` - For Chrome Web Store upload or manual installation
- `TheOneSuspender-v{version}.crx` - For direct distribution and installation

### File Usage:
- **ZIP file**: Upload to Chrome Web Store or extract for development
- **CRX file**: Direct installation by users (drag & drop to Chrome extensions page)
- **Private key**: Keep `packaging/extension-key.pem` safe for future CRX updates

## Dependencies

- Node.js 14+
- npm (comes with Node.js)
- Google Chrome (for CRX creation)
- archiver (ZIP creation)
- chalk (colored output)
- adm-zip (ZIP verification)
- crx (CRX creation support)

Dependencies are automatically installed with `npm install`.

### CRX Creation Requirements:
- Google Chrome must be installed for CRX file creation
- Private key is automatically generated if not present
- OpenSSL (optional, for better key generation) 

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