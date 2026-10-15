import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadStagingEnvironment, stagingProject } from "../helpers/staging";
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
async function confirm(page: Page, form: Locator, label: string) {
  await form.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm change", exact: true }),
  ).toHaveCount(0);
  const close = page.getByRole("button", { name: "Close editor", exact: true });
  if (label.endsWith("supplier")) {
    await expect(close).toBeVisible();
    await expect(form.getByRole("status")).toContainText(
      "Supplier saved with audit history.",
    );
    await close.click();
    await expect(close).toHaveCount(0);
  }
}
test("4B real supplier master, acknowledged logistics progression/history, financial isolation and role visibility", async ({
  page,
}) => {
  test.setTimeout(240000);
  const project = await stagingProject("4B browser", id("DESIGNER"), id("OPS")),
    url = `/dashboard/projects/${project.id}`,
    name = `Browser Supplier ${randomUUID()}`;
  await login(page, "OPS");
  await page.goto(`${url}?tab=logistics`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Pipeline overview" }),
  ).toBeVisible();
  await page.goto("/dashboard/suppliers");
  await openWorkspacePanels(page);
  await page.getByText("Add supplier", { exact: true }).click();
  const master = page.getByRole("form", { name: "Create supplier" });
  await master.getByLabel("Supplier name", { exact: true }).fill(name);
  await master
    .getByLabel("Contact details (optional)")
    .fill("Private contact sentinel");
  await master.getByLabel("Change reason").fill("Masterlist verification");
  await confirm(page, master, "Create supplier");
  await page.getByLabel("Search supplier name").fill(name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const supplier = page.getByRole("row", { name: `Supplier ${name}` });
  await expect(supplier.getByText("Active", { exact: true })).toBeVisible();
  await accessible(page, "4B supplier master light", "phase4b");
  await login(page, "BDM");
  await page.goto(`${url}?tab=finance`);
  await openWorkspacePanels(page);
  const sale = page.getByRole("form", { name: "Save Sale", exact: true });
  await sale.getByLabel("Sale amount (PHP)").fill("104.10");
  await sale.getByRole("button", { name: "Save Sale", exact: true }).click();
  await page.getByRole("button", { name: "Confirm financial change" }).click();
  await expect(page.getByText("Current Sale:")).toContainText("₱104.10");
  await page.goto(url);
  await openWorkspacePanels(page);
  await page.getByRole("button", { name: "Close Sale", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Close Sale" }).click();
  await expect(
    page.getByText("Pending Acknowledgment", { exact: true }),
  ).toBeVisible();
  await login(page, "OPS");
  await page.goto(`${url}?tab=logistics`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("button", { name: "Create logistics record", exact: true }),
  ).toHaveCount(0);
  await page.goto(url);
  await openWorkspacePanels(page);
  await page
    .getByRole("button", { name: "Acknowledge Handoff", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm acknowledgment" }).click();
  await expect(page.getByText("Acknowledged", { exact: true })).toBeVisible();
  await page.goto(`${url}?tab=logistics`);
  await openWorkspacePanels(page);
  await page.getByText("Add logistics record", { exact: true }).click();
  const create = page.getByRole("form", { name: "Create logistics record" });
  await create
    .getByLabel("Supplier", { exact: true })
    .selectOption({ label: name });
  await create
    .getByLabel("Supplier reference (optional)")
    .fill("Order Browser A");
  await create
    .getByLabel("Change reason")
    .fill("External Request for Payment tracked");
  await confirm(page, create, "Create logistics record");
  let record = page.getByRole("article").filter({ hasText: "Order Browser A" });
  await expect(record.getByRole("heading")).toContainText("RFP");
  await record
    .getByText("Edit logistics / change status", { exact: true })
    .click();
  const update = record.getByRole("form", { name: "Update logistics" });
  await update.getByLabel("Logistics status").selectOption("In Transit");
  await update.getByLabel("Change reason").fill("");
  await update
    .getByRole("button", { name: "Update logistics", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "reason is required",
  );
  await page.getByRole("button", { name: "Go back" }).click();
  await update
    .getByLabel("Change reason")
    .fill("Manufacturing externally completed; verified skipped stages");
  await confirm(page, update, "Update logistics");
  await expect(record.getByRole("heading")).toContainText("In Transit");
  await update.getByLabel("Logistics status").selectOption("On Hold");
  await update.getByLabel("Change reason").fill("Carrier delay");
  await confirm(page, update, "Update logistics");
  await expect(record.getByRole("heading")).toContainText("On Hold");
  await page.reload();
  await openWorkspacePanels(page);
  record = page.getByRole("article").filter({ hasText: "Order Browser A" });
  await expect(record.getByRole("heading")).toContainText("On Hold");
  await record
    .getByText("Edit logistics / change status", { exact: true })
    .click();
  const resume = record.getByRole("form", { name: "Update logistics" });
  await resume.getByLabel("Logistics status").selectOption("In Transit");
  await resume.getByLabel("Change reason").fill("Shipment resumed");
  await confirm(page, resume, "Update logistics");
  await resume.getByLabel("Logistics status").selectOption("Delivered");
  await resume
    .getByLabel("Change reason")
    .fill("Confirmed arrival and delivery outside system");
  await confirm(page, resume, "Update logistics");
  await expect(record.getByRole("heading")).toContainText("Delivered");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await accessible(page, "4B logistics dark mobile", "phase4b");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/dashboard/suppliers?q=${encodeURIComponent(name)}`);
  await openWorkspacePanels(page);
  await supplier.getByText("Edit supplier", { exact: true }).click();
  const edit = page.getByRole("form", { name: "Update supplier" });
  await edit.getByRole("checkbox", { name: "Active supplier" }).uncheck();
  await edit
    .getByLabel("Change reason")
    .fill("Inactive supplier retained historically");
  await confirm(page, edit, "Update supplier");
  await expect(supplier.getByText("Inactive", { exact: true })).toBeVisible();
  for (const actor of ["BDM", "DESIGNER"]) {
    await login(page, actor);
    await page.goto(`${url}?tab=logistics`);
    await openWorkspacePanels(page);
    await expect(
      page.getByRole("heading", { name: `${name} · Delivered`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Update logistics", exact: true }),
    ).toHaveCount(0);
    expect(await page.content()).not.toContain("Private contact sentinel");
    await expect(
      page.getByRole("link", { name: "Manage Supplier Masterlist" }),
    ).toHaveCount(0);
  }
  await login(page, "BDM");
  await page.goto(`${url}?tab=finance`);
  await openWorkspacePanels(page);
  await expect(page.getByText("Current Sale:")).toContainText("₱104.10");
});
