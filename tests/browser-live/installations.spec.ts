import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  loadStagingEnvironment,
  stagingProject,
  installationSetup,
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
async function save(
  page: Page,
  article: Locator,
  status: string,
  reason: string,
  date?: string,
) {
  const summary = article
    .locator("summary")
    .filter({ hasText: /^Schedule or update installation$/ });
  await expect(summary).toBeVisible();
  if ((await summary.locator("..").getAttribute("open")) === null)
    await summary.click();
  const form = article.getByRole("form", { name: "Save installation" });
  await form
    .getByLabel("Installation status", { exact: true })
    .selectOption(status);
  if (date) await form.getByLabel("Scheduled installation date").fill(date);
  await form.getByLabel("Change reason").fill(reason);
  await form
    .getByRole("button", { name: "Save installation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm installation change", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(article.getByRole("heading")).toContainText(status);
}
test("4C authenticated installation schedule, revision, completion, reopening and responsive role access", async ({
  page,
}) => {
  test.setTimeout(240000);
  const p = await stagingProject("4C browser", id("DESIGNER"), id("OPS"));
  const setup = await installationSetup(p.id, id("DESIGNER"), id("OPS"));
  const url = `/dashboard/projects/${p.id}`;
  await login(page, "DESIGNER");
  await page.goto(url);
  await openWorkspacePanels(page);
  await page.getByRole("link", { name: "Installation", exact: true }).click();
  const first = page.locator(`#installation-${setup.spaces[0]}`),
    second = page.locator(`#installation-${setup.spaces[1]}`);
  await expect(second.getByRole("form")).toHaveCount(0);
  await save(page, first, "Scheduled", "Initial schedule", "2026-10-20");
  await save(page, first, "Scheduled", "Client reschedule", "2026-10-21");
  await save(page, first, "In Progress", "");
  await save(page, first, "Completed", "");
  await page.reload();
  await openWorkspacePanels(page);
  await expect(first.getByRole("heading")).toContainText("Completed");
  await save(page, first, "In Progress", "Installation correction");
  await save(page, first, "Completed", "");
  await login(page, "OPS");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("link", { name: "Installation", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("link", { name: "Installation", exact: true }).click();
  await save(page, second, "Not Applicable", "No installation needed");
  await expect(
    page.getByRole("button", {
      name: "Confirm Operational Completion",
      exact: true,
    }),
  ).toHaveCount(0);
  await login(page, "BDM");
  await page.goto(`${url}?tab=installation`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("form", { name: "Save installation" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Ready for operational completion", { exact: true }),
  ).toBeVisible();
  await login(page, "LEAD");
  await page.goto(`${url}?tab=installation`);
  await openWorkspacePanels(page);
  await accessible(page, "4C ready light", "phase4c");
  const complete = page.getByRole("form", {
    name: "Confirm Operational Completion",
  });
  await complete
    .getByLabel("Required completion reason")
    .fill("Checklist verified, balances may remain");
  await complete
    .getByRole("button", {
      name: "Confirm Operational Completion",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Outstanding payments");
  await page
    .getByRole("button", { name: "Confirm completion", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", {
        name: "Installation and operational readiness",
        exact: true,
      })
      .getByText("Operationally Completed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("form", { name: "Save installation" }),
  ).toHaveCount(0);
  await page.reload();
  await openWorkspacePanels(page);
  await expect(
    page
      .getByRole("region", {
        name: "Installation and operational readiness",
        exact: true,
      })
      .getByText("Operationally Completed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Reopen through Project monitoring controls" })
    .click();
  await page
    .getByText("Project controls and deadline revisions", { exact: true })
    .click();
  const reopen = page.getByRole("button", {
    name: "Reopen Project",
    exact: true,
  });
  const control = reopen.locator("xpath=ancestor::form");
  await control
    .getByLabel("Change reason")
    .fill("Additional installation correction");
  await reopen.click();
  await page
    .getByRole("button", { name: "Confirm reopen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(`${url}?tab=installation`);
  await openWorkspacePanels(page);
  await expect(first.getByRole("heading")).toContainText("Completed");
  await expect(
    page.getByText("Ready for operational completion", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await accessible(page, "4C reopened mobile dark", "phase4c");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await login(page, "OTHER_BDM");
  await page.goto(`${url}?tab=installation`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", {
      name: "This space is still uncharted.",
      exact: true,
    }),
  ).toBeVisible();
});
