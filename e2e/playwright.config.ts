import { defineConfig, devices } from '@playwright/test';

/**
 * The app under test is the BFF (:4000) fronted by the Vite dev server (:5175).
 * Both must already be running - this config deliberately does NOT start them.
 *
 * `webServer` would want to own their lifecycle, and these two hold state the
 * tests care about: the rate limiter and the session registry are in-process
 * memory, so a restart between runs silently wipes exactly what the security
 * specs are asserting on. Better to run against the real, already-warm server
 * and let a missing one fail loudly in global setup.
 */
const UI = process.env.E2E_UI_URL ?? 'http://localhost:5175';

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',

  /*
   * Serial by default, and this is not a performance oversight.
   *
   * The rate limiter is keyed on (IP, email) and the session registry caps an
   * ACCOUNT at three devices. Parallel workers share both the client IP and the
   * one test account, so a session test running beside a rate-limit test would
   * evict each other's sessions and consume each other's attempt budget. Every
   * failure that produced would be a false one.
   *
   * Individual specs opt back into parallelism where their keys are provably
   * unique - see the per-file `test.describe.configure` calls.
   */
  fullyParallel: false,
  workers: 1,

  /*
   * Zero retries on purpose. These specs assert on counters and cooldowns that a
   * first attempt mutates: a retried rate-limit test starts with a budget the
   * previous attempt already spent, so a retry would report a spurious pass or
   * a spurious failure depending on timing. Flakiness here is a real signal.
   */
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
