/**
 * playwright.config.ts
 *
 * Usage scope: Playwright end-to-end test configuration for the CLQ Proofing Editor app.
 *
 * Purpose: runs e2e specs from `./e2e` against a `next dev` server Playwright starts and
 * reuses across runs, on Chromium only (sufficient for editor round-trip smoke tests). No e2e
 * specs exist yet in this scaffolding task — the editor UI these tests exercise is ported in a
 * later task.
 *
 * Protocol: keep `reuseExistingServer` true for local dev speed; CI should still get a fresh
 * server per run via its own environment (CI sets `reuseExistingServer: false` implicitly when
 * `!process.env.CI` is false, as below).
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
