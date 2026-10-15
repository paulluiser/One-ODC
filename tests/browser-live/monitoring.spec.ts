import { openWorkspacePanels } from "../helpers/workspace-ui";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadStagingEnvironment, stagingProject } from "../helpers/staging";
import { localDate } from "../../src/lib/monitoring";
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
test("2C live progress, controlled hold/resume/cancel dialogs, activity corrections/filters, risk, themes and mobile", async ({
  page,
}) => {
  const project = await stagingProject("2C browser", id("DESIGNER"), id("OPS"));
  const url = `/dashboard/projects/${project.id}`;
  const form = (name: string) =>
    page
      .locator("form")
      .filter({ has: page.getByRole("button", { name, exact: true }) });
  const summary = (text: string) =>
    page.locator("summary").filter({ hasText: new RegExp(`^${text}$`) });
  await login(page, "LEAD");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByText("Not Available · 0 of 0 active spaces completed"),
  ).toBeVisible();
  await summary("Create a space").click();
  const create = form("Create space");
  await create.getByLabel("Space name", { exact: true }).fill("Monitored room");
  await create
    .getByLabel("Primary Designer", { exact: true })
    .selectOption(id("DESIGNER"));
  await create.getByLabel("Design deadline").fill("2026-10-01");
  await create
    .getByLabel("Reason", { exact: true })
    .fill("Actual project scope");
  await create
    .getByRole("button", { name: "Create space", exact: true })
    .click();
  await expect(
    page.getByText("0.0% · 0 of 1 active spaces completed"),
  ).toBeVisible();
  await summary("Project controls and deadline revisions").click();
  const deadline = form("Save project deadline");
  await deadline
    .getByLabel("Project deadline", { exact: true })
    .fill("2026-11-30");
  await deadline
    .getByLabel("Change reason", { exact: true })
    .fill("Client target confirmed");
  await deadline.getByRole("button", { name: "Save project deadline" }).click();
  await expect(deadline.getByText("Change saved with history.")).toBeVisible();
  const hold = form("Hold Project");
  await hold
    .getByLabel("Change reason", { exact: true })
    .fill("Awaiting client decision");
  await hold.getByRole("button", { name: "Hold Project", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Hold Project" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    hold.getByRole("button", { name: "Hold Project", exact: true }),
  ).toBeFocused();
  await hold.getByRole("button", { name: "Hold Project", exact: true }).click();
  await page.getByRole("button", { name: "Confirm hold", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Project", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("dd").filter({ hasText: /^On Hold$/ }),
  ).toBeVisible();
  await expect(
    page.locator("summary").filter({ hasText: /^Change design status$/ }),
  ).toHaveCount(0);
  const resume = form("Resume Project");
  await resume
    .getByLabel("Change reason", { exact: true })
    .fill("Client approves restart");
  await resume
    .getByRole("button", { name: "Resume Project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm resume", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Hold Project", exact: true }),
  ).toBeVisible();
  const coordinator = form("Add Site Coordinator");
  await coordinator
    .getByLabel("Site Coordinator name")
    .fill("Reference site coordinator");
  await coordinator
    .getByLabel("Change reason", { exact: true })
    .fill("Site responsibility");
  await coordinator
    .getByRole("button", { name: "Add Site Coordinator" })
    .click();
  await expect(
    coordinator.getByText("Change saved with history."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "DESIGNER");
  await page.goto(url);
  await openWorkspacePanels(page);
  await summary("Record project activity").click();
  const activity = form("Record activity");
  await activity.getByLabel("Activity category").selectOption("Site Visit");
  await activity
    .getByLabel("Actual activity date")
    .fill(localDate(new Date().toISOString()));
  await activity.getByLabel("Activity space").selectOption({ index: 1 });
  await activity
    .getByLabel("Activity description")
    .fill("Measured site opening");
  await activity
    .getByLabel("Tagged Site Coordinator")
    .selectOption({ label: "Reference site coordinator" });
  await activity
    .getByLabel("Change reason", { exact: true })
    .fill("Recorded actual site visit");
  await activity
    .getByRole("button", { name: "Record activity", exact: true })
    .click();
  await expect(activity.getByText("Change saved with history.")).toBeVisible();
  await expect(
    page.getByText("Measured site opening", { exact: true }).first(),
  ).toBeVisible();
  await summary(
    "Manual activity corrections \\(latest 50 activities\\)",
  ).click();
  await page
    .locator("summary")
    .filter({ hasText: /^Site Visit · .* · Version 1$/ })
    .click();
  const correction = form("Save activity correction");
  await correction
    .getByLabel("Activity description")
    .fill("Corrected site dimension");
  await correction
    .getByLabel("Change reason", { exact: true })
    .fill("Corrected measurement transcription");
  await correction
    .getByRole("button", { name: "Save activity correction", exact: true })
    .click();
  await expect(
    page
      .locator("summary")
      .filter({ hasText: /^Site Visit · .* · Version 2$/ }),
  ).toBeVisible();
  await page.getByLabel("Timeline category").selectOption("Site Visit");
  await page.getByLabel("From date").fill(localDate(new Date().toISOString()));
  await page.getByLabel("To date").fill(localDate(new Date().toISOString()));
  await page.getByLabel("Timeline actor").selectOption(id("DESIGNER"));
  await page.getByLabel("Timeline space").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Filter timeline" }).click();
  await expect(
    page.getByText("Corrected site dimension", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Clear timeline filters" }).click();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
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
  await expect(
    page.getByRole("heading", { name: "Project monitoring" }),
  ).toBeVisible();
  await expect(summary("Record project activity")).toHaveCount(0);
  await expect(
    page.getByText("Corrected site dimension", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "OPS");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Project monitoring" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "LEAD");
  await page.goto(url);
  await openWorkspacePanels(page);
  await summary("Project controls and deadline revisions").click();
  const cancel = form("Cancel Project");
  await cancel
    .getByLabel("Change reason", { exact: true })
    .fill("Synthetic project scope cancelled");
  await cancel
    .getByRole("button", { name: "Cancel Project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancel", exact: true })
    .click();
  await expect(
    page.locator("dd").filter({ hasText: /^Cancelled$/ }),
  ).toBeVisible();
  await expect(summary("Project controls and deadline revisions")).toHaveCount(
    0,
  );
  await expect(summary("Create a space")).toHaveCount(0);
  await expect(summary("Edit space")).toHaveCount(0);
  await expect(
    page.getByText(
      "This project is cancelled. Space records and history are read-only.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Corrected site dimension", { exact: true }).first(),
  ).toBeVisible();
  await page.goto(`/dashboard/projects?q=${encodeURIComponent(project.name)}`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("row").filter({
      has: page.getByRole("link", { name: project.name, exact: true }),
    }),
  ).toContainText("Cancelled");
});

test("2C seeded completed cycle reopens with audited history and rejects repeated active reopen", async ({
  page,
}) => {
  const fixture = JSON.parse(
    readFileSync(
      "artifacts/verification/monitoring-completed-fixture.json",
      "utf8",
    ),
  );
  await login(page, "LEAD");
  await page.goto(`/dashboard/projects/${fixture.id}`);
  await openWorkspacePanels(page);
  await page
    .locator("summary")
    .filter({ hasText: /^Project controls and deadline revisions$/ })
    .click();
  const reopen = page.getByRole("button", {
    name: "Reopen Project",
    exact: true,
  });
  // The completed fixture may have been reopened by an earlier successful staging run.
  if (await reopen.count()) {
    const form = page.locator("form").filter({ has: reopen });
    await form
      .getByLabel("Change reason", { exact: true })
      .fill("Additional client work after original completion");
    await reopen.click();
    await expect(
      page.getByRole("dialog", { name: "Reopen Project" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Confirm reopen", exact: true })
      .click();
  }
  await expect(
    page.getByRole("button", { name: "Hold Project", exact: true }),
  ).toBeVisible();
  await expect(reopen).toHaveCount(0);
  await page
    .locator("summary")
    .filter({ hasText: /^Operational cycle and hold history$/ })
    .click();
  await expect(page.getByText(/^Cycle 1: .* · Completed$/)).toBeVisible();
  await expect(page.getByText(/^Cycle 2: .* · Open$/)).toBeVisible();
  await expect(
    page.getByText(/project.reopen: Additional client work/),
  ).toBeVisible();
});
