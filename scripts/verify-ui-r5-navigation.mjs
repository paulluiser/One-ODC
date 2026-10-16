import { chromium, firefox, webkit, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
const results = [],
  base = "http://localhost:3003",
  button = (p, name) => p.getByRole("button", { name, exact: true });
for (const [browserName, engine] of [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
]) {
  const b = await engine.launch(
    browserName === "chromium"
      ? {
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        }
      : {},
  );
  try {
    for (const role of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"]) {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }),
        p = await ctx.newPage();
      p.setDefaultTimeout(30000);
      const r = { browser: browserName, role };
      try {
        await p.goto(base + "/login");
        await expect(button(p, "Choose appearance")).toBeEnabled();
        await p
          .getByLabel("Work email")
          .fill(process.env[`ONE_ODC_TEST_${role}_EMAIL`]);
        await p
          .getByLabel("Password", { exact: true })
          .fill(process.env[`ONE_ODC_TEST_${role}_PASSWORD`]);
        await button(p, "Sign in to your workspace").click();
        await expect(p).toHaveURL(/\/dashboard$/, { timeout: 30000 });
        await expect(button(p, "Choose appearance")).toBeEnabled();
        for (const theme of ["Light", "Dark"]) {
          await button(p, "Choose appearance").click();
          await button(p, theme).click();
          await button(p, "Open navigation").click();
          const d = p.getByRole("dialog", {
            name: "Workspace navigation",
            exact: true,
          });
          await expect(d).toBeVisible();
          expect(await d.evaluate((e) => e.tagName)).toBe("DIV");
          const a = await new AxeBuilder({ page: p }).analyze();
          r[theme] = {
            violations: a.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
            })),
            incomplete: a.incomplete.map((v) => v.id),
          };
          expect(a.violations).toHaveLength(0);
          await p.keyboard.press("Tab");
          expect(
            await d.evaluate((e) => e.contains(document.activeElement)),
          ).toBe(true);
          await p.keyboard.press("Escape");
          await expect(button(p, "Open navigation")).toBeFocused();
          expect(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        }
        r.status = "passed";
      } catch (e) {
        r.status = "failed";
        r.reason = e.message.split("\n")[0];
      }
      results.push(r);
      await ctx.close();
      writeFileSync(
        "artifacts/verification/ui-r5/navigation-final.json",
        JSON.stringify(results, null, 2),
      );
      console.log(`${browserName} ${role}: ${r.status}`);
    }
  } finally {
    await b.close();
  }
}
