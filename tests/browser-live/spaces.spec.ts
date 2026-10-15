import { openWorkspacePanels } from "../helpers/workspace-ui";
import { accessible } from "../helpers/accessibility";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadStagingEnvironment, stagingProject } from "../helpers/staging";
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
test("2B real spaces, Designer submission, Lead completion/revision, bulk/cancel, read-only monitoring and mobile", async ({
  page,
}) => {
  const project = await stagingProject("2B browser", id("DESIGNER"), id("OPS"));
  const url = `/dashboard/projects/${project.id}`;
  await login(page, "LEAD");
  await page.goto(url);
  await openWorkspacePanels(page);
  await page.getByText("Create a space", { exact: true }).click();
  const create = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create space", exact: true }),
  });
  for (let i = 0; i < 2; i++) {
    await create.getByLabel("Space name", { exact: true }).fill("Kitchen");
    await create
      .getByLabel("Primary Designer", { exact: true })
      .selectOption(id("DESIGNER"));
    await create.getByLabel("Design deadline").fill("2026-11-30");
    await create
      .getByLabel("Reason", { exact: true })
      .fill("Initial design scope");
    await create
      .getByRole("button", { name: "Create space", exact: true })
      .click();
    await expect(page.locator(".space-card")).toHaveCount(i + 1);
  }
  await expect(create.getByText("Space saved.", { exact: true })).toBeVisible();
  const first = page.locator(".space-card").first();
  await first.getByText("Edit space", { exact: true }).click();
  const edit = first.locator("form").filter({
    has: page.getByRole("button", { name: "Save space", exact: true }),
  });
  await edit.getByLabel("Space name", { exact: true }).fill("Kitchen West");
  await edit
    .getByLabel("Reason", { exact: true })
    .fill("Clarify room location");
  await edit.getByRole("button", { name: "Save space", exact: true }).click();
  await expect(
    first.getByRole("heading", { name: "Kitchen West" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "DESIGNER");
  await page.goto(url);
  await openWorkspacePanels(page);
  await first.getByText("Change design status", { exact: true }).click();
  const status = first.locator("form").filter({
    has: page.getByRole("button", { name: "Update status", exact: true }),
  });
  for (const next of ["In Progress", "Submitted"]) {
    await status.getByLabel("Next design status").selectOption(next);
    await status.getByLabel("Reason", { exact: true }).fill("Designer update");
    await status
      .getByRole("button", { name: "Update status", exact: true })
      .click();
    await expect(
      first.getByText(`${next} · Revision 0`, { exact: true }),
    ).toBeVisible();
  }
  await expect(first.getByText("Awaiting Lead Designer review.")).toBeVisible();
  await expect(
    page.getByText("Bulk reassignment", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "LEAD");
  await page.goto(url);
  await openWorkspacePanels(page);
  await first.getByText("Change design status", { exact: true }).click();
  await status.getByLabel("Next design status").selectOption("Completed");
  await status
    .getByLabel("Reason", { exact: true })
    .fill("External approval received");
  await status
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await expect(status.getByRole("alert")).toContainText(
    "completion approval is missing",
  );
  await accessible(page, "completion rejection error and retry");
  await expect(status.getByLabel("Next design status")).toHaveValue(
    "Completed",
  );
  await status
    .getByLabel("External approval reference")
    .fill("Client email: staging proof");
  await status
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await expect(
    first.getByText("Completed · Revision 0", { exact: true }),
  ).toBeVisible();
  await status.getByLabel("Next design status").selectOption("For Revision");
  await status
    .getByLabel("Reason", { exact: true })
    .fill("Client requests revised finish");
  await status
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await expect(
    first.getByText("For Revision · Revision 1", { exact: true }),
  ).toBeVisible();
  await expect(first.getByText("First / latest completion")).toBeVisible();
  await page.getByText("Bulk reassignment", { exact: true }).click();
  const bulk = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Reassign selected spaces",
      exact: true,
    }),
  });
  await bulk.locator('input[name="spaces"]').first().check();
  await bulk.locator('input[name="spaces"]').last().check();
  await bulk
    .getByLabel("Primary Designer", { exact: true })
    .selectOption(id("LEAD"));
  await bulk
    .getByLabel("Reason", { exact: true })
    .fill("Lead takes responsibility");
  await bulk
    .getByRole("button", { name: "Reassign selected spaces", exact: true })
    .click();
  await expect(
    bulk.getByText("Selected spaces reassigned together."),
  ).toBeVisible();
  const second = page.locator(".space-card").last();
  await second
    .locator("summary")
    .filter({ hasText: /^Cancel space$/ })
    .click();
  const cancel = second.locator("form").filter({
    has: page.getByRole("button", { name: "Cancel space", exact: true }),
  });
  await cancel
    .getByLabel("Reason", { exact: true })
    .fill("Client removed room scope");
  await cancel
    .getByRole("button", { name: "Cancel space", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Cancel space: Kitchen", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    cancel.getByRole("button", { name: "Cancel space", exact: true }),
  ).toBeFocused();
  await cancel
    .getByRole("button", { name: "Cancel space", exact: true })
    .click();
  await accessible(page, "space cancellation confirmation");
  await page
    .getByRole("button", { name: "Confirm space cancellation", exact: true })
    .click();
  await expect(
    second.getByText("Cancelled · Revision 0", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1 active · 1 cancelled/)).toBeVisible();
  await page
    .getByText("Space history (latest 100 events)", { exact: true })
    .click();
  await expect(
    page.getByText(/space.cancelled · Client removed room scope/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    first.getByRole("heading", { name: "Kitchen West" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "BDM");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(page.locator(".space-card")).toHaveCount(2);
  await expect(page.getByText("Edit space", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "OPS");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByText("Limited pipeline preview", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Spaces", exact: true }),
  ).toHaveCount(0);
});
