const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Clean up old packages
function cleanPackages() {
    const projectRoot = path.join(__dirname, '..');

    console.log(chalk.blue('🧹 Cleaning old packages...'));

    try {
        const files = fs.readdirSync(projectRoot);
        let removedCount = 0;

        for (const file of files) {
            // Remove any .zip or .crx files that match our naming pattern
            if (file.match(/^TheOneSuspender.*\.(zip|crx)$/)) {
                const filePath = path.join(projectRoot, file);
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
            console.log(chalk.gray('✨ No old packages found'));
        } else {
            console.log(chalk.green(`✅ Cleaned ${removedCount} old package(s)`));
        }

    } catch (error) {
        console.error(chalk.red('❌ Clean failed:'), error.message);
        process.exit(1);
    }
}

cleanPackages(); 