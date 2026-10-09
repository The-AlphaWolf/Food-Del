import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end journeys against a running app with a seeded database (fake payments and courier).
 * Locally: `pnpm db:reset && pnpm --filter @food-del/web build && pnpm e2e`.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--no-proxy-server"],
      // Use a pre-installed Chromium when the bundled one isn't downloaded (e.g. sandboxes).
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: `${baseURL}/api/v1/health`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
