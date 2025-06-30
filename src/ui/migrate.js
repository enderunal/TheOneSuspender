import * as UrlBuilder from '../common/url-builder.js';
import * as Theme from '../common/theme.js';

const migrationList = document.getElementById('migration-list');
const migrateBtn = document.getElementById('migrate-btn');
const migrationStatus = document.getElementById('migration-status');
const copyUrlsBtn = document.getElementById('copy-urls-btn');

let tabsToMigrate = [];

// --- Generic Suspender Detection ---

/**
 * List of known keys for extracting data from hash/query
 */
const URL_KEYS = ['url', 'uri'];
const TITLE_KEYS = ['title', 'ttl'];

/**
 * Returns true if the tab is a suspended tab from any extension (not this one)
 */
function isForeignSuspendedTab(tab) {
    if (!tab.url) return false;
    // Ignore our own suspended.html
    if (tab.url.startsWith(chrome.runtime.getURL('suspended.html'))) return false;
    // Match chrome-extension://<id>/<suspend|suspended>.html[?/#]
    const re = /^chrome-extension:\/\/([a-z]{32,})\/(html\/)?(suspend(ed)?\.html)([?#].*)?$/i;
    return re.test(tab.url);
}

/**
 * Extracts extension ID from a chrome-extension:// URL
 */
function extractExtensionId(url) {
    const m = url.match(/^chrome-extension:\/\/([a-z]{32,})\//i);
    return m ? m[1] : null;
}

/**
 * Extracts the original URL, title, and favicon from a suspended tab URL (hash or query)
 */
function extractSuspendedTabData(tabUrl) {
    let hash = '', query = '';
    const urlObj = new URL(tabUrl);
    if (urlObj.hash && urlObj.hash.length > 1) hash = urlObj.hash.substring(1);
    if (urlObj.search && urlObj.search.length > 1) query = urlObj.search.substring(1);
    // Prefer hash, then query
    const params = new URLSearchParams(hash || query);
    let originalUrl = null, title = '';
    for (const key of URL_KEYS) {
        if (params.has(key)) {
            originalUrl = params.get(key);
            break;
        }
    }
    for (const key of TITLE_KEYS) {
        if (params.has(key)) {
            title = params.get(key);
            break;
        }
    }
    return { originalUrl, title };
}

function scanTabs() {
    chrome.tabs.query({}, (tabs) => {
        tabsToMigrate = tabs
            .filter(isForeignSuspendedTab)
            .map(tab => {
                const extId = extractExtensionId(tab.url);
                const { originalUrl, title } = extractSuspendedTabData(tab.url);
                return { ...tab, _migrationType: 'generic', _extId: extId, _originalUrl: originalUrl, _title: title };
            })
            .filter(tab => tab._originalUrl);
        migrationList.innerHTML = '';
        if (tabsToMigrate.length === 0) {
            migrationList.innerHTML = '<li>No suspended tabs from other extensions found.</li>';
            migrateBtn.disabled = true;
            return;
        }
        tabsToMigrate.forEach(tab => {
            const extId = tab._extId || 'unknown';
            const title = tab._title || tab._originalUrl || tab.title || 'Unknown';
            const li = document.createElement('li');
            li.textContent = `[${extId}] ${title} → ${tab._originalUrl}`;
            migrationList.appendChild(li);
        });
        migrateBtn.disabled = false;
    });
}

async function migrateTabs() {
    migrationStatus.textContent = 'Migrating...';
    migrateBtn.disabled = true;
    let migrated = 0;
    const batchSize = 50;
    let current = 0;
    async function processBatch() {
        const end = Math.min(current + batchSize, tabsToMigrate.length);
        for (let i = current; i < end; i++) {
            const tab = tabsToMigrate[i];
            const originalUrl = tab._originalUrl;
            const title = tab._title || tab.title || originalUrl || 'Suspended Tab';
            if (!originalUrl) continue;
            // Build a fake tab object for buildSuspendedUrl
            const fakeTab = {
                id: tab.id,
                url: originalUrl,
                title: title
            };
            const newSuspendedUrl = UrlBuilder.buildSuspendedUrl(fakeTab);
            try {
                await chrome.tabs.update(tab.id, { url: newSuspendedUrl });
                migrated++;
            } catch (e) {
                // Could not update tab
            }
        }
        current = end;
        migrationStatus.textContent = `Migrated ${migrated} of ${tabsToMigrate.length} tab(s)...`;
        if (current < tabsToMigrate.length) {
            setTimeout(processBatch, 30); // Yield to UI, avoid throttling
        } else {
            migrationStatus.textContent = `Migration complete. ${migrated} tab(s) migrated.`;
            // Clear the list immediately
            migrationList.innerHTML = '<li>No suspended tabs from other extensions found.</li>';
            migrateBtn.disabled = true;
            // Optionally, rescan after a short delay to catch any tabs that may not have reloaded yet
            setTimeout(scanTabs, 1000);
        }
    }
    processBatch();
}

function copyAllUrls() {
    if (!tabsToMigrate.length) {
        migrationStatus.textContent = 'No URLs to copy.';
        setTimeout(() => { migrationStatus.textContent = ''; }, 1500);
        return;
    }
    const urls = tabsToMigrate.map(tab => tab._originalUrl).filter(Boolean).join('\n');
    navigator.clipboard.writeText(urls).then(() => {
        migrationStatus.textContent = `Copied ${tabsToMigrate.length} URL${tabsToMigrate.length === 1 ? '' : 's'}!`;
        setTimeout(() => { migrationStatus.textContent = ''; }, 1500);
    }, () => {
        migrationStatus.textContent = 'Failed to copy URLs.';
        setTimeout(() => { migrationStatus.textContent = ''; }, 1500);
    });
}

migrateBtn.addEventListener('click', migrateTabs);
copyUrlsBtn.addEventListener('click', copyAllUrls);

// Initialize theme and scan tabs
(async () => {
    // Initialize theme using common method
    await Theme.initializeThemeForPage();
    scanTabs();
})(); 