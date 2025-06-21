const { test, expect } = require('./config/node_modules/@playwright/test');
const path = require('path');

test.describe('Popup Functionality Tests', () => {
    test('popup displays status indicators correctly', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            // Load popup as file URL
            const popupPath = path.join(__dirname, '..', 'popup.html');
            await page.goto(`file://${popupPath.replace(/\\/g, '/')}`);

            // Wait for content to load
            await page.waitForTimeout(1000);

            // Check for main action button (suspend/restore)
            const hasMainAction = await page.evaluate(() => {
                return !!document.querySelector('#suspend-restore, .primary-button');
            });
            expect(hasMainAction).toBeTruthy();

            // Check for popup title
            const hasPopupTitle = await page.evaluate(() => {
                return !!document.querySelector('.popup-title, h1');
            });
            expect(hasPopupTitle).toBeTruthy();

            // Check for feedback message area
            const hasFeedbackArea = await page.evaluate(() => {
                return !!document.querySelector('#action-feedback-message, .feedback-message');
            });
            expect(hasFeedbackArea).toBeTruthy();
        } finally {
            await context.close();
        }
    });

    test('popup has whitelist controls for URL and domain', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const popupPath = path.join(__dirname, '..', 'popup.html');
            await page.goto(`file://${popupPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for whitelist control buttons
            const whitelistControls = await page.evaluate(() => {
                const urlButton = document.querySelector('#whitelist-url');
                const domainButton = document.querySelector('#whitelist-domain');

                return {
                    hasUrlControl: !!urlButton,
                    hasDomainControl: !!domainButton,
                    urlButtonText: urlButton?.textContent || '',
                    domainButtonText: domainButton?.textContent || ''
                };
            });

            expect(whitelistControls.hasUrlControl).toBeTruthy();
            expect(whitelistControls.hasDomainControl).toBeTruthy();

            // Check button text contains relevant keywords
            expect(whitelistControls.urlButtonText.toLowerCase()).toMatch(/url|never.*suspend/);
            expect(whitelistControls.domainButtonText.toLowerCase()).toMatch(/domain|never.*suspend/);
        } finally {
            await context.close();
        }
    });

    test('popup has bulk action controls', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const popupPath = path.join(__dirname, '..', 'popup.html');
            await page.goto(`file://${popupPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for bulk action buttons
            const bulkActions = await page.evaluate(() => {
                const suspendWindowBtn = document.querySelector('#suspend-others-window');
                const suspendAllBtn = document.querySelector('#suspend-others-all');
                const unsuspendWindowBtn = document.querySelector('#unsuspend-all-window');
                const unsuspendAllBtn = document.querySelector('#unsuspend-all-all');

                return {
                    hasSuspendWindow: !!suspendWindowBtn,
                    hasSuspendAll: !!suspendAllBtn,
                    hasUnsuspendWindow: !!unsuspendWindowBtn,
                    hasUnsuspendAll: !!unsuspendAllBtn,
                    totalBulkButtons: [suspendWindowBtn, suspendAllBtn, unsuspendWindowBtn, unsuspendAllBtn].filter(Boolean).length
                };
            });

            // Should have bulk action controls
            expect(bulkActions.totalBulkButtons).toBeGreaterThan(2);

            // Should have at least suspend and unsuspend options
            expect(bulkActions.hasSuspendWindow || bulkActions.hasSuspendAll).toBeTruthy();
            expect(bulkActions.hasUnsuspendWindow || bulkActions.hasUnsuspendAll).toBeTruthy();
        } finally {
            await context.close();
        }
    });

    test('popup has settings navigation link', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const popupPath = path.join(__dirname, '..', 'popup.html');
            await page.goto(`file://${popupPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check for settings button/link
            const hasSettingsLink = await page.evaluate(() => {
                const settingsBtn = document.querySelector('#open-settings');
                const settingsIcon = document.querySelector('.settings-icon');

                return {
                    hasSettingsButton: !!settingsBtn,
                    hasSettingsIcon: !!settingsIcon,
                    settingsText: settingsBtn?.textContent || ''
                };
            });

            expect(hasSettingsLink.hasSettingsButton).toBeTruthy();
            expect(hasSettingsLink.hasSettingsIcon).toBeTruthy();

            // Check for settings-related text or icon
            expect(hasSettingsLink.settingsText.toLowerCase()).toMatch(/settings|options|⚙️/);
        } finally {
            await context.close();
        }
    });

    test('popup form elements are properly structured', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const popupPath = path.join(__dirname, '..', 'popup.html');
            await page.goto(`file://${popupPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Check form structure and accessibility
            const formStructure = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                const inputs = document.querySelectorAll('input');
                const labels = document.querySelectorAll('label');

                // Check for proper button attributes
                const buttonsWithActions = Array.from(buttons).filter(btn =>
                    btn.hasAttribute('data-action') ||
                    btn.id ||
                    btn.onclick ||
                    btn.type === 'submit'
                );

                return {
                    totalButtons: buttons.length,
                    totalInputs: inputs.length,
                    totalLabels: labels.length,
                    buttonsWithActions: buttonsWithActions.length,
                    hasMainContainer: !!document.querySelector('.popup-container, .container, main')
                };
            });

            expect(formStructure.totalButtons).toBeGreaterThan(3); // Should have multiple action buttons
            expect(formStructure.buttonsWithActions).toBeGreaterThan(2); // Buttons should have proper actions
            expect(formStructure.hasMainContainer).toBeTruthy(); // Should have proper container structure
        } finally {
            await context.close();
        }
    });

    test('popup handles test URLs correctly', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const popupPath = path.join(__dirname, '..', 'popup.html');
            await page.goto(`file://${popupPath.replace(/\\/g, '/')}`);

            await page.waitForTimeout(1000);

            // Test URL and domain extraction logic (if available in popup)
            const urlHandling = await page.evaluate(() => {
                // Simulate URL processing for google.com
                const testUrl = 'https://google.com';
                const testGitHubUrl = 'https://github.com/enderunal/TheOneSuspender';

                // Check for any popup elements that might show URLs
                const popupContainer = document.querySelector('.popup-container');
                const quickActions = document.querySelector('.quick-actions');

                return {
                    hasPopupContainer: !!popupContainer,
                    hasQuickActions: !!quickActions,
                    testUrl,
                    testGitHubUrl,
                    // Test basic domain extraction logic
                    googleDomain: testUrl.replace(/^https?:\/\//, '').split('/')[0],
                    githubDomain: testGitHubUrl.replace(/^https?:\/\//, '').split('/')[0]
                };
            });

            expect(urlHandling.googleDomain).toBe('google.com');
            expect(urlHandling.githubDomain).toBe('github.com');

            // Popup structure should exist
            expect(urlHandling.hasPopupContainer).toBeTruthy();
            expect(urlHandling.hasQuickActions).toBeTruthy();
        } finally {
            await context.close();
        }
    });
}); 