import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
const root = "artifacts/verification/ui-r1";
mkdirSync(root, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const allowed = ["ADMIN", "DESIGNER", "BDM", "OPS", "LEAD"];
  const actors = process.argv.slice(2);
  if (actors.some((actor) => !allowed.includes(actor)))
    throw Error("Unknown staging actor");
  for (const actor of actors.length ? actors : allowed) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const login = await context.newPage();
    await login.goto("http://localhost:3003/login");
    await login
      .getByLabel("Work email")
      .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]);
    await login
      .getByLabel("Password", { exact: true })
      .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]);
    await login
      .getByRole("button", { name: "Sign in to your workspace" })
      .click();
    await login.waitForURL("**/dashboard");
    for (const screen of ["dashboard", "analytics"])
      for (const theme of ["light", "dark"])
        for (const [size, width, height] of [
          ["desktop", 1440, 900],
          ["laptop", 1280, 800],
          ["mobile", 390, 844],
        ]) {
          const p = await context.newPage();
          await p.setViewportSize({ width, height });
          await p.goto(
            `http://localhost:3003/dashboard${screen === "analytics" ? "/analytics" : ""}`,
          );
          await p
            .getByRole("region", {
              name:
                screen === "analytics"
                  ? "Analytics KPIs"
                  : actor === "LEAD"
                    ? "Lead Designer key metrics"
                    : "Role KPIs",
              exact: true,
            })
            .waitFor();
          await p
            .getByRole("button", { name: "Choose appearance", exact: true })
            .click();
          await p
            .getByRole("button", {
              name: theme === "light" ? "Light" : "Dark",
              exact: true,
            })
            .click();
          await p.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          const geometry = await p.evaluate(() => ({
            headers: document.querySelectorAll("header").length,
            overflow: document.documentElement.scrollWidth > innerWidth,
          }));
          if (geometry.headers !== 1 || geometry.overflow)
            throw Error(`${actor} ${screen} ${theme} ${size} layout bounds`);
          await p.screenshot({
            path: `${root}/${actor.toLowerCase()}-${screen}-${theme}-${size}.png`,
            animations: "disabled",
          });
          if (
            screen === "dashboard" &&
            actor !== "LEAD" &&
            size === "mobile" &&
            theme === "dark"
          ) {
            await p
              .getByRole("region", {
                name: "Workspace responsibilities",
                exact: true,
              })
              .scrollIntoViewIfNeeded();
            await p.screenshot({
              path: `${root}/${actor.toLowerCase()}-dashboard-details-mobile.png`,
              animations: "disabled",
            });
          }
          await p.close();
        }
    await context.close();
    console.log(`${actor}: twelve final captures saved`);
  }
} finally {
  await browser.close();
}
