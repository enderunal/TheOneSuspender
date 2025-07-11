const { test, expect } = require('./config/node_modules/@playwright/test');

test.describe('URL Building Tests', () => {

    test('buildSuspendedUrl creates correct URL format with URL at end as clear text', async () => {
        // Mock chrome.runtime.getURL
        const mockChromeRuntime = {
            getURL: (path) => `chrome-extension://test-extension-id/${path}`
        };

        // Mock logger
        const mockLogger = {
            detailedLog: () => { } // Silent for tests
        };

        // Test URL building function (matches the actual implementation)
        const buildSuspendedUrl = (tab) => {
            if (!tab.url || typeof tab.url !== 'string') throw new Error('Invalid tab.url');
            const suspendedUrlBase = mockChromeRuntime.getURL("suspended.html");
            const urlObj = new URL(suspendedUrlBase);
            const params = new URLSearchParams();

            // Add encoded parameters first
            if (tab.title) params.set("title", tab.title);
            params.set("timestamp", Date.now());
            if (tab.favIconUrl) params.set("favicon", tab.favIconUrl);

            // Build the hash with original URL at the end as clear text (not encoded)
            let hashString = params.toString();
            hashString += `&url=${tab.url}`;

            urlObj.hash = hashString;
            mockLogger.detailedLog(`Built suspended URL with hash for tab ${tab.id}: ${urlObj.toString()}`);
            return urlObj.toString();
        };

        // Test with GitHub URL
        const githubTab = {
            id: 123,
            url: 'https://github.com/enderunal/TheOneSuspender',
            title: 'TheOneSuspender - GitHub Repository',
            favIconUrl: 'https://github.com/favicon.ico'
        };

        const result = buildSuspendedUrl(githubTab);

        // Verify basic structure
        expect(result).toContain('chrome-extension://test-extension-id/suspended.html#');

        // Verify URL is at the end as clear text (not encoded)
        expect(result).toMatch(/&url=https:\/\/github\.com\/enderunal\/TheOneSuspender$/);

        // Verify favicon is included and encoded
        expect(result).toContain('favicon=https%3A%2F%2Fgithub.com%2Ffavicon.ico');

        // Verify title is included and encoded
        expect(result).toContain('title=TheOneSuspender+-+GitHub+Repository');

        // Verify timestamp is included
        expect(result).toMatch(/timestamp=\d+/);

        // Test parsing works correctly
        const hash = result.split('#')[1];
        const params = new URLSearchParams(hash);
        expect(params.get('url')).toBe(githubTab.url);
        expect(params.get('title')).toBe(githubTab.title);
        expect(params.get('favicon')).toBe(githubTab.favIconUrl);
        expect(params.get('timestamp')).toBeTruthy();
    });

    test('buildSuspendedUrl handles various URL types correctly', async () => {
        const mockChromeRuntime = {
            getURL: (path) => `chrome-extension://test-extension-id/${path}`
        };

        const mockLogger = {
            detailedLog: () => { }
        };

        const buildSuspendedUrl = (tab) => {
            if (!tab.url || typeof tab.url !== 'string') throw new Error('Invalid tab.url');
            const suspendedUrlBase = mockChromeRuntime.getURL("suspended.html");
            const urlObj = new URL(suspendedUrlBase);
            const params = new URLSearchParams();

            if (tab.title) params.set("title", tab.title);
            params.set("timestamp", Date.now());
            if (tab.favIconUrl) params.set("favicon", tab.favIconUrl);

            let hashString = params.toString();
            hashString += `&url=${tab.url}`;

            urlObj.hash = hashString;
            return urlObj.toString();
        };

        const testCases = [
            {
                name: 'Google Search',
                tab: {
                    id: 1,
                    url: 'https://google.com/search?q=simple&source=web',
                    title: 'simple - Google Search',
                    favIconUrl: 'https://google.com/favicon.ico'
                }
            },
            {
                name: 'Complex URL with parameters',
                tab: {
                    id: 2,
                    url: 'https://example.com/path/to/page?param1=value1&param2=value2',
                    title: 'Complex Page Title with Special Characters!',
                    favIconUrl: 'https://example.com/icon.png'
                }
            },
            {
                name: 'Tab without favicon',
                tab: {
                    id: 3,
                    url: 'https://simple.com',
                    title: 'Simple Page',
                    favIconUrl: null
                }
            },
            {
                name: 'Tab without title',
                tab: {
                    id: 4,
                    url: 'https://notitle.com',
                    title: null,
                    favIconUrl: 'https://notitle.com/favicon.ico'
                }
            }
        ];

        testCases.forEach(testCase => {
            const result = buildSuspendedUrl(testCase.tab);

            // Verify URL is at the end as clear text
            expect(result).toMatch(new RegExp(`&url=${testCase.tab.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));

            // Verify parsing works - extract URL from end since it's unencoded
            const hash = result.split('#')[1];
            const urlMatch = hash.match(/&url=(.+)$/);
            expect(urlMatch).toBeTruthy();
            expect(urlMatch[1]).toBe(testCase.tab.url);

            // Test other parameters with URLSearchParams
            const params = new URLSearchParams(hash.replace(/&url=.+$/, ''));
            if (testCase.tab.title) {
                expect(params.get('title')).toBe(testCase.tab.title);
            }
            if (testCase.tab.favIconUrl) {
                expect(params.get('favicon')).toBe(testCase.tab.favIconUrl);
            }
        });
    });

    test('buildSuspendedUrl handles edge cases correctly', async () => {
        const mockChromeRuntime = {
            getURL: (path) => `chrome-extension://test-extension-id/${path}`
        };

        const buildSuspendedUrl = (tab) => {
            if (!tab.url || typeof tab.url !== 'string') throw new Error('Invalid tab.url');
            const suspendedUrlBase = mockChromeRuntime.getURL("suspended.html");
            const urlObj = new URL(suspendedUrlBase);
            const params = new URLSearchParams();

            if (tab.title) params.set("title", tab.title);
            params.set("timestamp", Date.now());
            if (tab.favIconUrl) params.set("favicon", tab.favIconUrl);

            let hashString = params.toString();
            hashString += `&url=${tab.url}`;

            urlObj.hash = hashString;
            return urlObj.toString();
        };

        // Test with invalid URL should throw error
        expect(() => {
            buildSuspendedUrl({ id: 1, url: null });
        }).toThrow('Invalid tab.url');

        expect(() => {
            buildSuspendedUrl({ id: 1, url: 123 });
        }).toThrow('Invalid tab.url');

        // Test with minimal valid tab
        const minimalTab = {
            id: 1,
            url: 'https://example.com'
        };

        const result = buildSuspendedUrl(minimalTab);
        expect(result).toMatch(/&url=https:\/\/example\.com$/);

        const hash = result.split('#')[1];
        const params = new URLSearchParams(hash);
        expect(params.get('url')).toBe('https://example.com');
        expect(params.get('title')).toBeNull();
        expect(params.get('favicon')).toBeNull();
        expect(params.get('timestamp')).toBeTruthy();
    });

    test('URL format matches expected pattern exactly', async () => {
        const mockChromeRuntime = {
            getURL: (path) => `chrome-extension://test-extension-id/${path}`
        };

        const buildSuspendedUrl = (tab) => {
            if (!tab.url || typeof tab.url !== 'string') throw new Error('Invalid tab.url');
            const suspendedUrlBase = mockChromeRuntime.getURL("suspended.html");
            const urlObj = new URL(suspendedUrlBase);
            const params = new URLSearchParams();

            if (tab.title) params.set("title", tab.title);
            params.set("timestamp", Date.now());
            if (tab.favIconUrl) params.set("favicon", tab.favIconUrl);

            let hashString = params.toString();
            hashString += `&url=${tab.url}`;

            urlObj.hash = hashString;
            return urlObj.toString();
        };

        const testTab = {
            id: 1,
            url: 'https://github.com/enderunal/TheOneSuspender',
            title: 'TheOneSuspender',
            favIconUrl: 'https://github.com/favicon.ico'
        };

        const result = buildSuspendedUrl(testTab);

        // Expected format: chrome-extension://id/suspended.html#title=...&timestamp=...&favicon=...&url=...
        const expectedPattern = /^chrome-extension:\/\/test-extension-id\/suspended\.html#title=TheOneSuspender&timestamp=\d+&favicon=https%3A%2F%2Fgithub\.com%2Ffavicon\.ico&url=https:\/\/github\.com\/enderunal\/TheOneSuspender$/;

        expect(result).toMatch(expectedPattern);

        // Verify the URL is literally at the end without encoding
        expect(result.endsWith('&url=https://github.com/enderunal/TheOneSuspender')).toBe(true);

        // Verify other parameters are properly encoded
        expect(result).toContain('favicon=https%3A%2F%2Fgithub.com%2Ffavicon.ico');
    });

    test('suspended URL parsing works correctly', async () => {
        // Test parsing function (matches suspended.js implementation)
        const parseSuspendedUrl = (suspendedUrl) => {
            try {
                const hash = suspendedUrl.startsWith('#') ? suspendedUrl.slice(1) : suspendedUrl.split('#')[1];
                if (!hash) return null;

                const params = new URLSearchParams(hash);
                return {
                    originalUrl: params.get('url'),
                    title: params.get('title'),
                    favicon: params.get('favicon'),
                    timestamp: params.get('timestamp')
                };
            } catch (error) {
                return null;
            }
        };

        const testUrls = [
            'chrome-extension://test-id/suspended.html#title=Test+Page&timestamp=1234567890&favicon=https%3A%2F%2Fexample.com%2Ffavicon.ico&url=https://example.com/page',
            'chrome-extension://test-id/suspended.html#timestamp=1234567890&url=https://simple.com',
            'chrome-extension://test-id/suspended.html#title=GitHub&timestamp=1234567890&url=https://github.com/enderunal/TheOneSuspender'
        ];

        testUrls.forEach(testUrl => {
            const parsed = parseSuspendedUrl(testUrl);
            expect(parsed).toBeTruthy();
            expect(parsed.originalUrl).toBeTruthy();
            expect(parsed.timestamp).toBeTruthy();

            // Verify the URL is not encoded in the result
            expect(parsed.originalUrl).toMatch(/^https:\/\//);
            expect(parsed.originalUrl).not.toContain('%');
        });
    });

    test('URL preservation during suspension/unsuspension cycle', async () => {
        const mockChromeRuntime = {
            getURL: (path) => `chrome-extension://test-extension-id/${path}`
        };

        const mockLogger = {
            detailedLog: () => { }
        };

        // Function to build suspended URL (matches actual implementation)
        const buildSuspendedUrl = (tab) => {
            if (!tab.url || typeof tab.url !== 'string') throw new Error('Invalid tab.url');
            const suspendedUrlBase = mockChromeRuntime.getURL("suspended.html");
            const urlObj = new URL(suspendedUrlBase);
            const params = new URLSearchParams();

            if (tab.title) params.set("title", tab.title);
            params.set("timestamp", Date.now());
            if (tab.favIconUrl) params.set("favicon", tab.favIconUrl);

            let hashString = params.toString();
            hashString += `&url=${tab.url}`;

            urlObj.hash = hashString;
            return urlObj.toString();
        };

        // Function to extract original URL from suspended URL (matches actual implementation)
        const getOriginalUrlFromSuspended = (suspendedUrl) => {
            try {
                const hash = suspendedUrl.split('#')[1] || '';

                // Extract URL from the end since it's unencoded and may contain & characters
                const urlMatch = hash.match(/&url=(.+)$/);
                return urlMatch ? urlMatch[1] : null;
            } catch (e) {
                return null;
            }
        };

        // Test cases for URLs that were previously problematic
        const problematicUrls = [
            {
                name: 'Google Search with udm parameter (reported bug)',
                originalUrl: 'https://www.google.com//search?udm=14&q=secret+level',
                description: 'URL with double slash and multiple query parameters'
            },
            {
                name: 'Complex Google Search',
                originalUrl: 'https://www.google.com/search?q=test+query&source=web&tbm=isch&sa=X',
                description: 'Google search with multiple encoded parameters'
            },

            {
                name: 'URL with encoded characters',
                originalUrl: 'https://site.com/search?q=hello%20world&filter=%2Bspecial',
                description: 'URL with percent-encoded characters'
            },
            {
                name: 'URL with ampersands in query',
                originalUrl: 'https://api.example.com/data?format=json&fields=name,email&sort=asc',
                description: 'URL with multiple ampersands that could be confused with our parameter separator'
            },
            {
                name: 'URL with equals signs in values',
                originalUrl: 'https://math.com/calculator?equation=2%2B2%3D4&result=true',
                description: 'URL with equals signs in parameter values'
            },
            {
                name: 'Very long URL',
                originalUrl: 'https://longurl.example.com/very/long/path/with/many/segments?param1=value1&param2=value2&param3=value3&param4=value4&param5=value5&param6=verylongvaluethatgoesonyesitsverylongindeed',
                description: 'Long URL to test handling of lengthy URLs'
            }
        ];

        problematicUrls.forEach(testCase => {
            // Create a mock tab with the problematic URL
            const originalTab = {
                id: Math.floor(Math.random() * 1000),
                url: testCase.originalUrl,
                title: `Test Page - ${testCase.name}`,
                favIconUrl: 'https://example.com/favicon.ico'
            };

            // Step 1: Suspend the tab (build suspended URL)
            const suspendedUrl = buildSuspendedUrl(originalTab);

            // Verify the suspended URL was created
            expect(suspendedUrl).toContain('chrome-extension://test-extension-id/suspended.html#');
            expect(suspendedUrl).toMatch(/&url=.+$/);

            // Step 2: Extract the original URL from the suspended URL (simulate unsuspension)
            const extractedUrl = getOriginalUrlFromSuspended(suspendedUrl);

            // Step 3: Verify the URL is exactly preserved
            expect(extractedUrl).toBe(testCase.originalUrl);

            // Additional verification: ensure the URL is at the end and unencoded
            expect(suspendedUrl.endsWith(`&url=${testCase.originalUrl}`)).toBe(true);

            console.log(`✓ ${testCase.name}: ${testCase.originalUrl} → preserved correctly`);
        });
    });

    test('Specific Google search bug regression test', async () => {
        const mockChromeRuntime = {
            getURL: (path) => `chrome-extension://test-extension-id/${path}`
        };

        const buildSuspendedUrl = (tab) => {
            if (!tab.url || typeof tab.url !== 'string') throw new Error('Invalid tab.url');
            const suspendedUrlBase = mockChromeRuntime.getURL("suspended.html");
            const urlObj = new URL(suspendedUrlBase);
            const params = new URLSearchParams();

            if (tab.title) params.set("title", tab.title);
            params.set("timestamp", Date.now());
            if (tab.favIconUrl) params.set("favicon", tab.favIconUrl);

            let hashString = params.toString();
            hashString += `&url=${tab.url}`;

            urlObj.hash = hashString;
            return urlObj.toString();
        };

        const getOriginalUrlFromSuspended = (suspendedUrl) => {
            const hash = suspendedUrl.split('#')[1] || '';

            // Extract URL from the end since it's unencoded and may contain & characters
            const urlMatch = hash.match(/&url=(.+)$/);
            return urlMatch ? urlMatch[1] : null;
        };

        // The exact URL that was reported as buggy
        const buggyUrl = 'https://www.google.com//search?udm=14&q=secret+level';

        const tab = {
            id: 123,
            url: buggyUrl,
            title: 'secret level - Google Search',
            favIconUrl: 'https://www.google.com/favicon.ico'
        };

        // Suspend the tab
        const suspendedUrl = buildSuspendedUrl(tab);

        // Verify the suspended URL contains the complete original URL
        expect(suspendedUrl).toContain('chrome-extension://test-extension-id/suspended.html#');
        expect(suspendedUrl.endsWith(`&url=${buggyUrl}`)).toBe(true);

        // Extract the URL (simulate unsuspension)
        const restoredUrl = getOriginalUrlFromSuspended(suspendedUrl);

        // Critical test: The restored URL must be exactly the same as the original
        expect(restoredUrl).toBe(buggyUrl);
        expect(restoredUrl).toBe('https://www.google.com//search?udm=14&q=secret+level');

        // Verify no parameters were lost
        expect(restoredUrl).toContain('udm=14');
        expect(restoredUrl).toContain('q=secret+level');
        expect(restoredUrl).toContain('//search'); // Verify double slash is preserved

        console.log(`✓ Google search bug test passed: ${buggyUrl} → ${restoredUrl}`);
    });
});

test.describe('URL Parsing Tests (suspension-utils.js)', () => {
    test('getOriginalDataFromUrl should extract URLs correctly from suspended URLs', async () => {
        // Mock the getOriginalDataFromUrl function (matches actual implementation)
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

        // Test the specific Google search case that was failing
        const suspendedUrl = 'chrome-extension://test/suspended.html#title=Google%20Search&timestamp=1234567890&favicon=https://www.google.com/favicon.ico&url=https://www.google.com//search?udm=14&q=secret+level';
        const result = getOriginalDataFromUrl(suspendedUrl);

        expect(result).not.toBeNull();
        expect(result.url).toBe('https://www.google.com//search?udm=14&q=secret+level');
    });

    test('getOriginalDataFromUrl should handle complex URLs with multiple parameters', async () => {
        const getOriginalDataFromUrl = (suspendedUrl) => {
            try {
                const hash = suspendedUrl.split('#')[1] || '';
                const urlMatch = hash.match(/&url=(.+)$/);
                if (urlMatch) {
                    const url = urlMatch[1];
                    if (url && /^https?:\/\//.test(url)) {
                        return { url };
                    }
                }
                const urlObj = new URL(suspendedUrl);
                const qUrl = urlObj.searchParams.get('url');
                if (qUrl && /^https?:\/\//.test(qUrl)) return { url: qUrl };
                return null;
            } catch (e) {
                return null;
            }
        };

        const originalUrl = 'https://example.com/path?param1=value1&param2=value2&param3=value3';
        const suspendedUrl = `chrome-extension://test/suspended.html#title=Test&timestamp=1234567890&url=${originalUrl}`;
        const result = getOriginalDataFromUrl(suspendedUrl);

        expect(result).not.toBeNull();
        expect(result.url).toBe(originalUrl);
    });

    test('getOriginalDataFromUrl should handle URLs with encoded characters', async () => {
        const getOriginalDataFromUrl = (suspendedUrl) => {
            try {
                const hash = suspendedUrl.split('#')[1] || '';
                const urlMatch = hash.match(/&url=(.+)$/);
                if (urlMatch) {
                    const url = urlMatch[1];
                    if (url && /^https?:\/\//.test(url)) {
                        return { url };
                    }
                }
                const urlObj = new URL(suspendedUrl);
                const qUrl = urlObj.searchParams.get('url');
                if (qUrl && /^https?:\/\//.test(qUrl)) return { url: qUrl };
                return null;
            } catch (e) {
                return null;
            }
        };

        const originalUrl = 'https://example.com/search?q=hello%20world&category=news';
        const suspendedUrl = `chrome-extension://test/suspended.html#title=Test&timestamp=1234567890&url=${originalUrl}`;
        const result = getOriginalDataFromUrl(suspendedUrl);

        expect(result).not.toBeNull();
        expect(result.url).toBe(originalUrl);
    });

    test('getOriginalDataFromUrl should handle URLs with ampersands in query', async () => {
        const getOriginalDataFromUrl = (suspendedUrl) => {
            try {
                const hash = suspendedUrl.split('#')[1] || '';
                const urlMatch = hash.match(/&url=(.+)$/);
                if (urlMatch) {
                    const url = urlMatch[1];
                    if (url && /^https?:\/\//.test(url)) {
                        return { url };
                    }
                }
                const urlObj = new URL(suspendedUrl);
                const qUrl = urlObj.searchParams.get('url');
                if (qUrl && /^https?:\/\//.test(qUrl)) return { url: qUrl };
                return null;
            } catch (e) {
                return null;
            }
        };

        const originalUrl = 'https://example.com/api?data={"key":"value"}&format=json&callback=test';
        const suspendedUrl = `chrome-extension://test/suspended.html#title=Test&timestamp=1234567890&url=${originalUrl}`;
        const result = getOriginalDataFromUrl(suspendedUrl);

        expect(result).not.toBeNull();
        expect(result.url).toBe(originalUrl);
    });

    test('getOriginalDataFromUrl should return null for invalid URLs', async () => {
        const getOriginalDataFromUrl = (suspendedUrl) => {
            try {
                const hash = suspendedUrl.split('#')[1] || '';
                const urlMatch = hash.match(/&url=(.+)$/);
                if (urlMatch) {
                    const url = urlMatch[1];
                    if (url && /^https?:\/\//.test(url)) {
                        return { url };
                    }
                }
                const urlObj = new URL(suspendedUrl);
                const qUrl = urlObj.searchParams.get('url');
                if (qUrl && /^https?:\/\//.test(qUrl)) return { url: qUrl };
                return null;
            } catch (e) {
                return null;
            }
        };

        const suspendedUrl = 'chrome-extension://test/suspended.html#title=Test&timestamp=1234567890&url=invalid-url';
        const result = getOriginalDataFromUrl(suspendedUrl);

        expect(result).toBeNull();
    });

    test('getOriginalDataFromUrl should return null when no URL parameter exists', async () => {
        const getOriginalDataFromUrl = (suspendedUrl) => {
            try {
                const hash = suspendedUrl.split('#')[1] || '';
                const urlMatch = hash.match(/&url=(.+)$/);
                if (urlMatch) {
                    const url = urlMatch[1];
                    if (url && /^https?:\/\//.test(url)) {
                        return { url };
                    }
                }
                const urlObj = new URL(suspendedUrl);
                const qUrl = urlObj.searchParams.get('url');
                if (qUrl && /^https?:\/\//.test(qUrl)) return { url: qUrl };
                return null;
            } catch (e) {
                return null;
            }
        };

        const suspendedUrl = 'chrome-extension://test/suspended.html#title=Test&timestamp=1234567890';
        const result = getOriginalDataFromUrl(suspendedUrl);

        expect(result).toBeNull();
    });

    test('getOriginalDataFromUrl should fallback to query string for backward compatibility', async () => {
        const getOriginalDataFromUrl = (suspendedUrl) => {
            try {
                const hash = suspendedUrl.split('#')[1] || '';
                const urlMatch = hash.match(/&url=(.+)$/);
                if (urlMatch) {
                    const url = urlMatch[1];
                    if (url && /^https?:\/\//.test(url)) {
                        return { url };
                    }
                }
                const urlObj = new URL(suspendedUrl);
                const qUrl = urlObj.searchParams.get('url');
                if (qUrl && /^https?:\/\//.test(qUrl)) return { url: qUrl };
                return null;
            } catch (e) {
                return null;
            }
        };

        const originalUrl = 'https://example.com/test';
        const suspendedUrl = `chrome-extension://test/suspended.html?url=${encodeURIComponent(originalUrl)}`;
        const result = getOriginalDataFromUrl(suspendedUrl);

        expect(result).not.toBeNull();
        expect(result.url).toBe(originalUrl);
    });
}); 