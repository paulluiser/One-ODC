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
test("4A real BDM closure activates scoped Ops workspace, acknowledgment and persisted history", async ({
  page,
}) => {
  test.setTimeout(240000);
  const project = await stagingProject("4A browser", id("DESIGNER"), id("OPS"));
  await quotationSpaces(project.id, id("DESIGNER"));
  const url = `/dashboard/projects/${project.id}`;
  await login(page, "OPS");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Pipeline overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Operational handoff", exact: true }),
  ).toHaveCount(0);
  await login(page, "BDM");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("button", { name: "Close Sale", exact: true }),
  ).toBeDisabled();
  await page.goto(`${url}?tab=finance`);
  await openWorkspacePanels(page);
  const sale = page.getByRole("form", { name: "Save Sale", exact: true });
  await sale.getByLabel("Sale amount (PHP)").fill("92738.61");
  await sale.getByRole("button", { name: "Save Sale", exact: true }).click();
  await page.getByRole("button", { name: "Confirm financial change" }).click();
  await expect(page.getByText("Current Sale:")).toContainText("₱92,738.61");
  await page.goto(url);
  await openWorkspacePanels(page);
  await page.getByRole("button", { name: "Close Sale", exact: true }).click();
  await accessible(page, "4A close confirmation", "phase4a");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Close Sale", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Close Sale", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm Close Sale", exact: true })
    .click();
  const handoff = page.getByRole("region", {
    name: "Commercial closure and operational handoff",
  });
  await expect(
    handoff.getByText("Pending Acknowledgment", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close Sale", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await openWorkspacePanels(page);
  await expect(
    handoff.getByText("Sale at closure:", { exact: false }),
  ).toContainText("₱92,738.61");
  await login(page, "OPS");
  await page.goto("/dashboard/notifications");
  await openWorkspacePanels(page);
  await expect(
    page
      .getByText("Operational handoff #1 is pending your acknowledgment.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toBeVisible();
  const opsHandoff = page.getByRole("region", {
    name: "Commercial closure and operational handoff",
  });
  await expect(
    opsHandoff.getByRole("heading", {
      name: "Operational handoff",
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.content()).not.toContain("92738.61");
  expect(await page.content()).not.toContain("92,738.61");
  await page
    .getByRole("button", { name: "Acknowledge Handoff", exact: true })
    .click();
  await accessible(page, "4A Ops acknowledgment dialog", "phase4a");
  await page
    .getByRole("button", { name: "Confirm acknowledgment", exact: true })
    .click();
  await expect(
    opsHandoff.getByText("Acknowledged", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("button", { name: "Acknowledge Handoff", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await accessible(page, "4A acknowledged Ops dark mobile", "phase4a");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?tab=finance`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("form", { name: "Save Raw", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sale", exact: true }),
  ).toHaveCount(0);
  await page.goto(`${url}?tab=quotation`);
  await openWorkspacePanels(page);
  await expect(page.getByText("Saved project total:")).toHaveCount(0);
  await login(page, "DESIGNER");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("button", { name: "Close Sale", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Acknowledge Handoff", exact: true }),
  ).toHaveCount(0);
});
