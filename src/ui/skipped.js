// skipped.js
import * as Const from '../common/constants.js';

document.addEventListener('DOMContentLoaded', async () => {
    const skippedList = document.getElementById('skipped-list');
    const backBtn = document.getElementById('back-to-options');

    backBtn.addEventListener('click', () => {
        window.location.href = 'options.html';
    });

    function renderSkippedTabs(tabs) {
        if (!tabs || tabs.length === 0) {
            skippedList.innerHTML = '<div class="md-card"><p>No skipped tabs found.</p></div>';
            return;
        }
        skippedList.innerHTML = '';
        tabs.forEach(tab => {
            const isHttp = tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'));
            const isSpecial = tab.reason && tab.reason === 'special url';
            const row = document.createElement('div');
            row.className = 'skipped-tab-row md-card';
            // Suspend button (only for http(s) and not special url)
            let btnHtml = '';
            if (isHttp && !isSpecial) {
                btnHtml = `<button class="md-button compact suspend-btn" data-tabid="${tab.tabId}" title="Suspend this tab">Suspend</button>`;
            }
            row.innerHTML = `
                ${btnHtml}
                <div class="skipped-tab-info">
                    <div class="skipped-tab-title">${escapeHtml(tab.title || 'Untitled')}</div>
                    <div class="skipped-tab-url">${escapeHtml(tab.url || '')}</div>
                    <div class="skipped-tab-reason"><strong>Reason:</strong> ${escapeHtml(tab.reason || 'Unknown')}</div>
                </div>
            `;
            skippedList.appendChild(row);
        });
        // Add suspend button handlers
        document.querySelectorAll('.suspend-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tabId = Number(btn.getAttribute('data-tabid'));
                btn.disabled = true;
                btn.textContent = '...';
                try {
                    await new Promise((resolve) => chrome.runtime.sendMessage({ type: Const.MSG_SUSPEND_TAB, tabId, isManual: true }, resolve));
                    btn.textContent = '✔️';
                } catch (err) {
                    btn.textContent = '✖️';
                }
            });
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Fetch skipped tabs from background
    chrome.runtime.sendMessage({ type: Const.MSG_GET_SKIPPED_TABS }, (resp) => {
        if (chrome.runtime.lastError) {
            console.error('Error sending MSG_GET_SKIPPED_TABS:', chrome.runtime.lastError);
            skippedList.innerHTML = '<div class="md-card"><p>Error loading skipped tabs (CSP or messaging error).</p></div>';
            return;
        }
        if (resp && resp.success) {
            renderSkippedTabs(resp.skippedTabs);
        } else {
            console.error('Error loading skipped tabs:', resp);
            skippedList.innerHTML = '<div class="md-card"><p>Error loading skipped tabs (no data from background).</p></div>';
        }
    });
});
