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
            // Remove any .zip files that match our naming pattern
            if (file.match(/^TheOneSuspender.*\.zip$/)) {
                const filePath = path.join(projectRoot, file);
                fs.unlinkSync(filePath);
                console.log(chalk.yellow(`🗑️  Removed: ${file}`));
                removedCount++;
            }
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