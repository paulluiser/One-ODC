import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadStagingEnvironment } from "../helpers/staging";
loadStagingEnvironment();
const root = "artifacts/verification/ui-r1";
mkdirSync(root, { recursive: true });
mkdirSync(`${root}/regression`, { recursive: true });
for (const actor of ["ADMIN", "DESIGNER", "BDM", "OPS", "LEAD"])
  test(`${actor}: dashboard, Analytics, filters, keyboard, themes and six responsive states`, async ({
    page,
  }) => {
    await page.goto("/login");
    await page
      .getByLabel("Work email")
      .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]!);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]!);
    await page
      .getByRole("button", { name: "Sign in to your workspace" })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("region", {
        name: actor === "LEAD" ? "Lead Designer key metrics" : "Role KPIs",
        exact: true,
      }),
    ).toBeVisible();
    if (actor !== "LEAD") {
      await expect(
        page.getByRole("heading", { name: "Action required", exact: true }),
      ).toBeVisible();
      const kpis = page.getByRole("region", { name: "Role KPIs", exact: true });
      await expect(kpis.getByRole("link")).toHaveCount(4);
      await kpis.getByRole("link").first().click();
      await expect(
        page.getByRole("region", { name: "Matching KPI records", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "Close results", exact: true })
        .click();
    }
    const evidence: unknown[] = [];
    for (const screen of ["dashboard", "analytics"]) {
      if (screen === "analytics") {
        await page
          .getByRole("link", { name: "Analytics", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Project analytics", exact: true }),
        ).toBeVisible();
      }
      for (const theme of ["light", "dark"]) {
        await page
          .getByRole("button", { name: "Choose appearance", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: theme === "light" ? "Light" : "Dark",
            exact: true,
          })
          .click();
        for (const [size, width, height] of [
          ["desktop", 1440, 900],
          ["laptop", 1280, 800],
          ["mobile", 390, 844],
        ] as const) {
          await page.setViewportSize({ width, height });
          await expect(page.locator("html")).toHaveClass(
            theme === "dark" ? /dark/ : /light/,
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: `${root}/regression/${actor.toLowerCase()}-${screen}-${theme}-${size}.png`,
            fullPage: false,
          });
          if (size === "mobile") {
            const result = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            evidence.push({
              screen,
              theme,
              violations: result.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                targets: v.nodes.map((n) => n.target),
              })),
              incomplete: result.incomplete.map((v) => v.id),
            });
            expect.soft(result.violations.map((v) => v.id)).toEqual([]);
          }
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    writeFileSync(
      `${root}/${actor.toLowerCase()}-accessibility.json`,
      JSON.stringify(evidence, null, 2),
    );
    await page.locator("summary").filter({ hasText: "Filters" }).click();
    if (actor === "OPS")
      await expect(page.getByLabel("Brand", { exact: true })).toBeDisabled();
    await page
      .getByLabel("Current project stage", { exact: true })
      .selectOption("For Quotation");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page).toHaveURL(/stage=For\+Quotation/);
    await expect(
      page.locator("summary").filter({ hasText: "Filters" }),
    ).toContainText("For Quotation");
    const lifecycle = page.getByRole("region", {
      name: "Current lifecycle distribution",
      exact: true,
    });
    await expect(lifecycle).toBeVisible();
    const link = lifecycle.getByRole("link").first();
    if (await link.count()) {
      await link.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("region", {
          name: "Matching analytics records",
          exact: true,
        }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("region", {
          name: "Matching analytics records",
          exact: true,
        }),
      ).toBeVisible();
    } else await expect(lifecycle).toContainText("No matching records");
    await page.goto("/dashboard/analytics?from=2025-02-30&to=2025-03-01");
    await expect(
      page.getByRole("alert").filter({ hasText: "Invalid analytics filters" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Reset filters", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Project analytics", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Workspace navigation", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Choose appearance", exact: true })
      .click();
    await page.getByRole("button", { name: "System", exact: true }).click();
    await page.reload();
    await page
      .getByRole("button", { name: "Choose appearance", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "System", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

test("BDM dashboard and empty authorized Analytics filter stay readable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page
    .getByLabel("Work email")
    .fill(process.env.ONE_ODC_TEST_OTHER_BDM_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.ONE_ODC_TEST_OTHER_BDM_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("region", { name: "Action required", exact: true }),
  ).toBeVisible();
  await page.goto("/dashboard/analytics?from=2000-01-01&to=2000-01-31");
  await expect(
    page.getByRole("region", { name: "Analytics KPIs", exact: true }),
  ).toContainText("Not Available");
  await expect(
    page.getByRole("region", {
      name: "Current lifecycle distribution",
      exact: true,
    }),
  ).toContainText("No matching records");
  for (const theme of ["Light", "Dark"]) {
    await page
      .getByRole("button", { name: "Choose appearance", exact: true })
      .click();
    await page.getByRole("button", { name: theme, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${root}/unrelated-bdm-empty-${theme.toLowerCase()}-mobile.png`,
    });
  }
});

test("Analytics complete filters persist after refresh and reset", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("Work email")
    .fill(process.env.ONE_ODC_TEST_ADMIN_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.ONE_ODC_TEST_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Project analytics", exact: true }),
  ).toBeVisible();
  await page.locator("summary").filter({ hasText: "Filters" }).click();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
  }).format(new Date());
  await page.getByLabel("From", { exact: true }).fill(today);
  await page.getByLabel("Through", { exact: true }).fill(today);
  await page.getByLabel("Brand", { exact: true }).selectOption("SFY");
  const person = await page
    .getByLabel("Assigned stakeholder", { exact: true })
    .locator("option")
    .nth(1)
    .getAttribute("value");
  expect(person).toBeTruthy();
  await page
    .getByLabel("Assigned stakeholder", { exact: true })
    .selectOption(person!);
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.locator("summary").filter({ hasText: "Filters" }),
  ).toContainText("SFY");
  expect(new URL(page.url()).searchParams.get("from")).toBe(today);
  expect(new URL(page.url()).searchParams.get("stakeholder")).toBe(person);
  await page.reload();
  await expect(page.getByLabel("Brand", { exact: true })).toHaveValue("SFY");
  await expect(
    page.getByLabel("Assigned stakeholder", { exact: true }),
  ).toHaveValue(person!);
  await page.getByRole("link", { name: "Reset", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/analytics$/);
  await expect(
    page.getByRole("region", { name: "Analytics KPIs", exact: true }),
  ).toBeVisible();
});
