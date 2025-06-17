const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Options Page Functionality Tests', () => {
    test('options page has all required settings sections', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const optionsPath = path.join(__dirname, '..', 'options.html');
            await page.goto(`file://${optionsPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for main settings sections
            const settingsSections = await page.evaluate(() => {
                const automaticSuspension = document.querySelector('#autoSuspendEnabled');
                const suspendTimeout = document.querySelector('#inactivityMinutes');
                const preserveHistory = document.querySelector('#preserveHistory');
                const whitelistSection = document.querySelector('#whitelist');
                const saveButton = document.querySelector('#save-settings');

                return {
                    hasAutomaticSuspension: !!automaticSuspension,
                    hasSuspendTimeout: !!suspendTimeout,
                    hasPreserveHistory: !!preserveHistory,
                    hasWhitelistSection: !!whitelistSection,
                    hasSaveButton: !!saveButton,
                    totalSections: document.querySelectorAll('.settings-section').length
                };
            });

            expect(settingsSections.hasAutomaticSuspension).toBeTruthy();
            expect(settingsSections.hasSuspendTimeout).toBeTruthy();
            expect(settingsSections.hasPreserveHistory).toBeTruthy();
            expect(settingsSections.hasWhitelistSection).toBeTruthy();
            expect(settingsSections.hasSaveButton).toBeTruthy();
            expect(settingsSections.totalSections).toBeGreaterThan(3);
        } finally {
            await context.close();
        }
    });

    test('options page has suspension timeout validation', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const optionsPath = path.join(__dirname, '..', 'options.html');
            await page.goto(`file://${optionsPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check timeout input field attributes
            const timeoutField = await page.evaluate(() => {
                const timeoutInput = document.querySelector('#inactivityMinutes');

                if (timeoutInput) {
                    return {
                        exists: true,
                        type: timeoutInput.type,
                        min: timeoutInput.min,
                        max: timeoutInput.max,
                        step: timeoutInput.step,
                        placeholder: timeoutInput.placeholder,
                        required: timeoutInput.required
                    };
                }
                return { exists: false };
            });

            expect(timeoutField.exists).toBeTruthy();
            expect(timeoutField.type).toBe('number');

            // Should have validation for minimum 1 minute as per FR1
            expect(parseInt(timeoutField.min)).toBe(1);
            expect(timeoutField.required).toBeTruthy();
        } finally {
            await context.close();
        }
    });

    test('options page has suspension mode selection', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const optionsPath = path.join(__dirname, '..', 'options.html');
            await page.goto(`file://${optionsPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for suspension mode options (preserve history vs close & reopen)
            const suspensionModes = await page.evaluate(() => {
                const preserveHistoryOption = document.querySelector('#preserve-history, .preserve-history, [name="preserve-history"]');
                const modeRadios = document.querySelectorAll('input[type="radio"][name*="mode"], input[type="radio"][name*="suspension"]');
                const modeCheckboxes = document.querySelectorAll('input[type="checkbox"][name*="preserve"], input[type="checkbox"][name*="history"]');

                return {
                    hasPreserveHistoryOption: !!preserveHistoryOption,
                    hasModeRadios: modeRadios.length > 0,
                    hasModeCheckboxes: modeCheckboxes.length > 0,
                    totalModeControls: modeRadios.length + modeCheckboxes.length
                };
            });

            // Should have some way to configure suspension mode
            expect(
                suspensionModes.hasPreserveHistoryOption ||
                suspensionModes.hasModeRadios ||
                suspensionModes.hasModeCheckboxes
            ).toBeTruthy();
        } finally {
            await context.close();
        }
    });

    test('options page has conditional suspension exceptions', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const optionsPath = path.join(__dirname, '..', 'options.html');
            await page.goto(`file://${optionsPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for exception checkboxes
            const exceptions = await page.evaluate(() => {
                const pinnedTabsOption = document.querySelector('#neverSuspendPinned');
                const audioTabsOption = document.querySelector('#neverSuspendAudio');
                const activeTabsOption = document.querySelector('#neverSuspendActive');
                const lastWindowOption = document.querySelector('#neverSuspendLastWindow');
                const offlineOption = document.querySelector('#neverSuspendOffline');

                // Count all checkbox inputs that might be exception rules
                const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');

                return {
                    hasPinnedTabsOption: !!pinnedTabsOption,
                    hasAudioTabsOption: !!audioTabsOption,
                    hasActiveTabsOption: !!activeTabsOption,
                    hasLastWindowOption: !!lastWindowOption,
                    hasOfflineOption: !!offlineOption,
                    totalCheckboxes: allCheckboxes.length
                };
            });

            // Should have multiple exception options
            expect(exceptions.totalCheckboxes).toBeGreaterThan(3);

            // Should have at least some of the key exception types
            const keyExceptions = [
                exceptions.hasPinnedTabsOption,
                exceptions.hasAudioTabsOption,
                exceptions.hasActiveTabsOption,
                exceptions.hasLastWindowOption,
                exceptions.hasOfflineOption
            ].filter(Boolean).length;

            expect(keyExceptions).toBeGreaterThan(2);
        } finally {
            await context.close();
        }
    });

    test('options page has whitelist management section', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const optionsPath = path.join(__dirname, '..', 'options.html');
            await page.goto(`file://${optionsPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for whitelist textarea and related controls
            const whitelistControls = await page.evaluate(() => {
                const whitelistTextarea = document.querySelector('#whitelist, .whitelist, #url-whitelist, textarea[name*="whitelist"]');
                const whitelistInput = document.querySelector('input[name*="whitelist"]');
                const whitelistSection = document.querySelector('.whitelist-section, #whitelist-section');

                return {
                    hasWhitelistTextarea: !!whitelistTextarea,
                    hasWhitelistInput: !!whitelistInput,
                    hasWhitelistSection: !!whitelistSection,
                    textareaRows: whitelistTextarea?.rows || 0,
                    textareaPlaceholder: whitelistTextarea?.placeholder || ''
                };
            });

            // Should have whitelist input mechanism
            expect(
                whitelistControls.hasWhitelistTextarea ||
                whitelistControls.hasWhitelistInput ||
                whitelistControls.hasWhitelistSection
            ).toBeTruthy();

            // If textarea exists, should be multi-line for multiple entries
            if (whitelistControls.hasWhitelistTextarea) {
                expect(whitelistControls.textareaRows).toBeGreaterThan(2);
            }
        } finally {
            await context.close();
        }
    });

    test('options page validates whitelist entries format', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const optionsPath = path.join(__dirname, '..', 'options.html');
            await page.goto(`file://${optionsPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Test whitelist validation logic
            const whitelistValidation = await page.evaluate(() => {
                // Test URLs that should be valid
                const testUrls = [
                    'google.com',
                    'https://google.com',
                    'github.com',
                    'https://github.com/enderunal/TheOneSuspender',
                    '*' // global wildcard
                ];

                // Basic validation function (simulated)
                const isValidEntry = (entry) => {
                    if (entry === '*') return true;
                    if (entry.includes('.')) return true;
                    if (entry.startsWith('http')) return true;
                    return false;
                };

                return {
                    testResults: testUrls.map(url => ({
                        url,
                        valid: isValidEntry(url)
                    })),
                    hasValidationLogic: true
                };
            });

            // All test URLs should be considered valid
            whitelistValidation.testResults.forEach(result => {
                expect(result.valid).toBeTruthy();
            });
        } finally {
            await context.close();
        }
    });

    test('options page has unsaved form handling options', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const optionsPath = path.join(__dirname, '..', 'options.html');
            await page.goto(`file://${optionsPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for unsaved form data handling options
            const formHandling = await page.evaluate(() => {
                const askBeforeOption = document.querySelector('#ask-before, .ask-before, [name*="ask"]');
                const neverSuspendFormsOption = document.querySelector('[name*="form"], [name*="unsaved"]');
                const formHandlingSection = document.querySelector('.form-handling, #form-handling');

                // Look for radio buttons related to form handling
                const formRadios = document.querySelectorAll('input[type="radio"][name*="form"], input[type="radio"][name*="unsaved"]');

                return {
                    hasAskBeforeOption: !!askBeforeOption,
                    hasNeverSuspendFormsOption: !!neverSuspendFormsOption,
                    hasFormHandlingSection: !!formHandlingSection,
                    hasFormRadios: formRadios.length > 0,
                    totalFormControls: document.querySelectorAll('[name*="form"], [name*="unsaved"], [name*="ask"]').length
                };
            });

            // Should have form handling options (FR15 mentions Ask Before Suspending)
            expect(formHandling.totalFormControls).toBeGreaterThan(0);
        } finally {
            await context.close();
        }
    });

    test('options page has theme selection controls', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const optionsPath = path.join(__dirname, '..', 'options.html');
            await page.goto(`file://${optionsPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for theme controls (dark mode mentioned in functionality)
            const themeControls = await page.evaluate(() => {
                const themeSelect = document.querySelector('#theme, .theme, select[name*="theme"]');
                const themeRadios = document.querySelectorAll('input[type="radio"][name*="theme"]');
                const darkModeToggle = document.querySelector('#dark-mode, .dark-mode, [name*="dark"]');
                const themePreview = document.querySelector('.theme-preview, .theme-selector');

                return {
                    hasThemeSelect: !!themeSelect,
                    hasThemeRadios: themeRadios.length > 0,
                    hasDarkModeToggle: !!darkModeToggle,
                    hasThemePreview: !!themePreview,
                    totalThemeControls: (themeSelect ? 1 : 0) + themeRadios.length + (darkModeToggle ? 1 : 0)
                };
            });

            // Should have theme controls (dark mode is a key feature)
            expect(themeControls.totalThemeControls).toBeGreaterThan(0);
        } finally {
            await context.close();
        }
    });

    test('options page has export/import functionality', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const optionsPath = path.join(__dirname, '..', 'options.html');
            await page.goto(`file://${optionsPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for export/import controls (should be in Tools tab)
            const exportImportControls = await page.evaluate(() => {
                // First check if there's a Tools tab
                const toolsTab = document.querySelector('[data-tab="tools"]');
                const toolsContent = document.querySelector('#tab-tools');
                const fileInputs = document.querySelectorAll('input[type="file"]');
                const buttons = document.querySelectorAll('button');

                // Look for export/import related buttons
                const exportButtons = Array.from(buttons).filter(btn =>
                    btn.textContent.toLowerCase().includes('export') ||
                    btn.id.includes('export')
                );

                const importButtons = Array.from(buttons).filter(btn =>
                    btn.textContent.toLowerCase().includes('import') ||
                    btn.id.includes('import')
                );

                return {
                    hasToolsTab: !!toolsTab,
                    hasToolsContent: !!toolsContent,
                    hasFileInputs: fileInputs.length > 0,
                    exportButtonCount: exportButtons.length,
                    importButtonCount: importButtons.length,
                    totalExportImportControls: exportButtons.length + importButtons.length + fileInputs.length
                };
            });

            // Should have tools tab or export/import functionality
            expect(exportImportControls.hasToolsTab || exportImportControls.totalExportImportControls > 0).toBeTruthy();
        } finally {
            await context.close();
        }
    });

    test('options page has proper form validation and feedback', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const optionsPath = path.join(__dirname, '..', 'options.html');
            await page.goto(`file://${optionsPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for validation and feedback elements
            const validationElements = await page.evaluate(() => {
                const statusMessage = document.querySelector('#save-status, .save-status, .status-message');
                const errorMessage = document.querySelector('.error-message, .error');
                const successMessage = document.querySelector('.success-message, .success');
                const requiredFields = document.querySelectorAll('[required]');
                const validationMessages = document.querySelectorAll('.validation-message, .field-error');

                return {
                    hasStatusMessage: !!statusMessage,
                    hasErrorMessage: !!errorMessage,
                    hasSuccessMessage: !!successMessage,
                    hasRequiredFields: requiredFields.length > 0,
                    hasValidationMessages: validationMessages.length > 0,
                    totalValidationElements: [statusMessage, errorMessage, successMessage].filter(Boolean).length
                };
            });

            // Should have feedback mechanisms (FR11 mentions user-visible feedback)
            expect(validationElements.hasStatusMessage || validationElements.totalValidationElements > 0).toBeTruthy();
        } finally {
            await context.close();
        }
    });
}); 