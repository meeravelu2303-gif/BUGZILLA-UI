import { defineConfig, devices } from '@playwright/test';

const UI = process.env.E2E_UI_URL ?? 'http://localhost:5175';

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',

  fullyParallel: false,
  workers: 1,

  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: UI,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
