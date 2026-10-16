import { chromium, firefox, webkit, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
const check = expect.configure({ timeout: 30000 });
const retry = process.argv.includes("--retry-failed");
const prior = retry
  ? JSON.parse(
      readFileSync(
        "artifacts/verification/brand-theme/cross-browser.json",
        "utf8",
      ),
    )
  : [];
const base = "http://localhost:3003",
  results = [],
  f = JSON.parse(
    readFileSync("artifacts/verification/ui-r4/fixture.json", "utf8"),
  );
const button = (p, name) => p.getByRole("button", { name, exact: true });
for (const [name, engine] of [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
]) {
  if (retry && !prior.some((r) => r.browser === name && r.status === "failed"))
    continue;
  let browser;
  try {
    browser = await engine.launch(
      name === "chromium"
        ? {
            executablePath:
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          }
        : {},
    );
  } catch (e) {
    results.push({
      browser: name,
      status: "unavailable",
      reason: e.message.split("\n")[0],
    });
    continue;
  }
  for (const actor of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"]) {
    if (
      retry &&
      !prior.some(
        (r) => r.browser === name && r.role === actor && r.status === "failed",
      )
    )
      continue;
    const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      }),
      p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    p.setDefaultNavigationTimeout(60000);
    const result = { browser: name, role: actor };
    try {
      await p.goto(base + "/login");
      await p
        .getByLabel("Work email")
        .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]);
      await p
        .getByLabel("Password", { exact: true })
        .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]);
      await button(p, "Sign in to your workspace").click();
      await check(p).toHaveURL(/\/dashboard$/, { timeout: 30000 });
      await check(button(p, "Choose appearance")).toBeEnabled();
      await p.goto(base + "/dashboard/analytics");
      await check(p.locator("html")).toHaveAttribute(
        "data-one-odc-brand",
        "opulence",
      );
      await check(
        p.locator('a[aria-label="One ODC overview"] img:visible'),
      ).toHaveAttribute("src", /opulence\/display\/one-odc-logo-/);
      await check(
        p.getByRole("region", { name: "Analytics KPIs", exact: true }),
      ).toBeVisible();
      await button(p, "Choose appearance").click();
      await button(p, "System").click();
      await p.emulateMedia({ colorScheme: "dark" });
      await check(p.locator("html")).toHaveClass(/dark/);
      await p.emulateMedia({ colorScheme: "light" });
      await check(p.locator("html")).toHaveClass(/light/);
      await p.reload();
      await check(p.locator("html")).toHaveClass(/light/);
      await p.setViewportSize({ width: 390, height: 844 });
      await check(button(p, "Open navigation")).toBeVisible();
      await button(p, "Open navigation").click();
      await check(p.getByRole("dialog")).toBeVisible();
      await p.keyboard.press("Escape");
      await check(button(p, "Open navigation")).toBeFocused();
      await button(p, "Choose appearance").click();
      await p.keyboard.press("Escape");
      await check(button(p, "Choose appearance")).toBeFocused();
      await p.goto(base + `/dashboard/projects/${f.id}?tab=installation`);
      await check(p.locator(".section-skeleton:visible")).toHaveCount(0);
      await check(p.locator(".workspace-error:visible")).toHaveCount(0);
      check(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // Responsive reflow at a 320 CSS-pixel viewport; this is not a manual browser-zoom or screen-reader claim.
      await p.setViewportSize({ width: 320, height: 800 });
      check(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (actor !== "ADMIN") {
        await p.goto(base + "/dashboard/users");
        await check(p).toHaveURL(/restricted=1/);
      }
      if (["BDM", "DESIGNER"].includes(actor)) {
        await p.goto(base + "/dashboard/suppliers");
        await check(p).toHaveURL(/restricted=1/);
      }
      result.status = "passed";
      result.checks = [
        "real password sign-in",
        "Analytics data",
        "System media and persisted theme",
        "mobile navigation Escape/focus",
        "theme Escape/focus",
        "installation authorized route",
        "390/320 CSS-pixel reflow",
        "role restricted routes",
      ];
    } catch (e) {
      result.status = "failed";
      result.reason = e.message.split("\n").slice(0, 12).join("\n");
      result.route = new URL(p.url()).pathname;
    }
    results.push(result);
    await ctx.close();
    writeFileSync(
      retry
        ? "artifacts/verification/brand-theme/cross-browser-retry.json"
        : "artifacts/verification/brand-theme/cross-browser.json",
      JSON.stringify(results, null, 2),
    );
    console.log(
      `${name} ${actor}: ${result.status}${result.reason ? " " + result.reason : ""}`,
    );
  }
  await browser.close();
}
writeFileSync(
  retry
    ? "artifacts/verification/brand-theme/cross-browser-retry.json"
    : "artifacts/verification/brand-theme/cross-browser.json",
  JSON.stringify(results, null, 2),
);
