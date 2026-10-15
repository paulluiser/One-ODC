import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk")
  throw Error("Staging only");
const phase = process.argv[2] || "after";
const actors =
  phase === "before" ? ["ADMIN"] : ["ADMIN", "LEAD", "BDM", "DESIGNER", "OPS"];
const out = `artifacts/verification/phase6b1-rework/${phase}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  for (const actor of actors) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3002/login");
    if (actor === "ADMIN") {
      await page.screenshot({ path: `${out}/login-light.png` });
    }
    await page
      .getByLabel("Work email")
      .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]);
    await page
      .getByRole("button", { name: "Sign in to your workspace" })
      .click();
    await page.waitForURL("**/dashboard");
    for (const destination of ["dashboard", "analytics"]) {
      await page.goto(
        `http://127.0.0.1:3002/dashboard${destination === "analytics" ? "/analytics" : ""}`,
      );
      await page
        .getByRole("region", {
          name: destination === "analytics" ? "Analytics KPIs" : "Role KPIs",
          exact: true,
        })
        .waitFor();
      for (const theme of ["light", "dark"]) {
        await page.getByRole("button", { name: `Use ${theme} theme` }).click();
        await page.screenshot({
          path: `${out}/${actor.toLowerCase()}-${destination}-${theme}.png`,
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 360, height: 800 });
      await page.getByRole("button", { name: "Use light theme" }).click();
      await page.screenshot({
        path: `${out}/${actor.toLowerCase()}-${destination}-mobile-light.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Use dark theme" }).click();
      await page.screenshot({
        path: `${out}/${actor.toLowerCase()}-${destination}-mobile.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await context.close();
    console.log(`${actor} ${phase} captures saved`);
  }
} finally {
  await browser.close();
}
