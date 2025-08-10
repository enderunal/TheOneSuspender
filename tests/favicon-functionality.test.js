const { test, expect } = require('./config/node_modules/@playwright/test');

// Give this suite more time; it navigates to external sites
test.setTimeout(180000);

test.describe('Favicon Functionality Tests', () => {
    // Test websites with various favicon implementations - focusing on user's requested sites
    const testSites = [
        {
            name: 'Microsoft',
            url: 'https://www.microsoft.com/',
            description: 'Large corporate site with standard favicon',
            timeout: 25000
        },
        {
            name: 'Power Platform Community',
            url: 'https://community.powerplatform.com/',
            description: 'Microsoft community site',
            timeout: 25000
        },
        {
            name: 'TradingView Turkey',
            url: 'https://tr.tradingview.com/',
            description: 'Financial platform with branded favicon',
            timeout: 30000
        },
        {
            name: 'Google',
            url: 'https://www.google.com/',
            description: 'Major search engine with well-known favicon',
            timeout: 20000
        },
        {
            name: 'Bandcamp',
            url: 'https://bandcamp.com/',
            description: 'Music platform with distinctive favicon',
            timeout: 25000
        },
        {
            name: 'GitHub',
            url: 'https://github.com/',
            description: 'Developer platform with recognizable favicon',
            timeout: 20000
        },
        {
            name: 'Stack Overflow',
            url: 'https://stackoverflow.com/',
            description: 'Q&A site with custom favicon',
            timeout: 20000
        },
        {
            name: 'YouTube',
            url: 'https://www.youtube.com/',
            description: 'Video platform with branded favicon',
            timeout: 25000
        }
    ];

    test('should discover and process favicons from real websites', async ({ page }) => {
        console.log('\n🔍 Testing favicon discovery and processing from real websites...');
        console.log('This test verifies that our extension can successfully:');
        console.log('  - Discover original favicons from websites');
        console.log('  - Parse suspended URLs correctly');
        console.log('  - Process favicons with Canvas (grayscale + opacity)');
        console.log('  - Avoid falling back to generic icons');

        let successCount = 0;
        let totalTests = 0;
        const results = [];

        for (const site of testSites) {
            try {
                totalTests++;
                console.log(`\n🌐 Testing: ${site.name} (${site.url})`);

                // Navigate to the site with custom timeout
                try {
                    await page.goto(site.url, {
                        waitUntil: 'domcontentloaded',
                        timeout: site.timeout
                    });
                } catch (navError) {
                    console.log(`   ❌ Navigation failed: ${navError.message}`);
                    results.push({
                        site: site.name,
                        url: site.url,
                        error: `Navigation failed: ${navError.message}`,
                        urlParsing: false,
                        faviconParsing: false,
                        faviconAccessible: false,
                        faviconProcessing: false,
                        isGenericFavicon: true
                    });
                    continue;
                }

                // Wait for page to load
                await page.waitForTimeout(3000);

                // Get the page title and favicon
                const pageData = await page.evaluate(() => {
                    // Get page title
                    const title = document.title;

                    // Try multiple methods to get favicon
                    const selectors = [
                        'link[rel="icon"]',
                        'link[rel="shortcut icon"]',
                        'link[rel="apple-touch-icon"]',
                        'link[rel="apple-touch-icon-precomposed"]'
                    ];

                    let faviconUrl = null;
                    for (const selector of selectors) {
                        const link = document.querySelector(selector);
                        if (link && link.href) {
                            faviconUrl = link.href;
                            break;
                        }
                    }

                    // Fallback to default favicon path
                    if (!faviconUrl) {
                        faviconUrl = window.location.origin + '/favicon.ico';
                    }

                    return {
                        title,
                        faviconUrl,
                        origin: window.location.origin
                    };
                });

                console.log(`   📎 Title: ${pageData.title}`);
                console.log(`   🖼️  Favicon URL: ${pageData.faviconUrl}`);

                // Test favicon accessibility
                let faviconAccessible = false;
                let faviconContentType = '';
                let faviconStatus = 0;
                try {
                    const faviconResponse = await page.request.get(pageData.faviconUrl);
                    faviconAccessible = faviconResponse.ok();
                    faviconStatus = faviconResponse.status();
                    faviconContentType = faviconResponse.headers()['content-type'] || '';
                    console.log(`   ✅ Favicon accessible: ${faviconAccessible ? 'YES' : 'NO'} (${faviconStatus})`);
                    console.log(`   📄 Content-Type: ${faviconContentType}`);
                } catch (e) {
                    console.log(`   ❌ Favicon accessible: NO (${e.message})`);
                }

                // Test URL building (simulate our extension's URL building)
                const mockSuspendedUrl = `chrome-extension://test-extension-id/suspended.html#title=${encodeURIComponent(pageData.title)}&timestamp=${Date.now()}&favicon=${pageData.faviconUrl}&url=${site.url}`;

                // Test URL parsing (our actual implementation)
                const parsedData = await page.evaluate((suspendedUrl) => {
                    // This matches our actual getOriginalDataFromUrl implementation
                    const getOriginalDataFromUrl = (suspendedUrl) => {
                        try {
                            const hash = suspendedUrl.split('#')[1] || '';

                            // Extract URL from the end since it's unencoded and may contain & characters
                            const urlMatch = hash.match(/&url=(.+)$/);
                            if (urlMatch) {
                                const url = urlMatch[1];
                                if (url && /^https?:\/\//.test(url)) {
                                    return { url };
                                }
                            }

                            // fallback to query string for backward compatibility
                            const urlObj = new URL(suspendedUrl);
                            const qUrl = urlObj.searchParams.get('url');
                            if (qUrl && /^https?:\/\//.test(qUrl)) return { url: qUrl };
                            return null;
                        } catch (e) {
                            return null;
                        }
                    };

                    // Extract favicon from hash
                    const extractFavicon = (suspendedUrl) => {
                        try {
                            const hash = suspendedUrl.split('#')[1] || '';
                            const params = new URLSearchParams(hash.replace(/&url=.+$/, ''));
                            return params.get('favicon');
                        } catch (e) {
                            return null;
                        }
                    };

                    return {
                        originalUrl: getOriginalDataFromUrl(suspendedUrl),
                        faviconUrl: extractFavicon(suspendedUrl)
                    };
                }, mockSuspendedUrl);

                // Verify URL and favicon parsing
                const urlParsingSuccess = parsedData.originalUrl && parsedData.originalUrl.url === site.url;
                const faviconParsingSuccess = parsedData.faviconUrl === pageData.faviconUrl;

                console.log(`   🔧 URL parsing: ${urlParsingSuccess ? 'SUCCESS' : 'FAILED'}`);
                console.log(`   🔧 Favicon parsing: ${faviconParsingSuccess ? 'SUCCESS' : 'FAILED'}`);

                // Test favicon processing (simulate our Canvas processing)
                let faviconProcessingResult = null;
                if (faviconAccessible && faviconContentType.includes('image')) {
                    faviconProcessingResult = await page.evaluate(async (faviconUrl) => {
                        try {
                            return new Promise((resolve) => {
                                const img = new Image();
                                img.crossOrigin = 'anonymous';

                                img.onload = () => {
                                    try {
                                        const canvas = document.createElement('canvas');
                                        const ctx = canvas.getContext('2d');
                                        canvas.width = img.width;
                                        canvas.height = img.height;

                                        // Draw image
                                        ctx.drawImage(img, 0, 0);

                                        // Apply our grayscale + opacity filter (60% grayscale, 50% opacity)
                                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                        const data = imageData.data;

                                        for (let i = 0; i < data.length; i += 4) {
                                            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                                            data[i] = gray * 0.6;     // R with 60% grayscale
                                            data[i + 1] = gray * 0.6; // G with 60% grayscale  
                                            data[i + 2] = gray * 0.6; // B with 60% grayscale
                                            data[i + 3] = data[i + 3] * 0.5; // 50% opacity
                                        }

                                        ctx.putImageData(imageData, 0, 0);
                                        const processedDataUrl = canvas.toDataURL();

                                        resolve({
                                            success: true,
                                            processedUrl: processedDataUrl,
                                            originalSize: { width: img.width, height: img.height }
                                        });
                                    } catch (e) {
                                        resolve({ success: false, error: e.message });
                                    }
                                };

                                img.onerror = () => {
                                    resolve({ success: false, error: 'Image load failed - likely CORS issue' });
                                };

                                img.src = faviconUrl;

                                // Timeout after 8 seconds
                                setTimeout(() => {
                                    resolve({ success: false, error: 'Processing timeout' });
                                }, 8000);
                            });
                        } catch (e) {
                            return { success: false, error: e.message };
                        }
                    }, pageData.faviconUrl);
                }

                const faviconProcessingSuccess = faviconProcessingResult?.success || false;
                console.log(`   🎨 Favicon processing: ${faviconProcessingSuccess ? 'SUCCESS' : 'FAILED'}`);
                if (faviconProcessingResult?.success) {
                    console.log(`   📏 Original size: ${faviconProcessingResult.originalSize.width}x${faviconProcessingResult.originalSize.height}`);
                } else if (faviconProcessingResult?.error) {
                    console.log(`   ❌ Processing error: ${faviconProcessingResult.error}`);
                }

                // Determine if this is a generic/fallback favicon
                const isGenericFavicon =
                    pageData.faviconUrl.endsWith('/favicon.ico') ||
                    pageData.faviconUrl.includes('data:image/svg+xml') ||
                    !faviconAccessible;

                console.log(`   🔍 Is generic favicon: ${isGenericFavicon ? 'YES' : 'NO'}`);

                // Determine quality score
                let qualityScore = 0;
                if (urlParsingSuccess) qualityScore += 25;
                if (faviconParsingSuccess) qualityScore += 25;
                if (faviconAccessible) qualityScore += 25;
                if (faviconProcessingSuccess) qualityScore += 25;

                console.log(`   📊 Quality score: ${qualityScore}/100`);

                const testResult = {
                    site: site.name,
                    url: site.url,
                    title: pageData.title,
                    faviconUrl: pageData.faviconUrl,
                    faviconAccessible,
                    faviconStatus,
                    faviconContentType,
                    urlParsing: urlParsingSuccess,
                    faviconParsing: faviconParsingSuccess,
                    faviconProcessing: faviconProcessingSuccess,
                    isGenericFavicon,
                    qualityScore,
                    processingError: faviconProcessingResult?.error
                };

                results.push(testResult);

                // Count as success if URL parsing, favicon parsing work and favicon is accessible
                if (urlParsingSuccess && faviconParsingSuccess && faviconAccessible) {
                    successCount++;
                    console.log(`   ✅ OVERALL: SUCCESS for ${site.name}`);
                } else {
                    console.log(`   ❌ OVERALL: FAILED for ${site.name}`);
                }

            } catch (error) {
                console.log(`   ❌ ERROR testing ${site.name}: ${error.message}`);
                results.push({
                    site: site.name,
                    url: site.url,
                    error: error.message,
                    urlParsing: false,
                    faviconParsing: false,
                    faviconAccessible: false,
                    faviconProcessing: false,
                    isGenericFavicon: true,
                    qualityScore: 0
                });
            }

            // Small delay between tests
            await page.waitForTimeout(1000);
        }

        // Print summary
        console.log(`\n📊 FAVICON TEST SUMMARY:`);
        console.log(`   Total sites tested: ${totalTests}`);
        console.log(`   Successful: ${successCount}`);
        console.log(`   Failed: ${totalTests - successCount}`);
        console.log(`   Success rate: ${((successCount / totalTests) * 100).toFixed(1)}%`);

        // Print detailed results
        console.log(`\n📋 DETAILED RESULTS:`);
        results.forEach((result, index) => {
            console.log(`\n${index + 1}. ${result.site}:`);
            console.log(`   URL: ${result.url}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            } else {
                console.log(`   Title: ${result.title}`);
                console.log(`   Favicon URL: ${result.faviconUrl}`);
                console.log(`   URL Parsing: ${result.urlParsing ? '✅' : '❌'}`);
                console.log(`   Favicon Parsing: ${result.faviconParsing ? '✅' : '❌'}`);
                console.log(`   Favicon Accessible: ${result.faviconAccessible ? '✅' : '❌'} (${result.faviconStatus})`);
                console.log(`   Favicon Processing: ${result.faviconProcessing ? '✅' : '❌'}`);
                console.log(`   Is Generic Favicon: ${result.isGenericFavicon ? '⚠️' : '✅'}`);
                console.log(`   Quality Score: ${result.qualityScore}/100`);
                console.log(`   Content-Type: ${result.faviconContentType}`);
                if (result.processingError) {
                    console.log(`   Processing Error: ${result.processingError}`);
                }
            }
        });

        // Analyze results
        const accessibleFavicons = results.filter(r => r.faviconAccessible).length;
        const processableFavicons = results.filter(r => r.faviconProcessing).length;
        const nonGenericFavicons = results.filter(r => !r.isGenericFavicon).length;
        const highQualityResults = results.filter(r => r.qualityScore >= 75).length;
        const urlParsingCount = results.filter(r => r.urlParsing).length;
        const faviconParsingCount = results.filter(r => r.faviconParsing).length;

        console.log(`\n🔍 ANALYSIS:`);
        console.log(`   Accessible favicons: ${accessibleFavicons}/${totalTests} (${((accessibleFavicons / totalTests) * 100).toFixed(1)}%)`);
        console.log(`   Processable favicons: ${processableFavicons}/${totalTests} (${((processableFavicons / totalTests) * 100).toFixed(1)}%)`);
        console.log(`   Non-generic favicons: ${nonGenericFavicons}/${totalTests} (${((nonGenericFavicons / totalTests) * 100).toFixed(1)}%)`);
        console.log(`   URL parsing successes: ${urlParsingCount}/${totalTests}`);
        console.log(`   Favicon parsing successes: ${faviconParsingCount}/${totalTests}`);
        console.log(`   High quality results (75+): ${highQualityResults}/${totalTests} (${((highQualityResults / totalTests) * 100).toFixed(1)}%)`);

        // Success criteria for favicon functionality (use thresholds to avoid flakes)
        console.log(`\n✅ SUCCESS CRITERIA:`);
        console.log(`   - URL parsing >= 60%: ${(urlParsingCount / totalTests) >= 0.6 ? 'PASS' : 'FAIL'}`);
        console.log(`   - Favicon parsing >= 60%: ${(faviconParsingCount / totalTests) >= 0.6 ? 'PASS' : 'FAIL'}`);
        console.log(`   - At least 70% favicons accessible: ${(accessibleFavicons / totalTests) >= 0.7 ? 'PASS' : 'FAIL'}`);
        console.log(`   - At least 50% favicons processable: ${(processableFavicons / totalTests) >= 0.5 ? 'PASS' : 'FAIL'}`);
        console.log(`   - At least 60% non-generic favicons: ${(nonGenericFavicons / totalTests) >= 0.6 ? 'PASS' : 'FAIL'}`);

        // Test assertions (threshold-based to be robust on CI networks)
        expect(totalTests).toBeGreaterThan(0);
        expect(urlParsingCount / totalTests).toBeGreaterThanOrEqual(0.6);
        expect(faviconParsingCount / totalTests).toBeGreaterThanOrEqual(0.6);
        expect(accessibleFavicons / totalTests).toBeGreaterThan(0.7);
        expect(processableFavicons / totalTests).toBeGreaterThan(0.5);
        expect(nonGenericFavicons / totalTests).toBeGreaterThan(0.6);
    });

    test('should handle favicon processing edge cases', async ({ page }) => {
        console.log('\n🔬 Testing favicon processing edge cases...');

        // Test various favicon scenarios
        const edgeCases = [
            {
                name: 'SVG Favicon',
                faviconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="blue"/></svg>',
                shouldProcess: true,
                expectedError: null
            },
            {
                name: 'Data URL PNG Favicon',
                faviconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                shouldProcess: true,
                expectedError: null
            },
            {
                name: 'Invalid Favicon URL',
                faviconUrl: 'https://invalid-domain-that-does-not-exist.com/favicon.ico',
                shouldProcess: false,
                expectedError: 'Image load failed'
            },
            {
                name: 'Empty Data URL',
                faviconUrl: 'data:,',
                shouldProcess: false,
                expectedError: 'Image load failed'
            }
        ];

        for (const testCase of edgeCases) {
            console.log(`\n   Testing: ${testCase.name}`);

            const result = await page.evaluate(async (faviconUrl) => {
                try {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';

                        img.onload = () => {
                            try {
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                canvas.width = Math.max(img.width, 16);
                                canvas.height = Math.max(img.height, 16);

                                ctx.drawImage(img, 0, 0);

                                // Apply processing
                                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                const data = imageData.data;

                                for (let i = 0; i < data.length; i += 4) {
                                    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                                    data[i] = gray * 0.6;
                                    data[i + 1] = gray * 0.6;
                                    data[i + 2] = gray * 0.6;
                                    data[i + 3] = data[i + 3] * 0.5;
                                }

                                ctx.putImageData(imageData, 0, 0);
                                resolve({ success: true, size: { width: canvas.width, height: canvas.height } });
                            } catch (e) {
                                resolve({ success: false, error: e.message });
                            }
                        };

                        img.onerror = () => {
                            resolve({ success: false, error: 'Image load failed' });
                        };

                        img.src = faviconUrl;

                        setTimeout(() => {
                            resolve({ success: false, error: 'Timeout' });
                        }, 3000);
                    });
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }, testCase.faviconUrl);

            console.log(`   Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
            if (result.size) {
                console.log(`   Processed size: ${result.size.width}x${result.size.height}`);
            }

            // Verify expectation
            if (testCase.shouldProcess) {
                expect(result.success).toBe(true);
            } else {
                // For cases that should fail, we expect graceful failure (no crash)
                expect(result.success).toBe(false);
                if (testCase.expectedError) {
                    expect(result.error).toContain(testCase.expectedError);
                }
            }
        }
    });
}); 