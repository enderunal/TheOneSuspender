const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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

// Check if file exists
function exists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch (error) {
        return false;
    }
}

// Create temporary directory with extension files
async function createTempExtensionDir(version) {
    const tempDir = path.join(__dirname, '..', 'temp-extension');
    const zipPath = path.join(__dirname, '..', `TheOneSuspender-v${version}.zip`);

    // Check if ZIP exists
    if (!exists(zipPath)) {
        throw new Error(`ZIP file not found: TheOneSuspender-v${version}.zip. Run 'npm run package' first.`);
    }

    // Clean temp directory if it exists
    if (exists(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    // Extract ZIP to temp directory
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);

    return tempDir;
}

// Generate private key using OpenSSL if available
function generatePrivateKey(keyPath) {
    try {
        console.log(chalk.blue('🔑 Generating private key with OpenSSL...'));
        execSync(`openssl genrsa -out "${keyPath}" 2048`, { stdio: 'pipe' });
        return true;
    } catch (error) {
        console.log(chalk.yellow('⚠️  OpenSSL not available, will use simple key generation'));

        // Create a simple RSA private key placeholder
        // This is a basic approach - in production you'd want proper key generation
        const crypto = require('crypto');
        const { generateKeyPairSync } = crypto;

        try {
            const { privateKey } = generateKeyPairSync('rsa', {
                modulusLength: 2048,
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem'
                }
            });

            fs.writeFileSync(keyPath, privateKey);
            return true;
        } catch (keyGenError) {
            console.error(chalk.red('❌ Key generation failed:'), keyGenError.message);
            return false;
        }
    }
}

// Create CRX package using Chrome command line
async function createCrxWithChrome(tempDir, keyPath, outputPath) {
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser'
    ];

    let chromePath = null;
    for (const path of chromePaths) {
        if (exists(path)) {
            chromePath = path;
            break;
        }
    }

    if (!chromePath) {
        throw new Error('Chrome browser not found. Please install Chrome or use manual CRX creation.');
    }

    try {
        const command = `"${chromePath}" --pack-extension="${tempDir}" --pack-extension-key="${keyPath}"`;
        execSync(command, { stdio: 'pipe', timeout: 30000 });

        // Chrome creates the CRX in the parent directory of the extension
        const chromeOutputPath = tempDir + '.crx';
        if (exists(chromeOutputPath)) {
            fs.renameSync(chromeOutputPath, outputPath);
            return true;
        }

        return false;
    } catch (error) {
        throw new Error(`Chrome CRX creation failed: ${error.message}`);
    }
}

// Create CRX package
async function createCrxPackage() {
    const version = getVersionFromManifest();
    const keyPath = path.join(__dirname, 'extension-key.pem');
    const outputPath = path.join(__dirname, '..', `TheOneSuspender-v${version}.crx`);

    console.log(chalk.blue('🔐 Starting CRX Package Creation...'));
    console.log(chalk.gray(`Version: ${version}`));
    console.log(chalk.gray(`Output: TheOneSuspender-v${version}.crx`));
    console.log('');

    // Check if private key exists, generate if not
    if (!exists(keyPath)) {
        console.log(chalk.yellow('⚠️  Private key not found. Generating new key...'));
        console.log(chalk.gray(`Key will be saved to: ${path.relative(process.cwd(), keyPath)}`));
        console.log(chalk.yellow('📝 Keep this key safe for future updates!'));
        console.log('');

        if (!generatePrivateKey(keyPath)) {
            throw new Error('Failed to generate private key');
        }

        console.log(chalk.green('🔑 Generated new private key'));
    }

    // Remove existing CRX if it exists
    if (exists(outputPath)) {
        fs.unlinkSync(outputPath);
        console.log(chalk.yellow('🗑️  Removed existing CRX package'));
    }

    try {
        // Create temporary extension directory
        console.log(chalk.blue('📦 Extracting extension files...'));
        const tempDir = await createTempExtensionDir(version);

        // Create CRX using Chrome
        console.log(chalk.blue('🔐 Creating CRX package with Chrome...'));
        await createCrxWithChrome(tempDir, keyPath, outputPath);

        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });

        // Verify CRX was created
        if (!exists(outputPath)) {
            throw new Error('CRX file was not created successfully');
        }

        // Get file size
        const stats = fs.statSync(outputPath);
        const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);

        console.log('');
        console.log(chalk.green('✅ CRX package created successfully!'));
        console.log(chalk.gray(`📦 Size: ${sizeInMB} MB`));
        console.log(chalk.gray(`📁 Location: TheOneSuspender-v${version}.crx`));
        console.log('');
        console.log(chalk.blue('📋 CRX Package Information:'));
        console.log(chalk.gray('- Signed with your private key'));
        console.log(chalk.gray('- Ready for direct installation'));
        console.log(chalk.gray('- Can be distributed outside Chrome Web Store'));
        console.log('');
        console.log(chalk.blue('🎯 Ready for distribution!'));

    } catch (error) {
        console.error(chalk.red('❌ CRX creation failed:'), error.message);
        console.log('');
        console.log(chalk.yellow('💡 Alternative: Use ZIP file for Chrome Web Store'));
        console.log(chalk.gray('   The ZIP file can be uploaded directly to Chrome Web Store'));
        process.exit(1);
    }
}

// Run the CRX packaging
createCrxPackage().catch((error) => {
    console.error(chalk.red('❌ CRX packaging failed:'), error.message);
    process.exit(1);
}); 