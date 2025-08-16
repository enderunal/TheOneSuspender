const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const chalk = require('chalk');

// Files and directories to include in the package
const INCLUDE_ITEMS = [
    'LICENSE',
    'license.html',
    'manifest.json',
    'migrate.html',
    'skipped.html',
    'options.html',
    'popup.html',
    'README.md',
    'privacy.html',
    'privacy.md',
    'suspended.html',
    'shortcuts.html',
    'icons',
    'src',
    'styles',
    'vendor'
];

// Get version from manifest.json
function getVersionFromManifest() {
    try {
        const manifestPath = path.join(__dirname, '..', 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return manifest.version;
    } catch (error) {
        console.error(chalk.red('Error reading manifest.json:'), error.message);
        return 'unknown';
    }
}

// Check if file/directory exists
function exists(itemPath) {
    try {
        return fs.existsSync(itemPath);
    } catch (error) {
        return false;
    }
}

// Create the package
async function createPackage() {
    const version = getVersionFromManifest();
    const outputFileName = `TheOneSuspender-v${version}.zip`;
    const outputPath = path.join(__dirname, '..', outputFileName);

    console.log(chalk.blue('🚀 Starting Chrome Extension Packaging...'));
    console.log(chalk.gray(`Version: ${version}`));
    console.log(chalk.gray(`Output: ${outputFileName}`));
    console.log('');

    // Remove existing package if it exists
    if (exists(outputPath)) {
        fs.unlinkSync(outputPath);
        console.log(chalk.yellow('🗑️  Removed existing package'));
    }

    // Create archiver
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
    });

    // Handle archiver events
    output.on('close', () => {
        const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        console.log('');
        console.log(chalk.green('✅ Package created successfully!'));
        console.log(chalk.gray(`📦 Size: ${sizeInMB} MB`));
        console.log(chalk.gray(`📁 Location: ${outputFileName}`));
        console.log('');
        console.log(chalk.blue('🎯 Ready for Chrome Web Store or manual installation!'));
    });

    archive.on('error', (err) => {
        console.error(chalk.red('❌ Packaging failed:'), err.message);
        process.exit(1);
    });

    // Pipe archive data to the file
    archive.pipe(output);

    // Add files and directories
    let addedCount = 0;
    let skippedCount = 0;

    for (const item of INCLUDE_ITEMS) {
        const itemPath = path.join(__dirname, '..', item);

        if (!exists(itemPath)) {
            console.log(chalk.yellow(`⚠️  Skipped: ${item} (not found)`));
            skippedCount++;
            continue;
        }

        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
            archive.directory(itemPath, item);
            console.log(chalk.green(`📁 Added directory: ${item}/`));
        } else {
            archive.file(itemPath, { name: item });
            console.log(chalk.green(`📄 Added file: ${item}`));
        }

        addedCount++;
    }

    console.log('');
    console.log(chalk.blue(`📊 Summary: ${addedCount} items added, ${skippedCount} skipped`));

    // Finalize the archive
    await archive.finalize();
}

// Run the packaging
createPackage().catch((error) => {
    console.error(chalk.red('❌ Packaging failed:'), error.message);
    process.exit(1);
}); 