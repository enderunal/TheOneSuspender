const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
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

// Verify package contents
function verifyPackage() {
    const version = getVersionFromManifest();
    const packagePath = path.join(__dirname, '..', `TheOneSuspender-v${version}.zip`);

    console.log(chalk.blue('🔍 Verifying package contents...'));
    console.log(chalk.gray(`Package: TheOneSuspender-v${version}.zip`));
    console.log('');

    if (!fs.existsSync(packagePath)) {
        console.error(chalk.red('❌ Package file not found!'));
        process.exit(1);
    }

    try {
        const zip = new AdmZip(packagePath);
        const entries = zip.getEntries();

        console.log(chalk.green(`📦 Package contains ${entries.length} entries:`));
        console.log('');

        // Group entries by type
        const files = [];
        const directories = [];

        entries.forEach(entry => {
            if (entry.isDirectory) {
                directories.push(entry.entryName);
            } else {
                files.push(entry.entryName);
            }
        });

        // Show directories
        if (directories.length > 0) {
            console.log(chalk.blue('📁 Directories:'));
            directories.sort().forEach(dir => {
                console.log(chalk.gray(`   ${dir}`));
            });
            console.log('');
        }

        // Show files
        if (files.length > 0) {
            console.log(chalk.green('📄 Files:'));
            files.sort().forEach(file => {
                const entry = zip.getEntry(file);
                const sizeKB = (entry.header.size / 1024).toFixed(1);
                console.log(chalk.gray(`   ${file} (${sizeKB} KB)`));
            });
        }

        console.log('');
        console.log(chalk.green('✅ Package verification complete!'));

    } catch (error) {
        console.error(chalk.red('❌ Error reading package:'), error.message);
        process.exit(1);
    }
}

verifyPackage(); 