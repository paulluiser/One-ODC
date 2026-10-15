import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
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
test("3B real submission, return/correction, approval, immutable history, comparison and approved-only views", async ({
  page,
}) => {
  const project = await stagingProject("3B browser", id("DESIGNER"), id("OPS"));
  const spaces = await quotationSpaces(project.id, id("DESIGNER"));
  const url = `/dashboard/projects/${project.id}?tab=quotation`;
  await login(page, "DESIGNER");
  await page.goto(url);
  await openWorkspacePanels(page);
  await page.getByRole("button", { name: "Create quotation draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Quotation · Draft version 1" }),
  ).toBeVisible();
  await page.goto(`${url}&space=${spaces[0]}`);
  await openWorkspacePanels(page);
  let editor = page.getByRole("form", { name: "Edit quotation: Kitchen" });
  await editor.getByRole("button", { name: "Add item" }).click();
  await editor.getByLabel("Item 1 description").fill("Cabinet one");
  await editor.getByLabel("Unit price (PHP)", { exact: true }).fill("100.10");
  await editor.getByRole("button", { name: "Add item" }).click();
  await editor.getByLabel("Item 2 description").fill("Half cent line");
  await editor.getByLabel("Quantity", { exact: true }).nth(1).fill("0.005");
  await editor
    .getByLabel("Unit price (PHP)", { exact: true })
    .nth(1)
    .fill("1.00");
  await editor.getByLabel("Change reason").fill("Initial pricing");
  await editor.getByRole("button", { name: "Save space items" }).click();
  await expect(page.getByText("Saved project total:")).toContainText("₱100.11");
  // Lifecycle actions are absent while an editor may have unsaved items.
  await expect(
    page.getByRole("button", { name: "Submit for Review", exact: true }),
  ).toHaveCount(0);
  // Parent totals may refresh before the editor finishes its action/dirty-state reset.
  await expect(editor.getByRole("status")).toHaveText("Quotation saved.");
  await expect(
    editor.getByRole("button", { name: "Save space items", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Return to quotation overview" })
    .click();
  await expect(page).toHaveURL(
    (u) =>
      u.pathname === `/dashboard/projects/${project.id}` &&
      u.searchParams.get("tab") === "quotation" &&
      !u.searchParams.has("space"),
  );
  const submit = page.getByRole("form", { name: "Submit for Review" });
  await submit
    .getByLabel("Remarks (optional)")
    .fill("Complete quotation ready");
  await submit
    .getByRole("button", { name: "Submit for Review", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Submit for Review" }),
  ).toBeVisible();
  await accessible(page, "3B submission dialog", "phase3b");
  await page.keyboard.press("Escape");
  await expect(
    submit.getByRole("button", { name: "Submit for Review", exact: true }),
  ).toBeFocused();
  await submit
    .getByRole("button", { name: "Submit for Review", exact: true })
    .click();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pattern = `**/dashboard/projects/${project.id}**`;
  await page.route(pattern, async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Confirm submission", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Saving decision…", exact: true }),
    ).toBeDisabled();
    release();
    await expect(
      page.getByRole("heading", {
        name: "Quotation · Submitted for Review version 1",
      }),
    ).toBeVisible();
  } finally {
    release();
    await page.unroute(pattern);
  }
  await expect(page.getByText("Pending Lead Designer review.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Edit items for Kitchen", exact: true }),
  ).toHaveCount(0);
  await openWorkspacePanels(page);
  const history = page.getByRole("region", {
    name: "Quotation version history",
  });
  const firstHref = await history
    .getByRole("link", { name: "Version 1 · Submitted for Review" })
    .getAttribute("href");
  const first = new URL(firstHref!, "http://127.0.0.1:3002").searchParams.get(
    "version",
  )!;
  await page.reload();
  await openWorkspacePanels(page);
  await expect(page.getByText("Saved project total:")).toContainText("₱100.11");
  await login(page, "LEAD");
  await page.goto(url);
  await openWorkspacePanels(page);
  const returned = page.getByRole("form", { name: "Return for Revision" });
  await returned
    .getByRole("button", { name: "Return for Revision", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await returned
    .getByLabel("Required revision remarks")
    .fill("Correct quantity and unit price");
  await returned
    .getByRole("button", { name: "Return for Revision", exact: true })
    .click();
  await accessible(page, "3B return dialog", "phase3b");
  await page
    .getByRole("button", { name: "Confirm return", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Quotation · Returned for Revision version 1",
    }),
  ).toBeVisible();
  await login(page, "BDM");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByText("No approved quotation is available."),
  ).toBeVisible();
  await page.goto(`${url}&version=${first}`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Quotation version unavailable" }),
  ).toBeVisible();
  await login(page, "DESIGNER");
  await page.goto(url);
  await openWorkspacePanels(page);
  await page.getByRole("button", { name: "Create corrected draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Quotation · Draft version 2" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Edit items for Kitchen", exact: true })
    .click();
  editor = page.getByRole("form", { name: "Edit quotation: Kitchen" });
  await expect(editor.getByLabel("Item 1 description")).toHaveValue(
    "Cabinet one",
  );
  await editor.getByLabel("Quantity", { exact: true }).nth(0).fill("2");
  await editor
    .getByLabel("Unit price (PHP)", { exact: true })
    .nth(0)
    .fill("110.10");
  await editor
    .getByRole("button", { name: "Remove item 2", exact: true })
    .click();
  await editor.getByRole("button", { name: "Add item" }).click();
  await editor.getByLabel("Item 2 description").fill("New trim");
  await editor
    .getByLabel("Unit price (PHP)", { exact: true })
    .nth(1)
    .fill("5.00");
  await editor.getByLabel("Change reason").fill("Corrected reviewed pricing");
  await editor.getByRole("button", { name: "Save space items" }).click();
  await expect(page.getByText("Saved project total:")).toContainText("₱225.20");
  // Parent totals may refresh before the editor finishes its action/dirty-state reset.
  await expect(editor.getByRole("status")).toHaveText("Quotation saved.");
  await expect(
    editor.getByRole("button", { name: "Save space items", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Return to quotation overview" })
    .click();
  await expect(page).toHaveURL(
    (u) =>
      u.pathname === `/dashboard/projects/${project.id}` &&
      u.searchParams.get("tab") === "quotation" &&
      !u.searchParams.has("space"),
  );
  await page
    .getByRole("button", { name: "Submit for Review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm submission", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Quotation · Submitted for Review version 2",
    }),
  ).toBeVisible();
  await login(page, "LEAD");
  await page.goto(url);
  await openWorkspacePanels(page);
  const approve = page.getByRole("form", { name: "Approve quotation" });
  await approve
    .getByLabel("Remarks (optional)")
    .fill("Checked corrected quantities");
  await approve
    .getByRole("button", { name: "Approve quotation", exact: true })
    .click();
  await accessible(page, "3B approval dialog", "phase3b");
  await page
    .getByRole("button", { name: "Confirm approval", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Quotation · Approved version 2" }),
  ).toBeVisible();
  await openWorkspacePanels(page);
  const secondHref = await page
    .getByRole("region", { name: "Quotation version history" })
    .getByRole("link", { name: "Version 2 · Approved" })
    .getAttribute("href");
  const second = new URL(secondHref!, "http://127.0.0.1:3002").searchParams.get(
    "version",
  )!;
  await page
    .getByRole("region", { name: "Quotation version history" })
    .getByRole("link", { name: "Version 1 · Returned for Revision" })
    .click();
  await expect(page.getByText("Saved project total:")).toContainText("₱100.11");
  await page.getByLabel("Compare with version").selectOption(second);
  await page.getByRole("button", { name: "Compare versions" }).click();
  await expect(
    page.getByRole("heading", { name: "Version 1 → Version 2" }),
  ).toBeVisible();
  const comparison = page.getByRole("region", {
    name: "Quotation version comparison",
  });
  await expect(
    comparison.getByRole("strong").filter({ hasText: /^\+₱125\.09$/ }),
  ).toBeVisible();
  await expect(
    comparison.getByRole("heading", { name: "Added items (1)" }),
  ).toBeVisible();
  await expect(
    comparison.getByRole("heading", { name: "Removed items (1)" }),
  ).toBeVisible();
  await expect(
    comparison.getByRole("heading", { name: "Changed items (1)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use light theme" }).click();
  await accessible(page, "3B comparison light", "phase3b");
  mkdirSync("artifacts/verification/phase6b3-ui/after", { recursive: true });
  await page.screenshot({
    path: "artifacts/verification/phase6b3-ui/after/quotation-comparison-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await accessible(page, "3B comparison mobile dark", "phase3b");
  await page.screenshot({
    path: "artifacts/verification/phase6b3-ui/after/quotation-comparison-mobile-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, "BDM");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Quotation · Approved version 2" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Version 1/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create next quotation draft" }),
  ).toHaveCount(0);
  await accessible(page, "3B BDM approved version", "phase3b");
  await login(page, "OPS");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Pipeline overview" }),
  ).toBeVisible();
  await expect(page.getByText("New trim", { exact: true })).toHaveCount(0);
});
