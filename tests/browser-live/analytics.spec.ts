import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  loadStagingEnvironment,
  stagingProject,
  quotationSpaces,
} from "../helpers/staging";
import { accessible } from "../helpers/accessibility";
loadStagingEnvironment();
const accounts = JSON.parse(
  readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
).accounts as { actor: string; id: string }[];
const id = (actor: string) => accounts.find((a) => a.actor === actor)!.id;
async function login(page: Page, actor: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await openWorkspacePanels(page);
  await page
    .getByLabel("Work email")
    .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]!);
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
test("5B analytics filters, chart drilldowns, all five roles, refresh, responsive themes and keyboard", async ({
  page,
}) => {
  test.setTimeout(240000);
  const p = await stagingProject("5B browser", id("DESIGNER"), id("OPS"));
  await quotationSpaces(p.id, id("DESIGNER"));
  for (const actor of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"]) {
    await login(page, actor);
    await page
      .getByRole("link", { name: "Project analytics →", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Project analytics", exact: true }),
    ).toBeVisible();
    const cards = page.getByRole("region", {
      name: "Analytics KPIs",
      exact: true,
    });
    await expect(cards).toBeVisible();
    if (["DESIGNER", "OPS"].includes(actor))
      await expect(
        cards.getByText("Current authorized Sale", { exact: true }),
      ).toHaveCount(0);
    await page.locator(".analytics-filter-disclosure > summary").click();
    if (actor === "OPS")
      await expect(page.getByLabel("Brand", { exact: true })).toBeDisabled();
    await page
      .getByLabel("Current project stage", { exact: true })
      .selectOption("For Quotation");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page).toHaveURL(/stage=For\+Quotation/);
    const lifecycle = page.getByRole("region", {
      name: "Current lifecycle distribution",
      exact: true,
    });
    if (actor !== "OPS") {
      const bar = lifecycle.getByRole("link", { name: /For Quotation/ });
      await expect(bar).toBeVisible();
      const displayed = await bar.locator("span").textContent();
      await bar.focus();
      await page.keyboard.press("Enter");
      const matching = page.getByRole("region", {
        name: "Matching analytics records",
        exact: true,
      });
      await expect(matching).toContainText(`${displayed} matching records`);
      await page.reload();
      await openWorkspacePanels(page);
      await expect(matching).toBeVisible();
    } else await expect(lifecycle).toContainText("No matching records.");
    await accessible(page, `5B ${actor} analytics light`, "phase5b");
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await page.setViewportSize({ width: 360, height: 800 });
    await accessible(page, `5B ${actor} analytics mobile dark`, "phase5b");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Use light theme" }).click();
  }
  await login(page, "OTHER_BDM");
  await page.goto("/dashboard/analytics?view=projects");
  await openWorkspacePanels(page);
  await expect(
    page
      .getByRole("region", { name: "Matching analytics records", exact: true })
      .getByText(p.name, { exact: true }),
  ).toHaveCount(0);
  await page.goto("/dashboard/analytics?from=2025-02-30&to=2025-03-01");
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid analytics filters" }),
  ).toContainText("Invalid analytics filters");
  await page.getByRole("link", { name: "Reset filters", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Analytics KPIs", exact: true }),
  ).toBeVisible();
});
