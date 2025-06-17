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