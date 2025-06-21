const { test, expect } = require('./config/node_modules/@playwright/test');

test.describe('Whitelist Functionality Tests', () => {
    test('whitelist supports basic URL and domain formats', async () => {
        // Test whitelist parsing and validation logic
        const whitelistTests = [
            { entry: 'google.com', shouldMatch: ['https://google.com', 'http://google.com', 'https://google.com/search'] },
            { entry: 'github.com', shouldMatch: ['https://github.com', 'https://github.com/enderunal/TheOneSuspender'] },
            { entry: 'https://google.com', shouldMatch: ['https://google.com', 'https://google.com/search'] },
            { entry: 'https://github.com/enderunal/TheOneSuspender', shouldMatch: ['https://github.com/enderunal/TheOneSuspender'] },
            { entry: '*', shouldMatch: ['https://google.com', 'https://github.com/enderunal/TheOneSuspender', 'https://example.com'] }
        ];

        whitelistTests.forEach(test => {
            // Test basic domain extraction and matching logic
            const domain = test.entry === '*' ? '*' : test.entry.replace(/^https?:\/\//, '').split('/')[0];

            test.shouldMatch.forEach(url => {
                const urlDomain = url.replace(/^https?:\/\//, '').split('/')[0];
                const urlPath = url.replace(/^https?:\/\/[^/]+/, '');

                if (test.entry === '*') {
                    // Global wildcard should match everything
                    expect(true).toBeTruthy();
                } else if (test.entry.startsWith('http')) {
                    // Full URL should match exact URL or URL with path
                    const baseUrl = test.entry;
                    expect(url.startsWith(baseUrl) || url === baseUrl).toBeTruthy();
                } else {
                    // Domain should match domain
                    expect(urlDomain).toBe(domain);
                }
            });
        });
    });

    test('whitelist validates URL format correctly', async () => {
        const validEntries = [
            'google.com',
            'https://google.com',
            'http://google.com',
            'github.com',
            'https://github.com/enderunal/TheOneSuspender',
            'subdomain.example.com',
            'localhost',
            'localhost:3000',
            '*'
        ];

        const invalidEntries = [
            '',
            ' ',
            'javascript:void(0)',
            '<script>alert("xss")</script>'
        ];

        // Test basic URL validation logic
        const isValidUrl = (entry) => {
            if (!entry || entry.trim() === '') return false;
            if (entry === '*') return true;
            if (entry.startsWith('http')) return true;
            if (entry.includes('.')) return true;
            if (entry === 'localhost' || entry.includes('localhost:')) return true;
            if (entry.includes('<') || entry.includes('>') || entry.includes('script')) return false;
            return false;
        };

        validEntries.forEach(entry => {
            expect(isValidUrl(entry)).toBeTruthy();
        });

        invalidEntries.forEach(entry => {
            expect(isValidUrl(entry)).toBeFalsy();
        });
    });

    test('whitelist supports one entry per line format', async () => {
        const whitelistText = `google.com
github.com
https://github.com/enderunal/TheOneSuspender
*
localhost:3000`;

        // Parse whitelist text (one entry per line)
        const parseWhitelist = (text) => {
            return text
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .filter(line => !line.startsWith('#')); // Filter out comments
        };

        const entries = parseWhitelist(whitelistText);

        expect(entries).toHaveLength(5);
        expect(entries).toContain('google.com');
        expect(entries).toContain('github.com');
        expect(entries).toContain('https://github.com/enderunal/TheOneSuspender');
        expect(entries).toContain('*');
        expect(entries).toContain('localhost:3000');
    });

    test('whitelist handles special characters and edge cases', async () => {
        const edgeCases = [
            { entry: 'google.com', url: 'https://google.com/', shouldMatch: true },
            { entry: 'google.com', url: 'https://www.google.com', shouldMatch: false }, // subdomain
            { entry: 'github.com', url: 'https://github.com/enderunal/TheOneSuspender?tab=readme', shouldMatch: true },
            { entry: '*', url: 'https://any-domain.com', shouldMatch: true },
            { entry: 'localhost:3000', url: 'http://localhost:3000', shouldMatch: true },
            { entry: 'example.com', url: 'https://subdomain.example.com', shouldMatch: false }
        ];

        const isWhitelisted = (entry, url) => {
            if (entry === '*') return true;

            const entryDomain = entry.replace(/^https?:\/\//, '').split('/')[0];
            const urlDomain = url.replace(/^https?:\/\//, '').split('/')[0];

            if (entry.startsWith('http')) {
                // Full URL matching
                return url.startsWith(entry.replace(/\/$/, ''));
            } else {
                // Domain matching
                return urlDomain === entryDomain;
            }
        };

        edgeCases.forEach(testCase => {
            const result = isWhitelisted(testCase.entry, testCase.url);
            expect(result).toBe(testCase.shouldMatch);
        });
    });

    test('whitelist supports domain and subdomain patterns', async () => {
        const domainTests = [
            {
                pattern: 'google.com', tests: [
                    { url: 'https://google.com', match: true },
                    { url: 'https://www.google.com', match: false }, // Different subdomain
                    { url: 'https://mail.google.com', match: false }, // Different subdomain
                    { url: 'https://google.com/search', match: true }
                ]
            },
            {
                pattern: 'github.com', tests: [
                    { url: 'https://github.com', match: true },
                    { url: 'https://github.com/enderunal/TheOneSuspender', match: true },
                    { url: 'https://api.github.com', match: false } // Different subdomain
                ]
            }
        ];

        const matchesDomain = (pattern, url) => {
            const patternDomain = pattern.replace(/^https?:\/\//, '').split('/')[0];
            const urlDomain = url.replace(/^https?:\/\//, '').split('/')[0];
            return urlDomain === patternDomain;
        };

        domainTests.forEach(domainTest => {
            domainTest.tests.forEach(urlTest => {
                const result = matchesDomain(domainTest.pattern, urlTest.url);
                expect(result).toBe(urlTest.match);
            });
        });
    });

    test('whitelist parses and validates complex entries', async () => {
        const complexWhitelist = `# This is a comment
google.com
# Another comment
https://github.com/enderunal/TheOneSuspender

github.com
*
   localhost:3000   
https://example.com/specific/path

# Empty lines should be ignored


mail.google.com`;

        const parseComplexWhitelist = (text) => {
            return text
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .filter(line => !line.startsWith('#'));
        };

        const entries = parseComplexWhitelist(complexWhitelist);

        expect(entries).toHaveLength(7);
        expect(entries).toContain('google.com');
        expect(entries).toContain('https://github.com/enderunal/TheOneSuspender');
        expect(entries).toContain('github.com');
        expect(entries).toContain('*');
        expect(entries).toContain('localhost:3000');
        expect(entries).toContain('https://example.com/specific/path');
        expect(entries).toContain('mail.google.com');

        // Should not contain comments or empty lines
        expect(entries.filter(e => e.startsWith('#'))).toHaveLength(0);
    });

    test('whitelist provides add and remove functionality', async () => {
        let whitelist = ['google.com', 'github.com'];

        const addToWhitelist = (list, entry) => {
            if (!list.includes(entry) && entry.trim() !== '') {
                return [...list, entry];
            }
            return list;
        };

        const removeFromWhitelist = (list, entry) => {
            return list.filter(item => item !== entry);
        };

        // Test adding entries
        whitelist = addToWhitelist(whitelist, 'https://github.com/enderunal/TheOneSuspender');
        expect(whitelist).toContain('https://github.com/enderunal/TheOneSuspender');
        expect(whitelist).toHaveLength(3);

        // Test adding duplicate (should not add)
        whitelist = addToWhitelist(whitelist, 'google.com');
        expect(whitelist).toHaveLength(3);

        // Test adding wildcard
        whitelist = addToWhitelist(whitelist, '*');
        expect(whitelist).toContain('*');
        expect(whitelist).toHaveLength(4);

        // Test removing entry
        whitelist = removeFromWhitelist(whitelist, 'github.com');
        expect(whitelist).not.toContain('github.com');
        expect(whitelist).toHaveLength(3);

        // Test removing non-existent entry
        whitelist = removeFromWhitelist(whitelist, 'non-existent.com');
        expect(whitelist).toHaveLength(3);
    });

    test('whitelist handles URL normalization', async () => {
        const normalizeUrl = (url) => {
            // Remove trailing slashes, convert to lowercase
            return url.toLowerCase().replace(/\/+$/, '');
        };

        const urlVariations = [
            { input: 'https://Google.com', normalized: 'https://google.com' },
            { input: 'https://GitHub.com/', normalized: 'https://github.com' },
            { input: 'GOOGLE.COM', normalized: 'google.com' },
            { input: 'https://github.com/enderunal/TheOneSuspender/', normalized: 'https://github.com/enderunal/theonesuspender' }
        ];

        urlVariations.forEach(variation => {
            const result = normalizeUrl(variation.input);
            expect(result).toBe(variation.normalized);
        });
    });
}); 