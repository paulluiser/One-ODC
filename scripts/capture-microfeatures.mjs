import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, writeFileSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
  "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
const root = "artifacts/verification/microfeatures",
  f = JSON.parse(readFileSync(`${root}/fixture.json`, "utf8")),
  results = [];
const b = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const ctx = await b.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    }),
    p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto("http://localhost:3003/login");
  await expect(
    p.getByRole("button", { name: "Choose appearance", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await p.getByLabel("Work email").fill(process.env.ONE_ODC_TEST_LEAD_EMAIL);
  await p
    .getByLabel("Password", { exact: true })
    .fill(process.env.ONE_ODC_TEST_LEAD_PASSWORD);
  await p.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(p).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  for (const theme of ["Light", "Dark"]) {
    await p
      .getByRole("button", { name: "Choose appearance", exact: true })
      .click();
    await p.getByRole("button", { name: theme, exact: true }).click();
    await p
      .getByRole("button", { name: "Search workspace", exact: true })
      .click();
    await p.getByLabel("Search records").fill("Microfeatures");
    await expect(p.getByRole("dialog").getByRole("link").first()).toBeVisible();
    const search = await new AxeBuilder({ page: p }).analyze();
    results.push({
      screen: "search",
      theme,
      violations: search.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
      incomplete: search.incomplete.map((v) => v.id),
    });
    await p.screenshot({
      path: `${root}/search-${theme.toLowerCase()}-mobile.png`,
    });
    await p.keyboard.press("Escape");
    await p.goto(`http://localhost:3003/dashboard/projects/${f.target.id}`);
    const region = p.getByRole("region", { name: "Project productivity" });
    await region
      .locator("summary")
      .filter({ hasText: /^Discussion$/ })
      .click();
    await expect(
      region.getByRole("form", { name: "Project comment" }),
    ).toBeVisible();
    await region
      .locator("summary")
      .filter({ hasText: /^Space structure templates$/ })
      .click();
    await expect(
      region
        .getByLabel("Template", { exact: true })
        .locator(`option[value="${f.template}"]`),
    ).toHaveCount(1);
    await expect(
      region.getByRole("button", {
        name: "Save structure template",
        exact: true,
      }),
    ).toBeEnabled();
    const a = await new AxeBuilder({ page: p }).analyze();
    results.push({
      screen: "project tools",
      theme,
      violations: a.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
      incomplete: a.incomplete.map((v) => v.id),
    });
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await region.scrollIntoViewIfNeeded();
    await p.screenshot({
      path: `${root}/project-tools-${theme.toLowerCase()}-mobile.png`,
    });
    await region
      .getByLabel("Template", { exact: true })
      .scrollIntoViewIfNeeded();
    await p.screenshot({
      path: `${root}/template-${theme.toLowerCase()}-mobile.png`,
    });
  }
  await ctx.close();
} finally {
  await b.close();
  writeFileSync(`${root}/accessibility.json`, JSON.stringify(results, null, 2));
}
console.log(
  JSON.stringify({
    states: results.length,
    violations: results.reduce((sum, r) => sum + r.violations.length, 0),
    incomplete: results.reduce((sum, r) => sum + r.incomplete.length, 0),
  }),
);
