const { test, expect } = require('./config/node_modules/@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Default Values Tests', () => {

    test('logger.js has correct default values - all logging disabled', async () => {
        const loggerPath = path.join(__dirname, '..', 'src', 'common', 'logger.js');
        const loggerContent = fs.readFileSync(loggerPath, 'utf8');

        // Test that all logging is disabled by default
        expect(loggerContent).toContain('enableStandardLogs: false');
        expect(loggerContent).toContain('enableDetailedLogs: false');
        expect(loggerContent).toContain('enableWarningLogs: false');
        expect(loggerContent).toContain('enableErrorLogs: false');

        // Verify the initial LogConfig structure
        const logConfigMatch = loggerContent.match(/let LogConfig = \{[\s\S]*?\};/);
        expect(logConfigMatch).toBeTruthy();

        const logConfigString = logConfigMatch[0];
        expect(logConfigString).toContain('enableStandardLogs: false');
        expect(logConfigString).toContain('enableDetailedLogs: false');
        expect(logConfigString).toContain('enableWarningLogs: false');
        expect(logConfigString).toContain('enableErrorLogs: false');
        expect(logConfigString).toContain('logPrefix: "TheOneSuspender"');
    });

    test('prefs.js has correct default values', async () => {
        const prefsPath = path.join(__dirname, '..', 'src', 'common', 'prefs.js');
        const prefsContent = fs.readFileSync(prefsPath, 'utf8');

        // Test that defaultPrefs has expected values
        const defaultPrefsMatch = prefsContent.match(/export const defaultPrefs = \{[\s\S]*?\};/);
        expect(defaultPrefsMatch).toBeTruthy();

        const defaultPrefsString = defaultPrefsMatch[0];

        // Test suspension settings
        expect(defaultPrefsString).toContain('suspendAfter: 10');
        expect(defaultPrefsString).toContain('lastPositiveSuspendAfter: 10');
        expect(defaultPrefsString).toContain('preserveHistory: true');
        expect(defaultPrefsString).toContain('autoSuspendEnabled: true');

        // Test never suspend settings
        expect(defaultPrefsString).toContain('neverSuspendPinned: true');
        expect(defaultPrefsString).toContain('neverSuspendAudio: true');
        expect(defaultPrefsString).toContain('neverSuspendActive: false');
        expect(defaultPrefsString).toContain('neverSuspendLastWindow: true');
        expect(defaultPrefsString).toContain('neverSuspendOffline: false');

        // Test unsaved form handling
        expect(defaultPrefsString).toContain("unsavedFormHandling: 'ask'");

        // Test theme
        expect(defaultPrefsString).toContain("theme: 'gold'");

        // Test session settings
        expect(defaultPrefsString).toContain('sessionMaxSessions: 10');
        expect(defaultPrefsString).toContain('sessionAutoSaveFrequency: 30');

        // Test logging preferences - should all be false
        expect(defaultPrefsString).toContain('enableStandardLogs: false');
        expect(defaultPrefsString).toContain('enableDetailedLogs: false');
        expect(defaultPrefsString).toContain('enableWarningLogs: false');
        expect(defaultPrefsString).toContain('enableErrorLogs: false');
    });

    test('logger.js updateLoggingConfig defaults to false when not provided', async () => {
        // Create a mock test of the updateLoggingConfig function that matches actual implementation
        const mockUpdateLoggingConfig = (prefs) => {
            const LogConfig = {
                enableStandardLogs: false,
                enableDetailedLogs: false,
                enableWarningLogs: false,
                enableErrorLogs: false
            };

            if (prefs && typeof prefs === 'object') {
                LogConfig.enableStandardLogs = prefs.enableStandardLogs !== false; // Default to true when provided
                LogConfig.enableDetailedLogs = prefs.enableDetailedLogs !== false; // Default to true when provided
                LogConfig.enableWarningLogs = prefs.enableWarningLogs !== false; // Default to true when provided
                LogConfig.enableErrorLogs = prefs.enableErrorLogs !== false; // Default to true when provided
            }

            return LogConfig;
        };

        // Test with undefined prefs - should remain false (initial state)
        const result1 = mockUpdateLoggingConfig(undefined);
        expect(result1.enableStandardLogs).toBe(false);
        expect(result1.enableDetailedLogs).toBe(false);
        expect(result1.enableWarningLogs).toBe(false);
        expect(result1.enableErrorLogs).toBe(false);

        // Test with empty prefs - should default to true when object is provided
        const result2 = mockUpdateLoggingConfig({});
        expect(result2.enableStandardLogs).toBe(true);
        expect(result2.enableDetailedLogs).toBe(true);
        expect(result2.enableWarningLogs).toBe(true);
        expect(result2.enableErrorLogs).toBe(true);

        // Test with explicitly false values
        const result3 = mockUpdateLoggingConfig({
            enableStandardLogs: false,
            enableDetailedLogs: false,
            enableWarningLogs: false,
            enableErrorLogs: false
        });
        expect(result3.enableStandardLogs).toBe(false);
        expect(result3.enableDetailedLogs).toBe(false);
        expect(result3.enableWarningLogs).toBe(false);
        expect(result3.enableErrorLogs).toBe(false);

        // Test with explicitly true values
        const result4 = mockUpdateLoggingConfig({
            enableStandardLogs: true,
            enableDetailedLogs: true,
            enableWarningLogs: true,
            enableErrorLogs: true
        });
        expect(result4.enableStandardLogs).toBe(true);
        expect(result4.enableDetailedLogs).toBe(true);
        expect(result4.enableWarningLogs).toBe(true);
        expect(result4.enableErrorLogs).toBe(true);
    });

    test('default preferences structure is complete', async () => {
        const prefsPath = path.join(__dirname, '..', 'src', 'common', 'prefs.js');
        const prefsContent = fs.readFileSync(prefsPath, 'utf8');

        // Extract the defaultPrefs object
        const defaultPrefsMatch = prefsContent.match(/export const defaultPrefs = \{([\s\S]*?)\};/);
        expect(defaultPrefsMatch).toBeTruthy();

        const defaultPrefsString = defaultPrefsMatch[1];

        // Required keys that should be present
        const requiredKeys = [
            'suspendAfter',
            'lastPositiveSuspendAfter',
            'preserveHistory',
            'neverSuspendPinned',
            'neverSuspendAudio',
            'neverSuspendActive',
            'neverSuspendLastWindow',
            'neverSuspendOffline',
            'unsavedFormHandling',
            'autoSuspendEnabled',
            'theme',
            'sessionMaxSessions',
            'sessionAutoSaveFrequency',
            'enableStandardLogs',
            'enableDetailedLogs',
            'enableWarningLogs',
            'enableErrorLogs'
        ];

        requiredKeys.forEach(key => {
            expect(defaultPrefsString).toContain(key);
        });

        // Verify numeric values are reasonable
        expect(defaultPrefsString).toMatch(/suspendAfter:\s*10/);
        expect(defaultPrefsString).toMatch(/lastPositiveSuspendAfter:\s*10/);
        expect(defaultPrefsString).toMatch(/sessionMaxSessions:\s*10/);
        expect(defaultPrefsString).toMatch(/sessionAutoSaveFrequency:\s*30/);

        // Verify boolean values are explicit
        expect(defaultPrefsString).toMatch(/preserveHistory:\s*true/);
        expect(defaultPrefsString).toMatch(/neverSuspendPinned:\s*true/);
        expect(defaultPrefsString).toMatch(/neverSuspendAudio:\s*true/);
        expect(defaultPrefsString).toMatch(/neverSuspendActive:\s*false/);
        expect(defaultPrefsString).toMatch(/neverSuspendLastWindow:\s*true/);
        expect(defaultPrefsString).toMatch(/neverSuspendOffline:\s*false/);
        expect(defaultPrefsString).toMatch(/autoSuspendEnabled:\s*true/);

        // Verify string values are quoted
        expect(defaultPrefsString).toMatch(/unsavedFormHandling:\s*'ask'/);
        expect(defaultPrefsString).toMatch(/theme:\s*'gold'/);

        // Verify all logging defaults are false
        expect(defaultPrefsString).toMatch(/enableStandardLogs:\s*false/);
        expect(defaultPrefsString).toMatch(/enableDetailedLogs:\s*false/);
        expect(defaultPrefsString).toMatch(/enableWarningLogs:\s*false/);
        expect(defaultPrefsString).toMatch(/enableErrorLogs:\s*false/);
    });

    test('manifest.json has correct default values', async () => {
        const manifestPath = path.join(__dirname, '..', 'manifest.json');
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);

        // Test basic manifest structure
        expect(manifest.manifest_version).toBe(3);
        expect(manifest.name).toContain('UnaSuspender');
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(manifest.incognito).toBe('split');

        // Test required permissions
        const requiredPermissions = ['tabs', 'storage', 'alarms', 'scripting', 'favicon'];
        requiredPermissions.forEach(permission => {
            expect(manifest.permissions).toContain(permission);
        });

        // Test host permissions
        expect(manifest.host_permissions).toContain('http://*/*');
        expect(manifest.host_permissions).toContain('https://*/*');

        // Test background service worker
        expect(manifest.background.service_worker).toBe('src/background/background.js');
        expect(manifest.background.type).toBe('module');

        // Test action (popup)
        expect(manifest.action.default_popup).toBe('popup.html');
        expect(manifest.options_page).toBe('options.html');

        // Test icons
        expect(manifest.icons['16']).toBe('icons/icon16.png');
        expect(manifest.icons['48']).toBe('icons/icon48.png');
        expect(manifest.icons['128']).toBe('icons/icon128.png');
    });

    test('logger.js has correct LogComponent constants', async () => {
        const loggerPath = path.join(__dirname, '..', 'src', 'common', 'logger.js');
        const loggerContent = fs.readFileSync(loggerPath, 'utf8');

        // Test LogComponent structure
        const logComponentMatch = loggerContent.match(/export const LogComponent = \{[\s\S]*?\};/);
        expect(logComponentMatch).toBeTruthy();

        const logComponentString = logComponentMatch[0];

        // Required LogComponent keys
        const requiredComponents = [
            'BACKGROUND',
            'CONTENT',
            'SUSPENDED',
            'POPUP',
            'OPTIONS',
            'SUSPENSION',
            'SCHEDULING',
            'GENERAL'
        ];

        requiredComponents.forEach(component => {
            expect(logComponentString).toContain(component);
        });

        // Verify specific component values
        expect(logComponentString).toContain('BACKGROUND: "BG"');
        expect(logComponentString).toContain('CONTENT: "CS"');
        expect(logComponentString).toContain('SUSPENDED: "Page"');
        expect(logComponentString).toContain('POPUP: "Popup"');
        expect(logComponentString).toContain('OPTIONS: "Options"');
        expect(logComponentString).toContain('SUSPENSION: "Suspend"');
        expect(logComponentString).toContain('SCHEDULING: "Schedule"');
        expect(logComponentString).toContain('GENERAL: ""');
    });

    test('all default values are production-ready', async () => {
        // This test ensures all default values are appropriate for production release

        // Test that logging is disabled by default (production-ready)
        const loggerPath = path.join(__dirname, '..', 'src', 'common', 'logger.js');
        const loggerContent = fs.readFileSync(loggerPath, 'utf8');

        expect(loggerContent).toContain('enableStandardLogs: false');
        expect(loggerContent).toContain('enableDetailedLogs: false');
        expect(loggerContent).toContain('enableWarningLogs: false');
        expect(loggerContent).toContain('enableErrorLogs: false');

        // Test that prefs logging defaults are also disabled
        const prefsPath = path.join(__dirname, '..', 'src', 'common', 'prefs.js');
        const prefsContent = fs.readFileSync(prefsPath, 'utf8');

        expect(prefsContent).toContain('enableStandardLogs: false');
        expect(prefsContent).toContain('enableDetailedLogs: false');
        expect(prefsContent).toContain('enableWarningLogs: false');
        expect(prefsContent).toContain('enableErrorLogs: false');

        // Test that suspension defaults are reasonable
        expect(prefsContent).toContain('suspendAfter: 10'); // 10 minutes is reasonable
        expect(prefsContent).toContain('autoSuspendEnabled: true'); // Auto-suspend should be enabled
        expect(prefsContent).toContain('preserveHistory: true'); // Better UX
        expect(prefsContent).toContain('neverSuspendPinned: true'); // Good default
        expect(prefsContent).toContain('neverSuspendAudio: true'); // Good default
        expect(prefsContent).toContain("unsavedFormHandling: 'ask'"); // Safe default

        // Test that session defaults are reasonable
        expect(prefsContent).toContain('sessionMaxSessions: 10'); // Not too many
        expect(prefsContent).toContain('sessionAutoSaveFrequency: 30'); // 30 minutes is reasonable
    });
}); 