import { openWorkspacePanels } from "../helpers/workspace-ui";
import { accessible } from "../helpers/accessibility";
import { expect, test, type Page } from "@playwright/test";
import { localDate } from "../../src/lib/monitoring";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk")
  throw new Error("Staging browser target is not authorized.");
const actors = JSON.parse(
  readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
).accounts as { actor: string; id: string }[];
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
test("real BDM draft attachment upload/download/archive/restore, submission and Lead acceptance", async ({
  page,
}) => {
  test.setTimeout(180000);
  await login(page, "BDM");
  await page.goto("/dashboard/leads/new");
  await openWorkspacePanels(page);
  await accessible(page, "BDM lead creation form");
  const name = `Staging browser ${randomUUID()}`;
  await page
    .getByLabel("Project Name / Client Name", { exact: false })
    .fill(name);
  await page
    .getByLabel("Address", { exact: false })
    .fill(`Synthetic browser verification address ${name}`);
  await page.getByLabel("Estimated Cabinetries", { exact: false }).fill("3");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/leads\/[0-9a-f-]+$/);
  const leadUrl = page.url();
  const leadId = leadUrl.split("/").at(-1)!;
  await page.getByLabel("File to upload or resume").setInputFiles({
    name: "staging-browser.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("One ODC actual staging browser upload"),
  });
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(
    page.getByText("File uploaded and verified in private storage."),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("button", { name: "Get download link" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get download link" }).click();
  const link = page.getByRole("link", { name: "Download authorized file" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  const file = await page.request.get(href!);
  expect(file.ok()).toBe(true);
  expect(await file.text()).toBe("One ODC actual staging browser upload");
  await page
    .getByLabel("Archive / restore reason")
    .fill("Staging browser archive verification");
  await page
    .getByRole("button", { name: "Archive attachment", exact: true })
    .click();
  await expect(
    page
      .locator(".attachment-record > summary")
      .filter({ hasText: "Archived" }),
  ).toBeVisible();
  await page
    .locator(".attachment-record > summary")
    .filter({ hasText: "Archived" })
    .click();
  await page
    .getByLabel("Archive / restore reason")
    .fill("Staging browser restore verification");
  await page
    .getByRole("button", { name: "Restore attachment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Get download link" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit lead", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Request details", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, "LEAD");
  await page.goto(`/dashboard/leads/${leadId}`);
  await openWorkspacePanels(page);
  await accessible(page, "Lead review and assignment form");
  await page
    .getByLabel("Review decision", { exact: true })
    .selectOption("Accepted");
  await page
    .getByLabel("Primary Designer", { exact: false })
    .selectOption(actors.find((a) => a.actor === "DESIGNER")!.id);
  await page
    .getByRole("button", { name: "Accept and create Project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Project team", exact: true }),
  ).toBeVisible();
  // Continue the same actual BDM submission through design and monitoring acceptance.
  const projectUrl = page.url();
  const form = (name: string) =>
    page
      .locator("form")
      .filter({ has: page.getByRole("button", { name, exact: true }) });
  const support = actors.find((a) => a.actor === "UNASSIGNED")!.id;
  await openWorkspacePanels(page);
  const assignments = form("Save assignments");
  await assignments
    .locator(`input[name="support"][value="${support}"]`)
    .check();
  await assignments
    .getByLabel("Change reason", { exact: false })
    .fill("Supporting Designer for end-to-end acceptance");
  await assignments
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(
    assignments.getByText(
      "Assignments saved. Assignment history has been preserved.",
    ),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Create a space$/ })
    .click();
  const create = form("Create space");
  await create
    .getByLabel("Space name", { exact: true })
    .fill("Integrated kitchen");
  await create
    .getByLabel("Primary Designer", { exact: true })
    .selectOption(actors.find((a) => a.actor === "DESIGNER")!.id);
  await create.locator(`input[name="support"][value="${support}"]`).check();
  await create
    .getByLabel("Reason", { exact: true })
    .fill("Independent design scope");
  await create
    .getByRole("button", { name: "Create space", exact: true })
    .click();
  await expect(page.locator(".space-card")).toHaveCount(1);
  await page.reload();
  await openWorkspacePanels(page);
  await expect(
    page.getByText("0.0% · 0 of 1 active spaces completed"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "DESIGNER");
  await page.goto(projectUrl);
  await openWorkspacePanels(page);
  await page
    .locator("summary")
    .filter({ hasText: /^Change design status$/ })
    .click();
  for (const next of ["In Progress", "Submitted"]) {
    const status = form("Update status");
    await status.getByLabel("Next design status").selectOption(next);
    await status
      .getByLabel("Reason", { exact: true })
      .fill("Designer actual progress");
    await status
      .getByRole("button", { name: "Update status", exact: true })
      .click();
    await expect(
      page
        .locator(".space-card")
        .getByText(`${next} · Revision 0`, { exact: true }),
    ).toBeVisible();
  }
  await page
    .locator("summary")
    .filter({ hasText: /^Record project activity$/ })
    .click();
  const activity = form("Record activity");
  await activity.getByLabel("Activity category").selectOption("General Update");
  await activity
    .getByLabel("Actual activity date")
    .fill(localDate(new Date().toISOString()));
  await activity
    .getByLabel("Activity description")
    .fill("Integrated design submitted for client approval");
  await activity
    .getByLabel("Change reason", { exact: true })
    .fill("Recorded actual project update");
  await activity
    .getByRole("button", { name: "Record activity", exact: true })
    .click();
  await expect(activity.getByText("Change saved with history.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "UNASSIGNED");
  await page.goto(projectUrl);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Integrated kitchen", exact: true }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Edit space$/ })
    .click();
  const edit = form("Save space");
  await edit
    .getByLabel("Space name", { exact: true })
    .fill("Integrated kitchen confirmed");
  await edit
    .getByLabel("Reason", { exact: true })
    .fill("Supporting Designer confirms scope");
  await edit.getByRole("button", { name: "Save space", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Integrated kitchen confirmed",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "LEAD");
  await page.goto(projectUrl);
  await openWorkspacePanels(page);
  await page
    .locator("summary")
    .filter({ hasText: /^Change design status$/ })
    .click();
  const complete = form("Update status");
  await complete.getByLabel("Next design status").selectOption("Completed");
  await complete
    .getByLabel("External approval reference")
    .fill("Synthetic external approval for acceptance");
  await complete
    .getByLabel("Reason", { exact: true })
    .fill("Lead confirms approved design");
  await complete
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await expect(
    page.getByText("100.0% · 1 of 1 active spaces completed"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "BDM");
  await page.goto(projectUrl);
  await openWorkspacePanels(page);
  await page.reload();
  await openWorkspacePanels(page);
  await expect(
    page.getByText("100.0% · 1 of 1 active spaces completed"),
  ).toBeVisible();
  await expect(
    page
      .getByText("Integrated design submitted for client approval", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(
    page.locator("summary").filter({ hasText: /^Edit space$/ }),
  ).toHaveCount(0);
  await accessible(page, "BDM populated project monitoring");
  await page.screenshot({
    path: "artifacts/verification/staging-project.png",
    fullPage: true,
  });
  writeFileSync(
    "artifacts/verification/live-browser.json",
    JSON.stringify(
      {
        leadId,
        projectId: page.url().split("/").at(-1),
        passed: [
          "real UI sign-in/sign-out",
          "saved draft",
          "actual TUS upload and download bytes",
          "archive/restore",
          "submit",
          "Lead acceptance",
          "Project primary/support assignment and stable refresh",
          "Space primary/support edits and Designer submission",
          "Lead completion and equal-weight progress",
          "Actual activity persistence and BDM read-only monitoring across sessions",
        ],
      },
      null,
      2,
    ) + "\n",
  );
});
test("larger real browser TUS transfer recovers from an interrupted PATCH", async ({
  page,
}) => {
  test.setTimeout(180000);
  await login(page, "BDM");
  await page.goto("/dashboard/leads/new");
  await openWorkspacePanels(page);
  const name = `Staging retry ${randomUUID()}`;
  await page
    .getByLabel("Project Name / Client Name", { exact: false })
    .fill(name);
  await page.getByLabel("Address", { exact: false }).fill(name);
  await page.getByLabel("Estimated Cabinetries", { exact: false }).fill("1");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/leads\/[0-9a-f-]+$/);
  let interrupted = false;
  await page.route("**/storage/v1/upload/resumable/**", async (route) => {
    if (route.request().method() === "PATCH" && !interrupted) {
      interrupted = true;
      await route.abort("failed");
    } else await route.continue();
  });
  const bytes = Buffer.alloc(13 * 1024 * 1024, 0x43);
  await page.getByLabel("File to upload or resume").setInputFiles({
    name: "staging-retry.bin",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(
    page.getByText("File uploaded and verified in private storage."),
  ).toBeVisible({ timeout: 120000 });
  expect(interrupted).toBe(true);
  await page.getByRole("button", { name: "Get download link" }).click();
  const link = page.getByRole("link", { name: "Download authorized file" });
  await expect(link).toBeVisible();
  const response = await page.request.get((await link.getAttribute("href"))!);
  expect(response.ok()).toBe(true);
  expect(
    createHash("sha256")
      .update(await response.body())
      .digest("hex"),
  ).toBe(createHash("sha256").update(bytes).digest("hex"));
  await page
    .getByLabel("Archive / restore reason")
    .fill("Archive successful interrupted-upload test fixture");
  await page
    .getByRole("button", { name: "Archive attachment", exact: true })
    .click();
  await expect(
    page
      .locator(".attachment-record > summary")
      .filter({ hasText: "Archived" }),
  ).toBeVisible();
  writeFileSync(
    "artifacts/verification/live-browser-resume.json",
    JSON.stringify({
      passed: true,
      bytes: bytes.length,
      interruptedPatchRecovered: interrupted,
      sha256Verified: true,
    }) + "\n",
  );
});
test("real Ops session only sees safe pipeline preview and cannot enter Lead detail", async ({
  page,
}) => {
  await login(page, "OPS");
  const evidence = JSON.parse(
    readFileSync("artifacts/verification/live-phase1.json", "utf8"),
  );
  await page.goto(`/dashboard/projects/${evidence.records.project}`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Pipeline overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Project team", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Assignment history", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/dashboard/leads/${evidence.records.acceptLead}`);
  await openWorkspacePanels(page);
  await expect(page).toHaveURL(/\/dashboard\?restricted=1$/);
});
