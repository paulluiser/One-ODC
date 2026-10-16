import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser-live",
  testMatch: "microfeatures.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 30000 },
  use: {
    actionTimeout: 30000,
    navigationTimeout: 45000,
    baseURL: "http://localhost:3003",
    trace: "off",
    video: "off",
    screenshot: "off",
    launchOptions: {
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
  },
});
