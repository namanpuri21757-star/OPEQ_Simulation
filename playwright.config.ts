import { defineConfig, devices } from '@playwright/test';

/**
 * The end-to-end suite: real browsers against the built app.
 *
 * There is no `webServer` here on purpose. One of the things the suite has to
 * prove is that the game survives the server being killed and restarted in the
 * middle of a year (acceptance R6 and F2), so each test starts and stops the
 * server itself - see tests/e2e/support/server.ts.
 *
 * Chromium is the one that must pass. Firefox and WebKit are optional: they run
 * when PLAYWRIGHT_BROWSERS is set, and what they report is noted in
 * docs/ACCEPTANCE.md rather than blocking a release.
 */
const extraBrowsers = (process.env['PLAYWRIGHT_BROWSERS'] ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name === 'firefox' || name === 'webkit');

export default defineConfig({
  testDir: './tests/e2e',
  // A full game in nine browser contexts is not quick, and the point of it is
  // that it finishes rather than that it finishes fast.
  timeout: 15 * 60 * 1000,
  expect: { timeout: 15_000 },
  // One at a time. Eleven browser contexts already fill a laptop, and two
  // suites fighting over it would measure the laptop rather than the app.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [['list']],
  use: {
    // A classroom laptop, which SPEC section 9 gives as the smallest layout.
    viewport: { width: 1024, height: 768 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...extraBrowsers.map((name) => ({
      name,
      use: { ...devices[name === 'firefox' ? 'Desktop Firefox' : 'Desktop Safari'] },
    })),
  ],
});
