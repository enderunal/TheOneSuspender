/**
 * Extension Test Utilities
 * Helper functions for testing Chrome extension functionality
 */

class ExtensionTestUtils {
    constructor(page, context) {
        this.page = page;
        this.context = context;
    }

    /**
     * Get the extension ID from the loaded extension
     */
    async getExtensionId() {
        // Try to navigate to popup and extract ID from URL
        try {
            await this.page.goto('chrome://newtab/');
            await this.page.waitForTimeout(1000);

            // Try to get from chrome.runtime first
            const extensionId = await this.page.evaluate(() => {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
                    return chrome.runtime.id;
                }
                return null;
            });

            if (extensionId) {
                return extensionId;
            }

            // Fallback: try to find manifest URL
            const manifestTest = await this.page.goto('chrome-extension://test/manifest.json').catch(() => null);

            // Generate a likely extension ID (for testing purposes)
            // In real scenarios, you'd need to get this from the loaded extension
            return 'abcdefghijklmnopqrstuvwxyz123456'; // Mock extension ID for testing
        } catch (error) {
            console.warn('Could not get extension ID:', error.message);
            return 'abcdefghijklmnopqrstuvwxyz123456'; // Mock extension ID for testing
        }
    }

    /**
     * Open extension popup
     */
    async openPopup() {
        const extensionId = await this.getExtensionId();
        if (!extensionId) throw new Error('Extension not found');

        const popupUrl = `chrome-extension://${extensionId}/popup.html`;
        return await this.context.newPage().then(page => {
            return page.goto(popupUrl);
        });
    }

    /**
     * Open extension options page
     */
    async openOptionsPage() {
        const extensionId = await this.getExtensionId();
        if (!extensionId) throw new Error('Extension not found');

        const optionsUrl = `chrome-extension://${extensionId}/options.html`;
        return await this.context.newPage().then(page => {
            return page.goto(optionsUrl);
        });
    }

    /**
     * Get extension storage data
     */
    async getStorageData(keys = null) {
        return await this.page.evaluate((keys) => {
            return new Promise(resolve => {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.local.get(keys, resolve);
                } else {
                    resolve({});
                }
            });
        }, keys);
    }

    /**
     * Set extension storage data
     */
    async setStorageData(data) {
        return await this.page.evaluate((data) => {
            return new Promise(resolve => {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.local.set(data, resolve);
                } else {
                    resolve();
                }
            });
        }, data);
    }

    /**
     * Clear extension storage
     */
    async clearStorage() {
        return await this.page.evaluate(() => {
            return new Promise(resolve => {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.local.clear(resolve);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Create a new tab and return its ID
     */
    async createTab(url = 'https://example.com') {
        const newPage = await this.context.newPage();
        await newPage.goto(url);

        try {
            const tabId = await newPage.evaluate(() => {
                return new Promise(resolve => {
                    if (typeof chrome !== 'undefined' && chrome.tabs) {
                        chrome.tabs.getCurrent(tab => resolve(tab ? tab.id : null));
                    } else {
                        resolve(null);
                    }
                });
            });

            return { page: newPage, tabId };
        } catch (error) {
            // If chrome.tabs is not available, just return the page
            return { page: newPage, tabId: null };
        }
    }

    /**
 * Wait for extension to be ready
 */
    async waitForExtensionReady() {
        // First navigate to a page that has extension access
        await this.page.goto('chrome://newtab/');

        try {
            await this.page.waitForFunction(() => {
                return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
            }, { timeout: 10000 });
        } catch {
            // If that fails, try getting extension ID first
            const extensionId = await this.getExtensionId();
            if (extensionId) {
                // Navigate to extension page to ensure context
                await this.page.goto(`chrome-extension://${extensionId}/popup.html`);
                await this.page.waitForTimeout(1000);
            }
        }

        // Give the background script time to initialize
        await this.page.waitForTimeout(2000);
    }

    /**
     * Check if a tab is suspended by looking for suspended page content
     */
    async isTabSuspended(page) {
        try {
            const title = await page.title();
            const url = page.url();

            // Check if it's showing the suspended page
            return url.includes('suspended.html') || title.includes('Suspended');
        } catch (error) {
            return false;
        }
    }

    /**
     * Get all tabs info
     */
    async getAllTabs() {
        return await this.page.evaluate(() => {
            return new Promise(resolve => {
                chrome.tabs.query({}, resolve);
            });
        });
    }

    /**
     * Simulate user interaction to make tab active
     */
    async makeTabActive(page) {
        await page.bringToFront();
        await page.click('body');
        await page.waitForTimeout(100);
    }
}

module.exports = { ExtensionTestUtils }; 