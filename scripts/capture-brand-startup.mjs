import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
const root = "artifacts/verification/brand-theme/after";
mkdirSync(`${root}/screenshots`, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const results = [];
try {
  for (const theme of ["Light", "Dark", "System"])
    for (const [viewport, width, height] of [
      ["desktop", 1440, 900],
      ["laptop", 1280, 800],
      ["mobile", 390, 844],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: theme === "Light" ? "light" : "dark",
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        (theme) => localStorage.setItem("theme", theme),
        theme.toLowerCase(),
      );
      const p = await context.newPage();
      p.setDefaultTimeout(1200);
      p.setDefaultNavigationTimeout(5000);
      const file = `screenshots/login-startup-${theme.toLowerCase()}-${viewport}.png`;
      const result = {
        role: "LOGIN",
        screen: "genuine-startup",
        theme,
        viewport,
        width,
        height,
        file,
        status: "not-observed",
        transient: true,
      };
      try {
        await p.goto("http://localhost:3003/", { waitUntil: "commit" });
        const state = p.locator('.startup-state[aria-busy="true"]');
        await state.waitFor({ state: "visible", timeout: 1200 });
        await p.screenshot({ path: `${root}/${file}`, animations: "disabled" });
        if (await state.isVisible()) result.status = "captured";
        else {
          unlinkSync(`${root}/${file}`);
          result.reason = "Startup settled during capture; no delay introduced";
        }
      } catch {
        result.reason =
          "Genuine startup settled before capture; no delay introduced";
      }
      results.push(result);
      await context.close();
    }
} finally {
  await browser.close();
}
writeFileSync(
  "artifacts/verification/brand-theme/startup-manifest.json",
  JSON.stringify(results, null, 2),
);
console.log(
  JSON.stringify(
    results.map(({ theme, viewport, status }) => ({ theme, viewport, status })),
  ),
);
