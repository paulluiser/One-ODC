import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  loadStagingEnvironment,
  stagingProject,
  quotationSpaces,
} from "../helpers/staging";
import { dashboardMetrics } from "../../src/lib/dashboard";
import type { Role } from "../../src/lib/domain";
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
test("5A all five live dashboards, matching drilldowns, Space shortcuts, isolation, themes and responsive keyboard access", async ({
  page,
}) => {
  test.setTimeout(240000);
  const p = await stagingProject("5A browser", id("DESIGNER"), id("OPS")),
    spaces = await quotationSpaces(p.id, id("DESIGNER"));
  const actors: [string, Role][] = [
    ["ADMIN", "system_administrator"],
    ["LEAD", "lead_designer"],
    ["DESIGNER", "designer"],
    ["BDM", "bdm"],
    ["OPS", "operations_admin"],
  ];
  for (const [actor, role] of actors) {
    await login(page, actor);
    const region = page.getByRole("region", { name: "Role KPIs", exact: true });
    await expect(region.locator(".metric-card")).toHaveCount(
      dashboardMetrics[role].length,
    );
    await expect(
      page.getByRole("heading", { name: "Action required", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Recent relevant activity",
        exact: true,
      }),
    ).toBeVisible();
    await accessible(page, `5A ${actor} dashboard light`, "phase5a");
    const metric =
      role === "designer"
        ? "assigned_spaces"
        : role === "lead_designer"
          ? "active_projects"
          : role === "bdm"
            ? "accepted_leads"
            : role === "operations_admin"
              ? "operational_projects"
              : "active_users";
    const card = region.locator(`a[href*="view=${metric}"]`);
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`view=${metric}`));
    const matching = page.getByRole("region", {
      name: "Matching KPI records",
      exact: true,
    });
    await expect(matching).toBeVisible();
    await page.reload();
    await openWorkspacePanels(page);
    await expect(matching).toBeVisible();
    if (role === "designer") {
      const target = matching.getByRole("link", {
        name: `Kitchen · ${p.name}`,
        exact: true,
      });
      await expect(target).toHaveCount(1);
      await target.click();
      await expect(page).toHaveURL(
        new RegExp(`/projects/${p.id}#space-${spaces[0]}$`),
      );
      await expect(page.locator(`#space-${spaces[0]}`)).toBeVisible();
      await page.goto("/dashboard?view=assigned_spaces");
      await openWorkspacePanels(page);
    }
    if (role === "operations_admin") {
      await expect(matching.getByText(p.name, { exact: false })).toHaveCount(0);
      await page.goto(`/dashboard/projects/${p.id}`);
      await openWorkspacePanels(page);
      await expect(
        page.getByRole("heading", { name: "Pipeline overview", exact: true }),
      ).toBeVisible();
      await page.goto("/dashboard?view=sale");
      await openWorkspacePanels(page);
      await expect(
        page.getByRole("region", { name: "Matching KPI records", exact: true }),
      ).toHaveCount(0);
      expect(await page.content()).not.toContain("Authorized Sale total");
    }
    if (role === "bdm") {
      expect(await page.content()).not.toContain("Current Raw:");
      await region.locator('a[href*="view=sale"]').click();
      await expect(
        page.getByRole("region", { name: "Matching KPI records" }),
      ).toContainText("Exact PostgreSQL sum");
    }
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await page.setViewportSize({ width: 360, height: 800 });
    await accessible(page, `5A ${actor} dashboard mobile dark`, "phase5a");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("dialog", { name: "Workspace navigation" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeFocused();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Use light theme" }).click();
  }
  await login(page, "OTHER_BDM");
  await page.goto("/dashboard?view=closed_projects");
  await openWorkspacePanels(page);
  expect(
    await page
      .getByRole("region", { name: "Matching KPI records" })
      .textContent(),
  ).not.toContain(p.name);
});
