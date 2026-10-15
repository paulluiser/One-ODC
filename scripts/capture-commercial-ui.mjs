import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
process.loadEnvFile(".env.verification");
if (process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk")
  throw Error("Staging only");
const root = "artifacts/verification/phase6b3-ui",
  phase = process.argv[2] || "after";
mkdirSync(`${root}/${phase}`, { recursive: true });
const file = `${root}/fixture.json`;
if (!existsSync(file))
  writeFileSync(
    file,
    execFileSync(
      process.execPath,
      ["scripts/staging-operational-acceptance.mjs"],
      { encoding: "utf8", timeout: 180000 },
    ),
  );
const fixture = JSON.parse(readFileSync(file));
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  for (const actor of phase === "before"
    ? ["LEAD", "OPS"]
    : ["ADMIN", "LEAD", "BDM", "DESIGNER", "OPS"]) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      p = await context.newPage();
    await p.goto("http://127.0.0.1:3002/login");
    await p
      .getByLabel("Work email")
      .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]);
    await p
      .getByLabel("Password", { exact: true })
      .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]);
    await p.getByRole("button", { name: "Sign in to your workspace" }).click();
    await p.waitForURL("**/dashboard");
    const routes = [
      ...(["ADMIN", "LEAD", "OPS"].includes(actor)
        ? [["suppliers", "/dashboard/suppliers"]]
        : []),
      ...["quotation", "finance", "logistics", "installation"]
        .filter((tab) => !(actor === "OPS" && tab === "quotation"))
        .map((tab) => [
          tab,
          `/dashboard/projects/${fixture.project}?tab=${tab}`,
        ]),
    ];
    for (const [name, url] of routes) {
      await p.goto(`http://127.0.0.1:3002${url}`);
      await p.locator(".page-intro, h1").first().waitFor();
      await p
        .getByRole("heading", {
          name:
            name === "suppliers"
              ? "Supplier Masterlist"
              : name === "quotation"
                ? /Quotation ·/
                : name === "finance"
                  ? "Financial summary"
                  : name === "logistics"
                    ? "Supplier & Logistics"
                    : "Installation",
          exact: name !== "quotation",
        })
        .waitFor();
      for (const theme of ["light", "dark"]) {
        await p.getByRole("button", { name: `Use ${theme} theme` }).click();
        for (const size of ["desktop", "mobile"]) {
          await p.setViewportSize(
            size === "desktop"
              ? { width: 1440, height: 1000 }
              : { width: 360, height: 800 },
          );
          await p.screenshot({
            path: `${root}/${phase}/${actor.toLowerCase()}-${name}-${theme}-${size}.png`,
            fullPage: true,
          });
        }
      }
    }
    await context.close();
    console.log(`${actor} ${phase} saved`);
  }
} finally {
  await browser.close();
}
