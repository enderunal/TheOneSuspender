const { test, expect } = require('./config/node_modules/@playwright/test');

test.describe('Manual Favicon Tests', () => {
    // Quick manual tests for the remaining user-requested sites
    const quickTestSites = [
        'https://www.google.com/',
        'https://bandcamp.com/',
        'https://github.com/',
        'https://19.doramalive.news/',
        'https://doramy.club/',
        'https://editor.plantuml.com/'
    ];

    test('quick favicon discovery test', async ({ page }) => {
        console.log('\n🔍 Quick favicon discovery test for remaining sites...');

        for (const url of quickTestSites) {
            try {
                console.log(`\n🌐 Testing: ${url}`);

                // Quick navigation with short timeout
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
                await page.waitForTimeout(2000);

                // Get favicon
                const faviconData = await page.evaluate(() => {
                    const selectors = [
                        'link[rel="icon"]',
                        'link[rel="shortcut icon"]',
                        'link[rel="apple-touch-icon"]'
                    ];

                    let faviconUrl = null;
                    for (const selector of selectors) {
                        const link = document.querySelector(selector);
                        if (link && link.href) {
                            faviconUrl = link.href;
                            break;
                        }
                    }

                    if (!faviconUrl) {
                        faviconUrl = window.location.origin + '/favicon.ico';
                    }

                    return {
                        title: document.title,
                        faviconUrl
                    };
                });

                console.log(`   📎 Title: ${faviconData.title}`);
                console.log(`   🖼️  Favicon: ${faviconData.faviconUrl}`);

                // Test favicon accessibility
                try {
                    const faviconResponse = await page.request.get(faviconData.faviconUrl);
                    const accessible = faviconResponse.ok();
                    console.log(`   ✅ Accessible: ${accessible ? 'YES' : 'NO'} (${faviconResponse.status()})`);
                } catch (e) {
                    console.log(`   ❌ Accessible: NO (${e.message})`);
                }

            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
        }
    });
}); 