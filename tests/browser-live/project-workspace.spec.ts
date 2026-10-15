import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  loadStagingEnvironment,
  verifyProjectMembership,
  stagingProject,
} from "../helpers/staging";
loadStagingEnvironment();
const accounts = JSON.parse(
  readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
).accounts as { actor: string; id: string }[];
const id = (actor: string) => accounts.find((a) => a.actor === actor)!.id;
async function login(page: Page, actor: string) {
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
test("2A scoped directory filters, real overview, audited UI reassignment and responsive project workspace", async ({
  page,
}) => {
  test.setTimeout(180000);
  const project = await stagingProject(
    "2A staging 50%_scope",
    id("DESIGNER"),
    id("OPS"),
  );
  await login(page, "LEAD");
  await page.goto("/dashboard/projects");
  await openWorkspacePanels(page);
  await page.getByLabel("Search projects", { exact: true }).fill(project.name);
  await page
    .getByLabel("Commercial stage", { exact: true })
    .selectOption("For Quotation");
  await page.getByLabel("Sort projects", { exact: true }).selectOption("name");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByRole("link", { name: project.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: project.name, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Project overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Your project membership", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorkspacePanels(page);
  const assignments = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save assignments", exact: true }),
  });
  await assignments
    .getByLabel("Primary Designer", { exact: false })
    .selectOption(id("UNASSIGNED"));
  await assignments
    .getByLabel("Change reason", { exact: false })
    .fill("2A staging UI reassignment");
  await page
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(
    page.getByText("Assignments saved. Assignment history has been preserved."),
  ).toBeVisible();
  expect(await verifyProjectMembership(project.id)).toEqual({
    history: 2,
    DESIGNER: 0,
    OTHER_BDM: 0,
    UNASSIGNED: 1,
  });
  await page.goto(
    `/dashboard/projects?q=${encodeURIComponent(project.name)}&stage=Closed`,
  );
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "No matching projects", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects$/);
  await expect(page.getByLabel("Search projects", { exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "BDM");
  await page.goto(`/dashboard/projects/${project.id}`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: project.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Project assignments", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "OPS");
  await page.goto(`/dashboard/projects/${project.id}`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Pipeline overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Project overview", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Project assignments", exact: true }),
  ).toHaveCount(0);
});
