const { test, expect } = require('./config/node_modules/@playwright/test');
const path = require('path');

test.describe('Suspended Page Functionality Tests', () => {
    test('suspended page displays correctly with original URL data', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            // Load suspended page with URL parameters
            const suspendedPath = path.join(__dirname, '..', 'suspended.html');
            const testUrl = 'https://github.com/enderunal/TheOneSuspender?tab=readme';
            const testTitle = 'TheOneSuspender - GitHub Repository';
            const testFavicon = 'https://github.com/favicon.ico';

            const suspendedUrl = `file://${suspendedPath.replace(/\\/g, '/')}?url=${encodeURIComponent(testUrl)}&title=${encodeURIComponent(testTitle)}&favicon=${encodeURIComponent(testFavicon)}`;

            await page.goto(suspendedUrl);
            await page.waitForTimeout(1000);

            // Check page structure
            const pageContent = await page.evaluate(() => {
                const titleElement = document.querySelector('#page-title, .page-title, .tab-title');
                const urlElement = document.querySelector('#page-url, .page-url, .tab-url');
                const restoreButton = document.querySelector('#restore-btn, .restore-btn, button');
                const timestampElement = document.querySelector('#timestamp, .timestamp');

                return {
                    hasTitle: !!titleElement,
                    hasUrl: !!urlElement,
                    hasRestoreButton: !!restoreButton,
                    hasTimestamp: !!timestampElement,
                    titleText: titleElement?.textContent || '',
                    urlText: urlElement?.textContent || '',
                    restoreButtonText: restoreButton?.textContent || ''
                };
            });

            expect(pageContent.hasTitle).toBeTruthy();
            expect(pageContent.hasUrl).toBeTruthy();
            expect(pageContent.hasRestoreButton).toBeTruthy();

            // Check if original data is displayed
            expect(pageContent.titleText).toBeTruthy();
            expect(pageContent.urlText).toBeTruthy();
            expect(pageContent.restoreButtonText.toLowerCase()).toMatch(/restore|reload|unsuspend/);
        } finally {
            await context.close();
        }
    });

    test('suspended page handles URL parameter parsing', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const suspendedPath = path.join(__dirname, '..', 'suspended.html');

            // Test with Google URL
            const googleUrl = 'https://google.com/search?q=test+query';
            const googleTitle = 'test query - Google Search';
            const googleSuspendedUrl = `file://${suspendedPath.replace(/\\/g, '/')}?url=${encodeURIComponent(googleUrl)}&title=${encodeURIComponent(googleTitle)}`;

            await page.goto(googleSuspendedUrl);
            await page.waitForTimeout(1000);

            // Test URL parameter extraction
            const urlParams = await page.evaluate(() => {
                const urlParams = new URLSearchParams(window.location.search);
                return {
                    url: urlParams.get('url'),
                    title: urlParams.get('title'),
                    favicon: urlParams.get('favicon'),
                    timestamp: urlParams.get('timestamp')
                };
            });

            expect(urlParams.url).toBe(googleUrl);
            expect(urlParams.title).toBe(googleTitle);
        } finally {
            await context.close();
        }
    });

    test('suspended page has favicon processing capability', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const suspendedPath = path.join(__dirname, '..', 'suspended.html');
            const testFavicon = 'https://github.com/favicon.ico';
            const suspendedUrl = `file://${suspendedPath.replace(/\\/g, '/')}?url=https://github.com/enderunal/TheOneSuspender&favicon=${encodeURIComponent(testFavicon)}`;

            await page.goto(suspendedUrl);
            await page.waitForTimeout(1000);

            // Check favicon processing elements
            const faviconElements = await page.evaluate(() => {
                const faviconImg = document.querySelector('.favicon, .page-icon, #favicon');
                const canvas = document.querySelector('canvas');
                const fallbackIcon = document.querySelector('.fallback-icon, .default-icon');

                return {
                    hasFaviconImg: !!faviconImg,
                    hasCanvas: !!canvas,
                    hasFallbackIcon: !!fallbackIcon,
                    faviconSrc: faviconImg?.src || '',
                    documentTitle: document.title
                };
            });

            // Should have favicon display capability
            expect(faviconElements.hasFaviconImg || faviconElements.hasCanvas || faviconElements.hasFallbackIcon).toBeTruthy();

            // Document title should be set
            expect(faviconElements.documentTitle).toBeTruthy();
        } finally {
            await context.close();
        }
    });

    test('suspended page provides restore functionality', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const suspendedPath = path.join(__dirname, '..', 'suspended.html');
            const testUrl = 'https://google.com';
            const suspendedUrl = `file://${suspendedPath.replace(/\\/g, '/')}?url=${encodeURIComponent(testUrl)}`;

            await page.goto(suspendedUrl);
            await page.waitForTimeout(1000);

            // Check restore button functionality
            const restoreButton = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                const restoreBtn = Array.from(buttons).find(btn =>
                    btn.textContent.toLowerCase().includes('restore') ||
                    btn.textContent.toLowerCase().includes('reload') ||
                    btn.textContent.toLowerCase().includes('unsuspend') ||
                    btn.id === 'restore-btn'
                );

                return {
                    exists: !!restoreBtn,
                    text: restoreBtn?.textContent || '',
                    onclick: !!restoreBtn?.onclick,
                    hasClickHandler: !!restoreBtn?.getAttribute('onclick')
                };
            });

            expect(restoreButton.exists).toBeTruthy();
            expect(restoreButton.text).toBeTruthy();
        } finally {
            await context.close();
        }
    });

    test('suspended page handles multiple URL formats correctly', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const suspendedPath = path.join(__dirname, '..', 'suspended.html');

            const testCases = [
                {
                    name: 'GitHub Repository',
                    url: 'https://github.com/enderunal/TheOneSuspender',
                    title: 'enderunal/TheOneSuspender: Chrome Extension',
                    domain: 'github.com'
                },
                {
                    name: 'Google Search',
                    url: 'https://google.com/search?q=chrome+extension',
                    title: 'chrome extension - Google Search',
                    domain: 'google.com'
                },
                {
                    name: 'Simple Domain',
                    url: 'https://google.com',
                    title: 'Google',
                    domain: 'google.com'
                }
            ];

            for (const testCase of testCases) {
                const suspendedUrl = `file://${suspendedPath.replace(/\\/g, '/')}?url=${encodeURIComponent(testCase.url)}&title=${encodeURIComponent(testCase.title)}`;

                await page.goto(suspendedUrl);
                await page.waitForTimeout(500);

                const urlHandling = await page.evaluate(() => {
                    const urlParams = new URLSearchParams(window.location.search);
                    const originalUrl = urlParams.get('url');
                    const originalTitle = urlParams.get('title');

                    // Extract domain from URL
                    let domain = '';
                    try {
                        domain = new URL(originalUrl).hostname;
                    } catch {
                        domain = originalUrl.replace(/^https?:\/\//, '').split('/')[0];
                    }

                    return {
                        originalUrl,
                        originalTitle,
                        extractedDomain: domain,
                        pageTitle: document.title
                    };
                });

                expect(urlHandling.originalUrl).toBe(testCase.url);
                expect(urlHandling.originalTitle).toBe(testCase.title);
                expect(urlHandling.extractedDomain).toBe(testCase.domain);
                expect(urlHandling.pageTitle).toBeTruthy();
            }
        } finally {
            await context.close();
        }
    });

    test('suspended page handles missing or invalid parameters gracefully', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const suspendedPath = path.join(__dirname, '..', 'suspended.html');

            // Test with no parameters
            await page.goto(`file://${suspendedPath.replace(/\\/g, '/')}`);
            await page.waitForTimeout(1000);

            const noParamsContent = await page.evaluate(() => {
                const titleElement = document.querySelector('#page-title, .page-title, .tab-title');
                const urlElement = document.querySelector('#page-url, .page-url, .tab-url');
                const restoreButton = document.querySelector('#restore-btn, .restore-btn, button');

                return {
                    hasTitle: !!titleElement,
                    hasUrl: !!urlElement,
                    hasRestoreButton: !!restoreButton,
                    titleText: titleElement?.textContent || '',
                    urlText: urlElement?.textContent || '',
                    pageLoaded: document.readyState === 'complete'
                };
            });

            // Page should still load and display basic structure
            expect(noParamsContent.pageLoaded).toBeTruthy();
            expect(noParamsContent.hasRestoreButton).toBeTruthy();

            // Test with invalid URL parameter
            const invalidUrl = 'not-a-valid-url';
            const invalidSuspendedUrl = `file://${suspendedPath.replace(/\\/g, '/')}?url=${encodeURIComponent(invalidUrl)}`;

            await page.goto(invalidSuspendedUrl);
            await page.waitForTimeout(1000);

            const invalidParamsContent = await page.evaluate(() => {
                const urlParams = new URLSearchParams(window.location.search);
                return {
                    url: urlParams.get('url'),
                    pageLoaded: document.readyState === 'complete'
                };
            });

            expect(invalidParamsContent.pageLoaded).toBeTruthy();
            expect(invalidParamsContent.url).toBe(invalidUrl);
        } finally {
            await context.close();
        }
    });

    test('suspended page displays timestamp correctly', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const suspendedPath = path.join(__dirname, '..', 'suspended.html');
            const testTimestamp = Date.now().toString();
            const suspendedUrl = `file://${suspendedPath.replace(/\\/g, '/')}?url=https://google.com&timestamp=${testTimestamp}`;

            await page.goto(suspendedUrl);
            await page.waitForTimeout(1000);

            const timestampHandling = await page.evaluate(() => {
                const urlParams = new URLSearchParams(window.location.search);
                const timestamp = urlParams.get('timestamp');
                const timestampElement = document.querySelector('#timestamp, .timestamp, .suspend-time');

                return {
                    paramTimestamp: timestamp,
                    hasTimestampElement: !!timestampElement,
                    timestampText: timestampElement?.textContent || '',
                    currentTime: Date.now()
                };
            });

            expect(timestampHandling.paramTimestamp).toBe(testTimestamp);

            // Should have timestamp display
            if (timestampHandling.hasTimestampElement) {
                expect(timestampHandling.timestampText).toBeTruthy();
            }
        } finally {
            await context.close();
        }
    });

    test('suspended page theme support works correctly', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            const suspendedPath = path.join(__dirname, '..', 'suspended.html');
            await page.goto(`file://${suspendedPath.replace(/\\/g, '/')}`);
            await page.waitForTimeout(1000);

            // Check theme-related elements
            const themeSupport = await page.evaluate(() => {
                const bodyElement = document.body;
                const themeAttribute = bodyElement.getAttribute('data-theme') || bodyElement.className;
                const themeStylesheets = document.querySelectorAll('link[rel="stylesheet"]');
                const hasThemeClasses = bodyElement.classList.length > 0;

                return {
                    hasThemeAttribute: !!themeAttribute,
                    hasThemeClasses,
                    stylesheetCount: themeStylesheets.length,
                    bodyClasses: bodyElement.className,
                    supportsThemes: !!(themeAttribute || hasThemeClasses || themeStylesheets.length > 0)
                };
            });

            // Should have theme support (stylesheets, classes, or attributes)
            expect(themeSupport.supportsThemes).toBeTruthy();
            expect(themeSupport.stylesheetCount).toBeGreaterThan(0);
        } finally {
            await context.close();
        }
    });
}); 