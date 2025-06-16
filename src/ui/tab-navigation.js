// Tab Navigation System for Material Design Options Page

export function initializeTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // Handle tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            switchToTab(targetTab, tabButtons, tabContents);
        });
    });

    // Initialize with the first tab active (or restore from URL hash)
    const urlHash = window.location.hash.substring(1);
    const initialTab = urlHash && document.querySelector(`[data-tab="${urlHash}"]`) ? urlHash : 'settings';
    switchToTab(initialTab, tabButtons, tabContents);
}

function switchToTab(targetTab, tabButtons, tabContents) {
    // Remove active class from all tabs
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    // Add active class to target tab
    const targetButton = document.querySelector(`[data-tab="${targetTab}"]`);
    const targetContent = document.getElementById(`tab-${targetTab}`);

    if (targetButton && targetContent) {
        targetButton.classList.add('active');

        targetContent.classList.add('active');

        // Update URL hash without triggering navigation
        history.replaceState(null, null, `#${targetTab}`);

        // Trigger custom event for other scripts to listen to
        document.dispatchEvent(new CustomEvent('tabChanged', {
            detail: { activeTab: targetTab }
        }));
    }
}

// Handle browser back/forward navigation
window.addEventListener('hashchange', () => {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const urlHash = window.location.hash.substring(1);
    const targetTab = urlHash || 'settings';

    switchToTab(targetTab, tabButtons, tabContents);
});

// Keyboard navigation support
document.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('tab-button')) {
        const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
        const currentIndex = tabButtons.indexOf(e.target);
        let nextIndex;

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                nextIndex = currentIndex > 0 ? currentIndex - 1 : tabButtons.length - 1;
                tabButtons[nextIndex].focus();
                break;
            case 'ArrowRight':
                e.preventDefault();
                nextIndex = currentIndex < tabButtons.length - 1 ? currentIndex + 1 : 0;
                tabButtons[nextIndex].focus();
                break;
            case 'Home':
                e.preventDefault();
                tabButtons[0].focus();
                break;
            case 'End':
                e.preventDefault();
                tabButtons[tabButtons.length - 1].focus();
                break;
        }
    }
}); 