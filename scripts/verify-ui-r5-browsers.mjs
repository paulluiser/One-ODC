import { chromium, firefox, webkit, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
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
      await expect(p).toHaveURL(/\/dashboard$/);
      await expect(button(p, "Choose appearance")).toBeEnabled();
      await p.goto(base + "/dashboard/analytics");
      await expect(
        p.getByRole("region", { name: "Analytics KPIs", exact: true }),
      ).toBeVisible();
      await button(p, "Choose appearance").click();
      await button(p, "System").click();
      await p.emulateMedia({ colorScheme: "dark" });
      await expect(p.locator("html")).toHaveClass(/dark/);
      await p.emulateMedia({ colorScheme: "light" });
      await expect(p.locator("html")).toHaveClass(/light/);
      await p.reload();
      await expect(p.locator("html")).toHaveClass(/light/);
      await p.setViewportSize({ width: 390, height: 844 });
      await expect(button(p, "Open navigation")).toBeVisible();
      await button(p, "Open navigation").click();
      await expect(p.getByRole("dialog")).toBeVisible();
      await p.keyboard.press("Escape");
      await expect(button(p, "Open navigation")).toBeFocused();
      await button(p, "Choose appearance").click();
      await p.keyboard.press("Escape");
      await expect(button(p, "Choose appearance")).toBeFocused();
      await p.goto(base + `/dashboard/projects/${f.id}?tab=installation`);
      await expect(p.locator(".section-skeleton:visible")).toHaveCount(0);
      await expect(p.locator(".workspace-error:visible")).toHaveCount(0);
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // Responsive reflow at a 320 CSS-pixel viewport; this is not a manual browser-zoom or screen-reader claim.
      await p.setViewportSize({ width: 320, height: 800 });
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (actor !== "ADMIN") {
        await p.goto(base + "/dashboard/users");
        await expect(p).toHaveURL(/restricted=1/);
      }
      if (["BDM", "DESIGNER"].includes(actor)) {
        await p.goto(base + "/dashboard/suppliers");
        await expect(p).toHaveURL(/restricted=1/);
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
      result.reason = e.message.split("\n")[0];
    }
    results.push(result);
    await ctx.close();
    writeFileSync(
      "artifacts/verification/ui-r5/cross-browser.json",
      JSON.stringify(results, null, 2),
    );
    console.log(
      `${name} ${actor}: ${result.status}${result.reason ? " " + result.reason : ""}`,
    );
  }
  await browser.close();
}
writeFileSync(
  "artifacts/verification/ui-r5/cross-browser.json",
  JSON.stringify(results, null, 2),
);
