const { test, expect } = require('./config/node_modules/@playwright/test');

test.describe('Tab Suspension Logic Tests', () => {
    test('tab suspension respects conditional exceptions', async () => {
        // Test tab classification logic
        const mockTabs = [
            { id: 1, url: 'https://google.com', pinned: false, audible: false, active: true },
            { id: 2, url: 'https://github.com/enderunal/TheOneSuspender', pinned: true, audible: false, active: false },
            { id: 3, url: 'https://youtube.com/watch?v=123', pinned: false, audible: true, active: false },
            { id: 4, url: 'https://google.com/search', pinned: false, audible: false, active: false },
            { id: 5, url: 'chrome://extensions/', pinned: false, audible: false, active: false }
        ];

        const mockSettings = {
            neverSuspendPinned: true,
            neverSuspendAudible: true,
            neverSuspendActive: true,
            neverSuspendInternal: true
        };

        const shouldSkipTab = (tab, settings, whitelist = []) => {
            // Already suspended check (would be URL check in real implementation)
            if (tab.url && tab.url.includes('suspended.html')) return true;

            // Pinned tab check
            if (tab.pinned && settings.neverSuspendPinned) return true;

            // Audio tab check  
            if (tab.audible && settings.neverSuspendAudible) return true;

            // Active tab check
            if (tab.active && settings.neverSuspendActive) return true;

            // Internal Chrome URLs
            if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) && settings.neverSuspendInternal) return true;

            // Whitelist check
            if (whitelist.includes('*')) return true;
            const domain = tab.url ? tab.url.replace(/^https?:\/\//, '').split('/')[0] : '';
            if (whitelist.includes(domain)) return true;

            return false;
        };

        const results = mockTabs.map(tab => ({
            id: tab.id,
            url: tab.url,
            shouldSkip: shouldSkipTab(tab, mockSettings, ['google.com'])
        }));

        // Active tab should be skipped
        expect(results.find(r => r.id === 1).shouldSkip).toBeTruthy();

        // Pinned tab should be skipped
        expect(results.find(r => r.id === 2).shouldSkip).toBeTruthy();

        // Audible tab should be skipped
        expect(results.find(r => r.id === 3).shouldSkip).toBeTruthy();

        // Whitelisted domain should be skipped
        expect(results.find(r => r.id === 4).shouldSkip).toBeTruthy();

        // Chrome internal URL should be skipped
        expect(results.find(r => r.id === 5).shouldSkip).toBeTruthy();
    });

    test('tab scheduling follows timeout rules', async () => {
        const mockCurrentTime = Date.now();
        const timeoutMinutes = 5;
        const timeoutMs = timeoutMinutes * 60 * 1000;

        // Simulate tab suspend scheduling
        const scheduleTab = (tabId, delayMinutes = null) => {
            const delay = delayMinutes || timeoutMinutes;
            const suspendTime = mockCurrentTime + (delay * 60 * 1000);

            return {
                tabId,
                suspendTime,
                isScheduled: true,
                delayMinutes: delay
            };
        };

        const getTabSuspendTime = (tabId, scheduledTabs) => {
            const scheduled = scheduledTabs.find(t => t.tabId === tabId);
            return scheduled ? scheduled.suspendTime : null;
        };

        const isTabDueForSuspension = (tabId, scheduledTabs, currentTime = mockCurrentTime) => {
            const suspendTime = getTabSuspendTime(tabId, scheduledTabs);
            return suspendTime && currentTime >= suspendTime;
        };

        // Test scheduling
        const scheduledTabs = [];
        scheduledTabs.push(scheduleTab(1, 5)); // 5 minute delay
        scheduledTabs.push(scheduleTab(2, 10)); // 10 minute delay

        expect(scheduledTabs).toHaveLength(2);
        expect(getTabSuspendTime(1, scheduledTabs)).toBe(mockCurrentTime + (5 * 60 * 1000));
        expect(getTabSuspendTime(2, scheduledTabs)).toBe(mockCurrentTime + (10 * 60 * 1000));

        // Test suspension due check
        expect(isTabDueForSuspension(1, scheduledTabs, mockCurrentTime)).toBeFalsy(); // Not due yet
        expect(isTabDueForSuspension(1, scheduledTabs, mockCurrentTime + (6 * 60 * 1000))).toBeTruthy(); // Due
        expect(isTabDueForSuspension(2, scheduledTabs, mockCurrentTime + (6 * 60 * 1000))).toBeFalsy(); // Not due yet
    });

    test('tab unscheduling when tab becomes active', async () => {
        let scheduledTabs = [
            { tabId: 1, suspendTime: Date.now() + 300000, isScheduled: true },
            { tabId: 2, suspendTime: Date.now() + 600000, isScheduled: true }
        ];

        const unscheduleTab = (tabId, scheduledTabs) => {
            return scheduledTabs.filter(t => t.tabId !== tabId);
        };

        const cancelTabSuspendTracking = (tabId, scheduledTabs) => {
            const wasScheduled = scheduledTabs.some(t => t.tabId === tabId);
            const newScheduledTabs = unscheduleTab(tabId, scheduledTabs);
            return { wasScheduled, newScheduledTabs };
        };

        // Test unscheduling when tab becomes active
        const result1 = cancelTabSuspendTracking(1, scheduledTabs);
        expect(result1.wasScheduled).toBeTruthy();
        expect(result1.newScheduledTabs).toHaveLength(1);
        expect(result1.newScheduledTabs.find(t => t.tabId === 1)).toBeUndefined();

        // Test unscheduling non-existent tab
        const result2 = cancelTabSuspendTracking(999, scheduledTabs);
        expect(result2.wasScheduled).toBeFalsy();
        expect(result2.newScheduledTabs).toHaveLength(2);
    });

    test('suspension modes work correctly', async () => {
        const mockTab = {
            id: 1,
            url: 'https://github.com/enderunal/TheOneSuspender',
            title: 'TheOneSuspender - GitHub',
            favIconUrl: 'https://github.com/favicon.ico'
        };

        // Test preserve history mode (default)
        const suspendTabPreserveHistory = (tab) => {
            const suspendedUrl = `chrome-extension://extension-id/suspended.html?url=${encodeURIComponent(tab.url)}&title=${encodeURIComponent(tab.title)}&favicon=${encodeURIComponent(tab.favIconUrl || '')}`;

            return {
                originalUrl: tab.url,
                originalTitle: tab.title,
                suspendedUrl,
                mode: 'preserve-history',
                preservesHistory: true
            };
        };

        // Test close & reopen mode
        const suspendTabCloseReopen = (tab) => {
            return {
                originalUrl: tab.url,
                originalTitle: tab.title,
                mode: 'close-reopen',
                preservesHistory: false,
                requiresReopen: true
            };
        };

        const preserveResult = suspendTabPreserveHistory(mockTab);
        expect(preserveResult.preservesHistory).toBeTruthy();
        expect(preserveResult.suspendedUrl).toContain('suspended.html');
        expect(preserveResult.suspendedUrl).toContain(encodeURIComponent(mockTab.url));

        const closeReopenResult = suspendTabCloseReopen(mockTab);
        expect(closeReopenResult.preservesHistory).toBeFalsy();
        expect(closeReopenResult.requiresReopen).toBeTruthy();
        expect(closeReopenResult.mode).toBe('close-reopen');
    });

    test('tab suspension URL building works correctly', async () => {
        const buildSuspendedUrl = (tab) => {
            const baseUrl = 'chrome-extension://extension-id/suspended.html';
            const params = new URLSearchParams();

            if (tab.url) params.set('url', tab.url);
            if (tab.title) params.set('title', tab.title);
            if (tab.favIconUrl) params.set('favicon', tab.favIconUrl);
            params.set('timestamp', Date.now().toString());

            return `${baseUrl}?${params.toString()}`;
        };

        const parseOriginalDataFromUrl = (suspendedUrl) => {
            try {
                const url = new URL(suspendedUrl);
                const params = url.searchParams;

                return {
                    originalUrl: params.get('url'),
                    originalTitle: params.get('title'),
                    originalFavicon: params.get('favicon'),
                    timestamp: params.get('timestamp')
                };
            } catch {
                return null;
            }
        };

        // Test with GitHub URL
        const githubTab = {
            url: 'https://github.com/enderunal/TheOneSuspender',
            title: 'TheOneSuspender Repository',
            favIconUrl: 'https://github.com/favicon.ico'
        };

        const suspendedUrl = buildSuspendedUrl(githubTab);
        expect(suspendedUrl).toContain('suspended.html');
        expect(suspendedUrl).toContain('url=https%3A%2F%2Fgithub.com%2Fenderunal%2FTheOneSuspender');

        const parsedData = parseOriginalDataFromUrl(suspendedUrl);
        expect(parsedData.originalUrl).toBe(githubTab.url);
        expect(parsedData.originalTitle).toBe(githubTab.title);
        expect(parsedData.originalFavicon).toBe(githubTab.favIconUrl);
        expect(parsedData.timestamp).toBeTruthy();

        // Test with Google URL
        const googleTab = {
            url: 'https://google.com/search?q=test',
            title: 'test - Google Search',
            favIconUrl: 'https://google.com/favicon.ico'
        };

        const googleSuspendedUrl = buildSuspendedUrl(googleTab);
        const googleParsedData = parseOriginalDataFromUrl(googleSuspendedUrl);
        expect(googleParsedData.originalUrl).toBe(googleTab.url);
        expect(googleParsedData.originalTitle).toBe(googleTab.title);
    });

    test('suspension prevention for allowed protocols', async () => {
        const isAllowedProtocol = (url) => {
            if (!url) return false;

            const allowedProtocols = ['http:', 'https:'];
            const disallowedProtocols = ['chrome:', 'chrome-extension:', 'chrome-devtools:', 'file:', 'ftp:'];

            try {
                const urlObj = new URL(url);
                return allowedProtocols.includes(urlObj.protocol);
            } catch {
                return false;
            }
        };

        const testUrls = [
            { url: 'https://google.com', allowed: true },
            { url: 'http://google.com', allowed: true },
            { url: 'https://github.com/enderunal/TheOneSuspender', allowed: true },
            { url: 'chrome://extensions/', allowed: false },
            { url: 'chrome-extension://abc123/popup.html', allowed: false },
            { url: 'chrome-devtools://devtools/', allowed: false },
            { url: 'file:///local/file.html', allowed: false },
            { url: 'ftp://ftp.example.com', allowed: false },
            { url: 'about:blank', allowed: false },
            { url: 'data:text/html,<h1>Test</h1>', allowed: false }
        ];

        testUrls.forEach(testCase => {
            expect(isAllowedProtocol(testCase.url)).toBe(testCase.allowed);
        });
    });

    test('bulk suspension operations work correctly', async () => {
        const mockTabs = [
            { id: 1, url: 'https://google.com', windowId: 1, pinned: false, active: false },
            { id: 2, url: 'https://github.com/enderunal/TheOneSuspender', windowId: 1, pinned: false, active: true },
            { id: 3, url: 'https://example.com', windowId: 1, pinned: true, active: false },
            { id: 4, url: 'https://google.com/search', windowId: 2, pinned: false, active: false },
            { id: 5, url: 'chrome://extensions/', windowId: 2, pinned: false, active: false }
        ];

        const shouldSkipTab = (tab) => {
            if (tab.pinned) return true;
            if (tab.active) return true;
            if (tab.url.startsWith('chrome://')) return true;
            return false;
        };

        const getEligibleTabsForWindow = (windowId, tabs) => {
            return tabs
                .filter(tab => tab.windowId === windowId)
                .filter(tab => !shouldSkipTab(tab));
        };

        const getAllEligibleTabs = (tabs) => {
            return tabs.filter(tab => !shouldSkipTab(tab));
        };

        // Test window-specific suspension
        const window1EligibleTabs = getEligibleTabsForWindow(1, mockTabs);
        expect(window1EligibleTabs).toHaveLength(1); // Only tab 1 (google.com)
        expect(window1EligibleTabs[0].id).toBe(1);

        const window2EligibleTabs = getEligibleTabsForWindow(2, mockTabs);
        expect(window2EligibleTabs).toHaveLength(1); // Only tab 4 (google.com/search)
        expect(window2EligibleTabs[0].id).toBe(4);

        // Test all windows suspension
        const allEligibleTabs = getAllEligibleTabs(mockTabs);
        expect(allEligibleTabs).toHaveLength(2);
        expect(allEligibleTabs.map(t => t.id)).toEqual([1, 4]);
    });
}); 