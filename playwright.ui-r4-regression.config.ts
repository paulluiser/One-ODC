import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser-live",
  testMatch: ["ui-r1.spec.ts", "ui-r2.spec.ts", "ui-r3.spec.ts"],
  grep: /Analytics complete filters|UI-R2: BDM draft|UI-R3 quotation draft|UI-R3 finance values/,
  workers: 1,
  retries: 0,
  timeout: 600000,
  expect: { timeout: 30000 },
  use: {
    actionTimeout: 30000,
    navigationTimeout: 60000,
    baseURL: "http://localhost:3003",
    trace: "off",
    video: "off",
    screenshot: "off",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
  },
});
