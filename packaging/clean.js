const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

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

// Clean up only the current version's packages
function cleanPackages() {
    const projectRoot = path.join(__dirname, '..');
    const version = getVersionFromManifest();
    let removedCount = 0;

    console.log(chalk.blue('🧹 Cleaning current version package files...'));

    // Only remove the current version's .zip and .crx
    const targets = [
        `TheOneSuspender-v${version}.zip`,
        `TheOneSuspender-v${version}.crx`
    ];
    for (const file of targets) {
        const filePath = path.join(projectRoot, file);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(chalk.yellow(`🗑️  Removed: ${file}`));
            removedCount++;
        }
    }

    // Also clean temp directories
    const tempDir = path.join(projectRoot, 'temp-extension');
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(chalk.yellow('🗑️  Removed: temp-extension/'));
        removedCount++;
    }

    if (removedCount === 0) {
        console.log(chalk.gray('✨ No current version package files found'));
    } else {
        console.log(chalk.green(`✅ Cleaned ${removedCount} item(s)`));
    }
}

cleanPackages(); 