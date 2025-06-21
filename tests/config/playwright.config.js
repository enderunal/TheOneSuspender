const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
    testDir: '..',
    /* Run tests in files in parallel */
    fullyParallel: false, // Set to false for extension tests to avoid conflicts
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 5 : 5, // Use 1 worker for extension tests
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        // baseURL: 'http://127.0.0.1:3000',

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        headless: true, // Run in headless mode by default
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium-extension',
            use: {
                ...devices['Desktop Chrome'],
                // Launch browser with extension loaded
                launchOptions: {
                    args: [
                        `--disable-extensions-except=${path.resolve(__dirname, '../..')}`,
                        `--load-extension=${path.resolve(__dirname, '../..')}`,
                        '--no-first-run',
                        '--disable-default-apps',
                        '--disable-popup-blocking',
                        '--disable-background-timer-throttling',
                        '--disable-renderer-backgrounding',
                        '--disable-backgrounding-occluded-windows',
                    ],
                },
            },
        },
    ],

    /* Run your local dev server before starting the tests */
    // webServer: {
    //   command: 'npm run start',
    //   url: 'http://127.0.0.1:3000',
    //   reuseExistingServer: !process.env.CI,
    // },
}); 