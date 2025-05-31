import * as UrlBuilder from '../common/url-builder.js';

const MARVELLOUS_SUSPENDER_ID = 'noogafoofpebimajpfpamcfhoaifemoa';
const MARVELLOUS_SUSPENDED_PREFIX = `chrome-extension://${MARVELLOUS_SUSPENDER_ID}/suspended.html#`;

const migrationList = document.getElementById('migration-list');
const migrateBtn = document.getElementById('migrate-btn');
const migrationStatus = document.getElementById('migration-status');

let tabsToMigrate = [];

function extractOriginalUrl(hash) {
    // Marvellous Suspender uses #...&uri=ENCODED_URL
    const params = new URLSearchParams(hash);
    return params.get('uri');
}

function extractTitle(hash) {
    const params = new URLSearchParams(hash);
    return params.get('ttl') || '';
}

function scanTabs() {
    chrome.tabs.query({}, (tabs) => {
        tabsToMigrate = tabs.filter(tab => tab.url && tab.url.startsWith(MARVELLOUS_SUSPENDED_PREFIX));
        migrationList.innerHTML = '';
        if (tabsToMigrate.length === 0) {
            migrationList.innerHTML = '<li>No Marvellous Suspender tabs found.</li>';
            migrateBtn.disabled = true;
            return;
        }
        tabsToMigrate.forEach(tab => {
            const hash = tab.url.split('#')[1] || '';
            const originalUrl = extractOriginalUrl(hash);
            const title = extractTitle(hash) || originalUrl || tab.title || 'Unknown';
            const li = document.createElement('li');
            li.textContent = `${title} → ${originalUrl}`;
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
            const hash = tab.url.split('#')[1] || '';
            const originalUrl = extractOriginalUrl(hash);
            const title = extractTitle(hash) || tab.title || originalUrl || 'Suspended Tab';
            if (!originalUrl) continue;
            // Build a fake tab object for buildSuspendedUrl
            const fakeTab = {
                id: tab.id,
                url: originalUrl,
                title: title,
                favIconUrl: tab.favIconUrl
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
            migrationList.innerHTML = '<li>No Marvellous Suspender tabs found.</li>';
            migrateBtn.disabled = true;
            // Optionally, rescan after a short delay to catch any tabs that may not have reloaded yet
            setTimeout(scanTabs, 1000);
        }
    }
    processBatch();
}

migrateBtn.addEventListener('click', migrateTabs);

scanTabs(); 