const fs = require('fs');
const path = require('path');
const ChromeExtension = require('crx');
const chalk = require('chalk');

// Generate a new private key
async function generateKey() {
    const keyPath = path.join(__dirname, 'extension-key.pem');

    console.log(chalk.blue('🔑 Generating Chrome Extension Private Key...'));
    console.log('');

    // Check if key already exists
    if (fs.existsSync(keyPath)) {
        console.log(chalk.yellow('⚠️  Private key already exists!'));
        console.log(chalk.gray(`Location: ${path.relative(process.cwd(), keyPath)}`));
        console.log('');
        console.log(chalk.red('❌ Refusing to overwrite existing key.'));
        console.log(chalk.gray('If you want to generate a new key, delete the existing one first.'));
        process.exit(1);
    }

    try {
        // Create a temporary CRX instance to generate key
        const crx = new ChromeExtension({
            codebase: 'https://example.com/extension.crx'
        });

        // Load a dummy directory to generate the key
        const tempDir = path.join(__dirname, 'temp-key-gen');
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify({
            manifest_version: 3,
            name: "Temp",
            version: "1.0"
        }));

        await crx.load(tempDir);

        // Save the private key
        fs.writeFileSync(keyPath, crx.privateKey);

        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });

        // Get extension ID
        const extensionId = crx.generateAppId();

        console.log(chalk.green('✅ Private key generated successfully!'));
        console.log(chalk.gray(`📁 Saved to: ${path.relative(process.cwd(), keyPath)}`));
        console.log('');
        console.log(chalk.blue('📋 Extension Information:'));
        console.log(chalk.gray(`Extension ID: ${extensionId}`));
        console.log('');
        console.log(chalk.yellow('🔒 IMPORTANT: Keep this private key safe!'));
        console.log(chalk.gray('- Back it up securely'));
        console.log(chalk.gray('- Never share it publicly'));
        console.log(chalk.gray('- You need it for all future CRX updates'));
        console.log('');
        console.log(chalk.blue('🎯 You can now run "npm run package-crx" to create CRX files!'));

    } catch (error) {
        console.error(chalk.red('❌ Key generation failed:'), error.message);
        process.exit(1);
    }
}

// Run key generation
generateKey().catch((error) => {
    console.error(chalk.red('❌ Key generation failed:'), error.message);
    process.exit(1);
}); 