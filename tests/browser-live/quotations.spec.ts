import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  loadStagingEnvironment,
  stagingProject,
  quotationSpaces,
  touchQuotation,
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
test("3A draft editor, exact totals, ordering, persistence, unsaved protection and role visibility", async ({
  page,
}) => {
  const project = await stagingProject("3A browser", id("DESIGNER"), id("OPS"));
  const spaces = await quotationSpaces(project.id, id("DESIGNER"));
  const url = `/dashboard/projects/${project.id}?tab=quotation`;
  await login(page, "LEAD");
  await page.goto(`/dashboard/projects/${project.id}`);
  await openWorkspacePanels(page);
  await page
    .getByRole("navigation", { name: "Project workspace" })
    .getByRole("link", { name: "Quotation", exact: true })
    .click();
  await page.getByRole("button", { name: "Create quotation draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Quotation · Draft version 1" }),
  ).toBeVisible();
  await page.goto(`${url}&space=${spaces[0]}`);
  await openWorkspacePanels(page);
  let form = page.getByRole("form", { name: "Edit quotation: Kitchen" });
  await form.getByRole("button", { name: "Add item" }).click();
  await form.getByLabel("Item 1 description").fill("Cabinet one");
  await form.getByLabel("Quantity", { exact: true }).fill("0.005");
  await form.getByLabel("Unit price (PHP)", { exact: true }).fill("1.00");
  await expect(
    form.getByText("Line amount: ₱0.01", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(spaces[0]));
  await touchQuotation(project.id, spaces[1]);
  await form
    .getByLabel("Change reason")
    .fill("First attempt after concurrent edit");
  await form.getByRole("button", { name: "Save space items" }).click();
  await expect(form.getByRole("alert")).toContainText("changed elsewhere");
  await expect(form.getByLabel("Item 1 description")).toHaveValue(
    "Cabinet one",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await openWorkspacePanels(page);
  form = page.getByRole("form", { name: "Edit quotation: Kitchen" });
  await form.getByRole("button", { name: "Add item" }).click();
  await form.getByLabel("Item 1 description").fill("Cabinet one");
  await form.getByLabel("Quantity", { exact: true }).fill("0.005");
  await form.getByLabel("Unit price (PHP)", { exact: true }).fill("1.00");
  await form.getByLabel("Change reason").fill("Initial itemized price");
  await form.getByRole("button", { name: "Save space items" }).click();
  await expect(form.getByRole("status")).toHaveText("Quotation saved.");
  await expect(page.getByText("Saved project total:")).toContainText("₱0.01");
  await page.reload();
  await openWorkspacePanels(page);
  form = page.getByRole("form", { name: "Edit quotation: Kitchen" });
  await expect(form.getByLabel("Item 1 description")).toHaveValue(
    "Cabinet one",
  );
  await form.getByRole("button", { name: "Add item" }).click();
  await form.getByLabel("Item 2 description").fill("Cabinet two");
  await form
    .getByLabel("Unit price (PHP)", { exact: true })
    .nth(1)
    .fill("0.20");
  await form
    .getByRole("button", { name: "Move item 2 up", exact: true })
    .click();
  await expect(form.getByLabel("Item 1 description")).toHaveValue(
    "Cabinet two",
  );
  await form.getByLabel("Change reason").fill("Add and reorder");
  await form.getByRole("button", { name: "Save space items" }).click();
  await expect(page.getByText("Saved project total:")).toContainText("₱0.21");
  await page.getByRole("button", { name: "Use light theme" }).click();
  await accessible(page, "3A quotation light", "phase3a");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await accessible(page, "3A quotation dark", "phase3a");
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await accessible(page, "3A quotation mobile", "phase3a");
  await page.setViewportSize({ width: 1280, height: 800 });
  await form
    .getByRole("button", { name: "Remove item 2", exact: true })
    .click();
  await form.getByLabel("Change reason").fill("Remove draft item");
  await form.getByRole("button", { name: "Save space items" }).click();
  await expect(page.getByText("Saved project total:")).toContainText("₱0.20");
  await login(page, "DESIGNER");
  await page.goto(url);
  await openWorkspacePanels(page);
  expect(
    await page
      .getByRole("link", { name: "Edit items for Kitchen", exact: true })
      .count(),
  ).toBe(1);
  await login(page, "BDM");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByText("No approved quotation is available."),
  ).toBeVisible();
  await expect(page.getByText("Cabinet two", { exact: true })).toHaveCount(0);
  await accessible(page, "3A BDM approved only", "phase3a");
  await login(page, "OPS");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Pipeline overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Project workspace" }),
  ).toHaveCount(0);
  await expect(page.getByText("Cabinet two", { exact: true })).toHaveCount(0);
});
