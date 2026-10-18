import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.verification");
if (process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk")
  throw new Error("Refusing non-staging browser verification");
const second = JSON.parse(
  readFileSync("artifacts/verification/routing-second-lead.json", "utf8"),
);
const actors = JSON.parse(
  readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
).accounts as { actor: string; id: string }[];
async function login(page: Page, actor: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page
    .getByLabel("Work email")
    .fill(
      actor === "SECOND"
        ? second.email
        : process.env[`ONE_ODC_TEST_${actor}_EMAIL`]!,
    );
  await page
    .getByLabel("Password", { exact: true })
    .fill(
      actor === "SECOND"
        ? second.password
        : process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]!,
    );
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
test("BDM selects a recipient; only that Lead Designer reviews and transfers project ownership", async ({
  page,
}) => {
  test.setTimeout(180000);
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await login(page, "BDM");
  await page.goto("/dashboard/leads/new");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Add Link", exact: true }).click();
  await page
    .getByLabel("Resource link 1", { exact: true })
    .fill("https://example.com/design-brief");
  const run = randomUUID();
  await page
    .getByLabel("Project Name / Client Name", { exact: false })
    .fill(`Routing browser ${run}`);
  await page
    .getByLabel("Address", { exact: false })
    .fill(`Synthetic staging routing address ${run}`);
  await page.getByLabel("Estimated Cabinetries", { exact: false }).fill("2");
  await page.getByRole("button", { name: "Submit lead", exact: true }).click();
  await expect(
    page.getByText("Choose the Lead Designer who will review this request."),
  ).toBeVisible();
  // Failed validation must leave entries protected; successful saves must not prompt.
  await page
    .getByRole("link", { name: "Projects", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard\/leads\/new$/);
  expect(dialogs).toEqual(["Leave this page and discard unsaved changes?"]);
  dialogs.length = 0;
  await page
    .getByLabel("Lead Designer", { exact: false })
    .selectOption(second.id);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/leads\/[0-9a-f-]+$/);
  const url = page.url();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Resource link 1", { exact: true })).toHaveValue(
    "https://example.com/design-brief",
  );
  await expect(page.getByLabel("Lead Designer", { exact: false })).toHaveValue(
    second.id,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  mkdirSync("artifacts/verification/lead-routing", { recursive: true });
  await page.screenshot({
    path: "artifacts/verification/lead-routing/bdm-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Submit lead", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Request details", exact: true }),
  ).toBeVisible();
  await login(page, "LEAD");
  await page.goto(url);
  await expect(
    page.getByText("This space is still uncharted.", { exact: true }),
  ).toBeVisible();
  await login(page, "SECOND");
  await page.goto(url);
  await expect(
    page.getByRole("link", { name: "https://example.com/design-brief" }),
  ).toBeVisible();
  await page
    .getByLabel("Review decision", { exact: true })
    .selectOption("Accepted");
  await page
    .getByLabel("Primary Designer", { exact: false })
    .selectOption(actors.find((a) => a.actor === "DESIGNER")!.id);
  await page.screenshot({
    path: "artifacts/verification/lead-routing/lead-review-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Accept and create Project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]+$/);
  const projectUrl = page.url();
  await page.getByText("Manage project assignments", { exact: true }).click();
  await page.getByText("Change Lead Designer", { exact: true }).click();
  const form = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Assign Lead Designer",
      exact: true,
    }),
  });
  await form
    .getByLabel("Lead Designer", { exact: false })
    .selectOption(actors.find((a) => a.actor === "LEAD")!.id);
  await form
    .getByLabel("Assignment reason", { exact: false })
    .fill("Browser staging transfer to original Lead Designer");
  await form
    .getByRole("button", { name: "Assign Lead Designer", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/projects$/);
  await login(page, "LEAD");
  await page.goto(projectUrl);
  await expect(
    page.getByRole("heading", { name: "Project team", exact: true }),
  ).toBeVisible();
  expect(dialogs).toEqual([]);
});
