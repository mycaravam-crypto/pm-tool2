import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Some sandboxed environments pre-install a Chromium build under
// PLAYWRIGHT_BROWSERS_PATH that doesn't match the exact revision this
// @playwright/test version expects — fall back to it explicitly when
// present so tests still run there without a "playwright install" that may
// not be able to reach the network. A normal CI/dev machine won't have this
// path, so executablePath stays undefined and Playwright resolves its own
// installed browser as usual (run `npx playwright install` there first).
const sandboxChromium = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
  : null;
const executablePath = sandboxChromium && existsSync(sandboxChromium) ? sandboxChromium : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  // Re-seeds the database before every run so tests start from the same
  // known state (2 projects, 13 events, demo logins) regardless of what a
  // previous run left behind — see server/db/seed.js, which wipes all
  // tables before inserting.
  webServer: {
    command: 'npm run seed -w server && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
});
