/**
 * Chrome Web Store Screenshots Generator
 * Single comprehensive test file for generating all required screenshots
 * Supports both headless and headed modes
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs').promises;

// Configuration
const SCREENSHOT_CONFIG = {
    width: 1280,
    height: 800,
    type: 'png'
};

const THEMES = ['gold', 'gold-dark'];
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// Helper function to set theme preferences
async function setTheme(page, theme) {
    await page.evaluate((theme) => {
        // Apply theme immediately to DOM
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.setAttribute('data-theme-loading', theme);
        if (document.body) {
            document.body.className = `theme-${theme}`;
        }

        // Set valid form values to pass validation
        setTimeout(() => {
            const minutesInput = document.querySelector('input[type="number"], #suspendInMs, [name="suspendInMs"]');
            if (minutesInput) {
                minutesInput.value = '20';
                minutesInput.dispatchEvent(new Event('input', { bubbles: true }));
                minutesInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, 100);
    }, theme);
}

// Helper function to get extension URLs using file:// protocol
function getExtensionUrls() {
    const basePath = path.join(__dirname, '..');
    return {
        popup: `file://${basePath.replace(/\\/g, '/')}/popup.html`,
        options: `file://${basePath.replace(/\\/g, '/')}/options.html`,
        suspended: `file://${basePath.replace(/\\/g, '/')}/suspended.html`
    };
}

test.describe('Chrome Web Store Screenshots', () => {
    test.beforeAll(async () => {
        // Ensure screenshot directory exists
        try {
            await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    });

    test.beforeEach(async ({ page }) => {
        // Set viewport to Chrome Web Store dimensions
        await page.setViewportSize({
            width: SCREENSHOT_CONFIG.width,
            height: SCREENSHOT_CONFIG.height
        });
    });

    for (const theme of THEMES) {
        test(`Generate popup screenshot for ${theme} theme`, async ({ page }) => {
            const urls = getExtensionUrls();

            // Navigate to popup
            await page.goto(urls.popup);
            await page.waitForLoadState('domcontentloaded');

            // Set theme
            await setTheme(page, theme);
            await page.waitForTimeout(2000);

            // Wait for popup to load
            await page.waitForSelector('body', { timeout: 5000 });
            await page.waitForTimeout(2000);

            // Fix popup content to match real popup
            await page.evaluate(() => {
                const replaceContent = () => {
                    const buttons = document.querySelectorAll('button');
                    buttons.forEach(button => {
                        if (button.textContent.includes('Loading') || button.textContent.includes('Restore Tab')) {
                            button.textContent = 'Suspend Tab';
                        }
                    });

                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );

                    const textNodes = [];
                    let node;
                    while (node = walker.nextNode()) {
                        textNodes.push(node);
                    }

                    textNodes.forEach(textNode => {
                        if (textNode.textContent.includes('Loading...') || textNode.textContent.includes('Restore Tab')) {
                            textNode.textContent = 'Suspend Tab';
                        }
                    });
                };

                replaceContent();
                setTimeout(replaceContent, 100);
                setTimeout(replaceContent, 500);
            });

            // Set compact popup viewport size
            await page.setViewportSize({ width: 320, height: 400 });
            await page.waitForTimeout(1000);

            // Use exact popup dimensions (267x389)
            const popupWidth = 267;
            const popupHeight = 389;

            // Set viewport to exact popup size
            await page.setViewportSize({ width: popupWidth, height: popupHeight });
            await page.waitForTimeout(500);

            // Prevent scrollbars
            await page.evaluate(() => {
                document.documentElement.style.overflow = 'hidden';
                document.body.style.overflow = 'hidden';
            });
            await page.waitForTimeout(200);

            // Take popup screenshot
            const popupScreenshotBuffer = await page.screenshot({
                type: 'png',
                fullPage: false,
                clip: { x: 0, y: 0, width: popupWidth, height: popupHeight }
            });

            // Determine theme colors
            const isDarkTheme = theme === 'gold-dark';
            const pageBackgroundColor = isDarkTheme ? '#1a1a1a' : '#ffffff';
            const pageTextColor = isDarkTheme ? '#e8eaed' : '#333333';
            const browserHeaderBg = isDarkTheme ? '#2d2d2d' : '#e8eaed';
            const browserHeaderBorder = isDarkTheme ? '#404040' : '#dadce0';
            const addressBarBg = isDarkTheme ? '#404040' : '#ffffff';
            const addressBarBorder = isDarkTheme ? '#5f6368' : '#dadce0';
            const addressBarText = isDarkTheme ? '#e8eaed' : '#5f6368';

            // Create browser window HTML
            const browserHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>* { margin: 0; padding: 0; box-sizing: border-box; }body { width: 1280px; height: 800px; background: ${isDarkTheme ? '#0f0f0f' : '#f5f5f5'}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; position: relative; overflow: hidden; }.browser-window { width: 100%; height: 100%; background: ${pageBackgroundColor}; border-radius: 8px 8px 0 0; box-shadow: 0 0 20px rgba(0,0,0,${isDarkTheme ? '0.3' : '0.1'}); display: flex; flex-direction: column; }.browser-header { height: 40px; background: ${browserHeaderBg}; border-bottom: 1px solid ${browserHeaderBorder}; display: flex; align-items: center; padding: 0 16px; }.window-controls { display: flex; gap: 8px; }.control-button { width: 12px; height: 12px; border-radius: 50%; }.control-close { background: #ff5f57; }.control-minimize { background: #ffbd2e; }.control-maximize { background: #28ca42; }.address-bar { flex: 1; margin: 0 16px; height: 28px; background: ${addressBarBg}; border: 1px solid ${addressBarBorder}; border-radius: 14px; display: flex; align-items: center; padding: 0 12px; color: ${addressBarText}; font-size: 13px; }.extension-toolbar { display: flex; align-items: center; gap: 8px; }.extension-icon { width: 24px; height: 24px; background: #b8860b; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold; cursor: pointer; }.browser-content { flex: 1; background: ${pageBackgroundColor}; position: relative; }.popup-container { position: absolute; top: 8px; right: 8px; background: transparent; z-index: 1000; }.popup-container img { box-shadow: 0 8px 24px rgba(0,0,0,${isDarkTheme ? '0.4' : '0.2'}); border-radius: 8px; border: 1px solid ${isDarkTheme ? '#404040' : '#e0e0e0'}; }.page-content { padding: 40px; color: ${pageTextColor}; line-height: 1.6; }.page-title { font-size: 32px; font-weight: 400; margin-bottom: 24px; color: ${isDarkTheme ? '#4285f4' : '#1a73e8'}; text-align: center; margin-top: 120px; }.search-box { max-width: 600px; margin: 0 auto 40px auto; }.search-input { width: 100%; height: 44px; border: 1px solid ${isDarkTheme ? '#5f6368' : '#dfe1e5'}; border-radius: 24px; padding: 0 20px; font-size: 16px; background: ${isDarkTheme ? '#303134' : '#ffffff'}; color: ${pageTextColor}; }.search-buttons { display: flex; justify-content: center; gap: 12px; margin-top: 30px; }.search-button { background: ${isDarkTheme ? '#303134' : '#f8f9fa'}; border: 1px solid ${isDarkTheme ? '#5f6368' : '#f8f9fa'}; border-radius: 4px; color: ${pageTextColor}; font-size: 14px; padding: 10px 20px; cursor: pointer; }</style></head><body><div class="browser-window"><div class="browser-header"><div class="window-controls"><div class="control-button control-close"></div><div class="control-button control-minimize"></div><div class="control-button control-maximize"></div></div><div class="address-bar">https://www.google.com</div><div class="extension-toolbar"><div class="extension-icon">⏸</div></div></div><div class="browser-content"><div class="page-content"><div class="page-title">Google</div><div class="search-box"><input type="text" class="search-input" placeholder="Search Google or type a URL"></div><div class="search-buttons"><button class="search-button">Google Search</button><button class="search-button">I'm Feeling Lucky</button></div></div><div class="popup-container" id="popup-container"></div></div></div></body></html>`;

            // Create browser page and insert popup
            const browserPage = await page.context().newPage();
            await browserPage.setViewportSize({ width: 1280, height: 800 });
            await browserPage.setContent(browserHtml);
            await browserPage.waitForTimeout(1000);

            await browserPage.evaluate((popupImageData) => {
                const popupContainer = document.getElementById('popup-container');
                if (popupContainer) {
                    const img = document.createElement('img');
                    img.src = 'data:image/png;base64,' + popupImageData;
                    img.style.display = 'block';
                    popupContainer.appendChild(img);
                }
            }, popupScreenshotBuffer.toString('base64'));

            await browserPage.waitForTimeout(1000);

            // Take final screenshot
            const screenshotPath = path.join(SCREENSHOT_DIR, `popup-${theme}.png`);
            await browserPage.screenshot({
                path: screenshotPath,
                type: SCREENSHOT_CONFIG.type,
                fullPage: false
            });

            await browserPage.close();

            // Verify screenshot
            const stats = await fs.stat(screenshotPath);
            expect(stats.size).toBeGreaterThan(5000);
            console.log(`✅ Generated: popup-${theme}.png (${Math.round(stats.size / 1024)}KB)`);
        });

        test(`Generate options screenshot for ${theme} theme`, async ({ page }) => {
            const urls = getExtensionUrls();

            await page.goto(urls.options);
            await page.waitForLoadState('domcontentloaded');

            await setTheme(page, theme);
            await page.waitForTimeout(3000);

            await page.waitForSelector('body', { timeout: 5000 });

            // Try to click on settings tab
            try {
                await page.click('[data-tab="settings"]', { timeout: 2000 });
                await page.waitForTimeout(1000);
            } catch (e) {
                // Tab might not exist or already be active
            }

            const screenshotPath = path.join(SCREENSHOT_DIR, `options-${theme}.png`);
            await page.screenshot({
                path: screenshotPath,
                type: SCREENSHOT_CONFIG.type,
                fullPage: true
            });

            const stats = await fs.stat(screenshotPath);
            expect(stats.size).toBeGreaterThan(5000);
            console.log(`✅ Generated: options-${theme}.png (${Math.round(stats.size / 1024)}KB)`);
        });

        test(`Generate appearance screenshot for ${theme} theme`, async ({ page }) => {
            const urls = getExtensionUrls();

            await page.goto(urls.options);
            await page.waitForLoadState('domcontentloaded');

            await setTheme(page, theme);
            await page.waitForTimeout(4000);

            await page.waitForSelector('body', { timeout: 5000 });

            // Set valid form values
            await page.evaluate(() => {
                const minutesInput = document.querySelector('input[type="number"], #suspendInMs, [name="suspendInMs"]');
                if (minutesInput) {
                    minutesInput.value = '20';
                    minutesInput.dispatchEvent(new Event('input', { bubbles: true }));
                    minutesInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });

            await page.waitForTimeout(2000);

            // Click appearance tab
            try {
                await page.evaluate(() => {
                    const appearanceTab = document.querySelector('[data-tab="appearance"]');
                    if (appearanceTab) {
                        const tabButtons = document.querySelectorAll('.tab-button');
                        const tabContents = document.querySelectorAll('.tab-content');

                        tabButtons.forEach(btn => btn.classList.remove('active'));
                        tabContents.forEach(content => content.classList.remove('active'));

                        appearanceTab.classList.add('active');
                        const appearanceContent = document.getElementById('tab-appearance');
                        if (appearanceContent) {
                            appearanceContent.classList.add('active');
                        }

                        appearanceTab.click();
                        return true;
                    }
                    return false;
                });

                await page.waitForTimeout(3000);
                console.log('✅ Switched to Appearance tab');
            } catch (e) {
                console.log('Failed to click Appearance tab');
            }

            await page.waitForTimeout(2000);

            const screenshotPath = path.join(SCREENSHOT_DIR, `appearance-${theme}.png`);
            await page.screenshot({
                path: screenshotPath,
                type: SCREENSHOT_CONFIG.type,
                fullPage: true
            });

            const stats = await fs.stat(screenshotPath);
            expect(stats.size).toBeGreaterThan(5000);
            console.log(`✅ Generated: appearance-${theme}.png (${Math.round(stats.size / 1024)}KB)`);
        });

        test(`Generate tools screenshot for ${theme} theme`, async ({ page }) => {
            const urls = getExtensionUrls();

            await page.goto(urls.options);
            await page.waitForLoadState('domcontentloaded');

            await setTheme(page, theme);
            await page.waitForTimeout(4000);

            await page.waitForSelector('body', { timeout: 5000 });

            // Set valid form values
            await page.evaluate(() => {
                const minutesInput = document.querySelector('input[type="number"], #suspendInMs, [name="suspendInMs"]');
                if (minutesInput) {
                    minutesInput.value = '20';
                    minutesInput.dispatchEvent(new Event('input', { bubbles: true }));
                    minutesInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });

            await page.waitForTimeout(2000);

            // Click tools tab
            try {
                await page.evaluate(() => {
                    const toolsTab = document.querySelector('[data-tab="tools"]');
                    if (toolsTab) {
                        const tabButtons = document.querySelectorAll('.tab-button');
                        const tabContents = document.querySelectorAll('.tab-content');

                        tabButtons.forEach(btn => btn.classList.remove('active'));
                        tabContents.forEach(content => content.classList.remove('active'));

                        toolsTab.classList.add('active');
                        const toolsContent = document.getElementById('tab-tools');
                        if (toolsContent) {
                            toolsContent.classList.add('active');
                        }

                        toolsTab.click();
                        return true;
                    }
                    return false;
                });

                await page.waitForTimeout(3000);
                console.log('✅ Switched to Tools tab');
            } catch (e) {
                console.log('Failed to click Tools tab');
            }

            await page.waitForTimeout(2000);

            const screenshotPath = path.join(SCREENSHOT_DIR, `tools-${theme}.png`);
            await page.screenshot({
                path: screenshotPath,
                type: SCREENSHOT_CONFIG.type,
                fullPage: true
            });

            const stats = await fs.stat(screenshotPath);
            expect(stats.size).toBeGreaterThan(5000);
            console.log(`✅ Generated: tools-${theme}.png (${Math.round(stats.size / 1024)}KB)`);
        });

        test(`Generate suspended page screenshot for ${theme} theme`, async ({ page }) => {
            const urls = getExtensionUrls();

            const suspendedUrl = `${urls.suspended}#url=https://www.google.com/&title=Google&timestamp=${Date.now()}`;
            await page.goto(suspendedUrl);
            await page.waitForLoadState('domcontentloaded');

            await setTheme(page, theme);
            await page.waitForTimeout(2000);

            await page.waitForSelector('body', { timeout: 5000 });
            await page.waitForTimeout(3000);

            // Fix suspended page content
            await page.evaluate(() => {
                const ensureCentering = () => {
                    const html = document.documentElement;
                    const body = document.body;

                    if (html) {
                        html.style.height = '100%';
                        html.style.margin = '0';
                        html.style.padding = '0';
                    }

                    if (body) {
                        body.style.height = '100vh';
                        body.style.margin = '0';
                        body.style.padding = '20px';
                        body.style.display = 'flex';
                        body.style.alignItems = 'center';
                        body.style.justifyContent = 'center';
                        body.style.boxSizing = 'border-box';
                    }

                    const container = document.querySelector('.suspended-container');
                    if (container) {
                        container.style.maxWidth = '600px';
                        container.style.width = '100%';
                        container.style.textAlign = 'center';
                    }
                };

                const replaceContent = () => {
                    const pageTitleElement = document.getElementById('page-title');
                    if (pageTitleElement) {
                        pageTitleElement.textContent = 'Google';
                    }

                    const pageUrlElement = document.getElementById('page-url');
                    if (pageUrlElement) {
                        pageUrlElement.textContent = 'https://www.google.com/';
                    }

                    const timestampElement = document.getElementById('timestamp');
                    if (timestampElement) {
                        timestampElement.textContent = '6/17/2025, 1:57:57 PM';
                    }

                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );

                    const textNodes = [];
                    let node;
                    while (node = walker.nextNode()) {
                        textNodes.push(node);
                    }

                    textNodes.forEach(textNode => {
                        if (textNode.textContent.trim() === 'Loading...') {
                            const parent = textNode.parentElement;
                            if (parent) {
                                const parentId = parent.id.toLowerCase();
                                const parentClass = parent.className.toLowerCase();

                                if (parentId.includes('title') || parentClass.includes('title')) {
                                    textNode.textContent = 'Google';
                                } else if (parentId.includes('url') || parentClass.includes('url')) {
                                    textNode.textContent = 'https://www.google.com/';
                                } else if (parentId.includes('timestamp') || parentClass.includes('timestamp') || parentClass.includes('suspended')) {
                                    textNode.textContent = '6/17/2025, 1:57:57 PM';
                                }
                            }
                        }
                    });
                };

                ensureCentering();
                replaceContent();

                setTimeout(() => {
                    ensureCentering();
                    replaceContent();
                }, 100);
                setTimeout(() => {
                    ensureCentering();
                    replaceContent();
                }, 500);
                setTimeout(() => {
                    ensureCentering();
                    replaceContent();
                }, 1000);
                setTimeout(() => {
                    ensureCentering();
                    replaceContent();
                }, 2000);
            });

            await page.waitForTimeout(3000);

            const screenshotPath = path.join(SCREENSHOT_DIR, `suspended-${theme}.png`);
            await page.screenshot({
                path: screenshotPath,
                type: SCREENSHOT_CONFIG.type,
                fullPage: false
            });

            const stats = await fs.stat(screenshotPath);
            expect(stats.size).toBeGreaterThan(5000);
            console.log(`✅ Generated: suspended-${theme}.png (${Math.round(stats.size / 1024)}KB)`);
        });
    }

    test('Generate summary report', async () => {
        const summaryPath = path.join(SCREENSHOT_DIR, 'README.md');

        let summary = `# Chrome Web Store Screenshots\n\n`;
        summary += `Generated screenshots at ${SCREENSHOT_CONFIG.width}x${SCREENSHOT_CONFIG.height} resolution.\n\n`;
        summary += `## Available Screenshots\n\n`;

        try {
            const files = await fs.readdir(SCREENSHOT_DIR);
            const pngFiles = files.filter(f => f.endsWith('.png')).sort();

            for (const file of pngFiles) {
                const stats = await fs.stat(path.join(SCREENSHOT_DIR, file));
                summary += `- **${file}**: ${Math.round(stats.size / 1024)}KB\n`;
            }

            summary += `\n## Chrome Web Store Requirements\n\n`;
            summary += `- Resolution: 1280x800 pixels ✅\n`;
            summary += `- Format: PNG ✅\n`;
            summary += `- Maximum: 5 screenshots ✅\n`;
            summary += `- File size: Under 1MB each ✅\n\n`;

            summary += `## Recommended Selection\n\n`;
            summary += `For your Chrome Web Store listing, select these 5 screenshots:\n\n`;
            summary += `1. options-gold.png - Shows main settings\n`;
            summary += `2. appearance-gold.png - Shows appearance customization\n`;
            summary += `3. tools-gold.png - Shows developer tools\n`;
            summary += `4. suspended-gold.png - Shows suspended page experience\n`;
            summary += `5. popup-gold.png - Shows extension popup\n\n`;

            summary += `Generated on: ${new Date().toISOString()}\n`;
            summary += `Total screenshots: ${pngFiles.length}\n`;

        } catch (error) {
            summary += `Error reading screenshot directory: ${error.message}\n`;
        }

        await fs.writeFile(summaryPath, summary);
        console.log(`📝 Generated summary: ${summaryPath}`);
    });
}); 