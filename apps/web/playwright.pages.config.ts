import { defineConfig, devices } from "@playwright/test";

/**
 * The GitHub Pages demo: a static export whose API runs in a service worker in the browser.
 * `pnpm --filter @food-del/web build:pages && pnpm --filter @food-del/web e2e:pages`.
 */
const port = 4173;
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/Food-Del";
const baseURL = process.env.PAGES_BASE_URL ?? `http://localhost:${port}${basePath}/`;

export default defineConfig({
  testDir: "./e2e-pages",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    serviceWorkers: "allow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--no-proxy-server"],
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  webServer: process.env.PAGES_BASE_URL
    ? undefined
    : {
        command: `node scripts/serve-pages.mjs ${port}`,
        url: baseURL,
        reuseExistingServer: true,
      },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
