import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  expect: { timeout: 30000 },
  timeout: 180000,
  testDir: "./tests/browser-live",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    actionTimeout: 15000,
    baseURL: "http://127.0.0.1:3002",
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "node scripts/staging-dev.mjs",
    url: "http://127.0.0.1:3002/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
