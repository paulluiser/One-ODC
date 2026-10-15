import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page, type Locator } from "@playwright/test";
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
async function confirm(page: Page, form: Locator, label: string) {
  await form.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm financial change", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function addPayment(
  page: Page,
  kind: "client" | "supplier",
  amount: string,
  ref: string,
) {
  const section = page.getByRole("region", {
    name: kind === "client" ? "Client payments" : "Supplier payments",
    exact: true,
  });
  const details = section
    .locator("details")
    .filter({ has: page.getByText(`Add ${kind} payment`, { exact: true }) })
    .first();
  if (!(await details.evaluate((e) => (e as HTMLDetailsElement).open)))
    await details.locator("summary").first().click();
  const form = section.getByRole("form", { name: `Record ${kind} payment` });
  await form.getByLabel("Payment date").fill("2026-01-01");
  await form.getByLabel("Amount (PHP)").fill(amount);
  await form.getByLabel("Payment method").fill("Bank transfer");
  await form.getByLabel("Reference (optional)").fill(ref);
  await confirm(page, form, `Record ${kind} payment`);
  await expect(
    section.getByRole("row").filter({ hasText: ref }).getByRole("heading"),
  ).toBeVisible();
}
test("3D integrated quotation approval, finance, correction/void, overpayment and role redaction", async ({
  page,
}) => {
  test.setTimeout(240000);
  const project = await stagingProject("3C browser", id("DESIGNER"), id("OPS"));
  const spaces = await quotationSpaces(project.id, id("DESIGNER"));
  const quotationUrl = `/dashboard/projects/${project.id}?tab=quotation`;
  await login(page, "DESIGNER");
  await page.goto(quotationUrl);
  await openWorkspacePanels(page);
  await page.getByRole("button", { name: "Create quotation draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Quotation · Draft version 1" }),
  ).toBeVisible();
  await page.goto(`${quotationUrl}&space=${spaces[0]}`);
  await openWorkspacePanels(page);
  const editor = page.getByRole("form", { name: "Edit quotation: Kitchen" });
  await editor.getByRole("button", { name: "Add item" }).click();
  await editor.getByLabel("Item 1 description").fill("3D accepted cabinet");
  await editor.getByLabel("Unit price (PHP)", { exact: true }).fill("0.10");
  await editor.getByLabel("Change reason").fill("3D integrated quotation");
  await editor.getByRole("button", { name: "Save space items" }).click();
  await expect(page.getByText("Saved project total:")).toContainText("₱0.10");
  await expect(editor.getByRole("status")).toHaveText("Quotation saved.");
  await expect(
    editor.getByRole("button", { name: "Save space items", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Return to quotation overview" })
    .click();
  await page
    .getByRole("button", { name: "Submit for Review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm submission", exact: true })
    .click();
  await expect(page.getByText("Pending Lead Designer review.")).toBeVisible();
  await login(page, "LEAD");
  await page.goto(quotationUrl);
  await openWorkspacePanels(page);
  await page
    .getByRole("button", { name: "Approve quotation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm approval", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Quotation · Approved version 1" }),
  ).toBeVisible();
  const url = `/dashboard/projects/${project.id}?tab=finance`;
  await login(page, "BDM");
  await page.goto(quotationUrl);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Quotation · Approved version 1" }),
  ).toBeVisible();
  await page.goto(`/dashboard/projects/${project.id}`);
  await openWorkspacePanels(page);
  await page
    .getByRole("navigation", { name: "Project workspace" })
    .getByRole("link", { name: "Financial Management" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Financial summary" }),
  ).toBeVisible();
  await expect(page.getByText("Current Sale:")).toContainText("Not recorded");
  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: "Latest approved quotation:" }),
  ).toContainText("₱0.10");
  let sale = page.getByRole("form", { name: "Save Sale", exact: true });
  await sale.getByLabel("Sale amount (PHP)").fill("125.50");
  await confirm(page, sale, "Save Sale");
  await expect(page.getByText("Current Sale:")).toContainText("₱125.50");
  // A second browser tab changes the same version before the first tab saves.
  const concurrent = await page.context().newPage();
  await concurrent.goto(url);
  const concurrentSale = concurrent.getByRole("form", {
    name: "Save Sale",
    exact: true,
  });
  await concurrentSale.getByLabel("Sale amount (PHP)").fill("125.51");
  await concurrentSale
    .getByLabel("Required change reason")
    .fill("Concurrent agreed price");
  await confirm(concurrent, concurrentSale, "Save Sale");
  await concurrent.close();
  sale = page.getByRole("form", { name: "Save Sale", exact: true });
  await sale.getByLabel("Sale amount (PHP)").fill("100.10");
  await sale.getByLabel("Required change reason").fill("Stale tab adjustment");
  await sale.getByRole("button", { name: "Save Sale", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm financial change", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "changed elsewhere",
  );
  await accessible(page, "3D stale financial save error", "phase3d");
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(sale.getByLabel("Sale amount (PHP)")).toHaveValue("100.10");
  await page.reload();
  await openWorkspacePanels(page);
  sale = page.getByRole("form", { name: "Save Sale", exact: true });
  await sale.getByLabel("Sale amount (PHP)").fill("100.10");
  await sale.getByLabel("Required change reason").fill("Agreed client price");
  await confirm(page, sale, "Save Sale");
  await expect(page.getByText("Current Sale:")).toContainText("₱100.10");
  await expect(
    page.getByText("Agreed client price", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Raw", exact: true }),
  ).toHaveCount(0);
  await accessible(page, "3C primary BDM finance", "phase3d");
  await login(page, "LEAD");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(page.getByRole("form", { name: "Save Sale" })).toHaveCount(0);
  const raw = page.getByRole("form", { name: "Save Raw", exact: true });
  await raw.getByLabel("Raw amount (PHP)").fill("9137.63");
  await raw
    .getByLabel("Required change reason")
    .fill("Consolidated supplier cost");
  await raw.getByRole("button", { name: "Save Raw", exact: true }).click();
  await accessible(page, "3C Raw confirmation", "phase3d");
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
      .getByRole("button", { name: "Confirm financial change", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Saving financial record…",
        exact: true,
      }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    release();
    await expect(page.getByText("Current Raw:")).toContainText("₱9,137.63");
  } finally {
    release();
    await page.unroute(pattern);
  }
  await expect(page.getByText("Current Raw:")).toContainText("₱9,137.63");
  await expect(
    page
      .getByRole("form", { name: "Save Raw", exact: true })
      .getByRole("button", { name: "Save Raw", exact: true }),
  ).toBeFocused();
  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: "Quotation vs Sale (Sale − quotation):" }),
  ).toContainText("₱100.00");
  await addPayment(page, "client", "120.20", "3C receipt A");
  await addPayment(page, "client", "0.20", "3C receipt B");
  const client = page.getByRole("region", {
    name: "Client payments",
    exact: true,
  });
  await expect(client.getByText("Client outstanding:")).toContainText(
    "−₱20.30",
  );
  await expect(client.getByText(/Negative balance:/)).toBeVisible();
  let record = client.getByRole("row").filter({ hasText: "3C receipt A" });
  await record
    .getByText("Correct or void client payment", { exact: true })
    .click();
  const correction = record.getByRole("form", {
    name: "Correct client payment",
    exact: true,
  });
  await correction.getByLabel("Amount (PHP)").fill("100.20");
  await correction
    .getByLabel("Required change reason")
    .fill("Correct actual receipt amount");
  await confirm(page, correction, "Correct client payment");
  await expect(client.getByText("Client outstanding:")).toContainText("−₱0.30");
  record = client.getByRole("row").filter({ hasText: "3C receipt A" });
  const voidForm = record.getByRole("form", {
    name: "Void client payment",
    exact: true,
  });
  await voidForm
    .getByLabel("Required change reason")
    .fill("Duplicate receipt recorded");
  await voidForm
    .getByRole("button", { name: "Void client payment", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    voidForm.getByRole("button", { name: "Void client payment", exact: true }),
  ).toBeFocused();
  await confirm(page, voidForm, "Void client payment");
  await expect(client.getByText("Client outstanding:")).toContainText("₱99.90");
  await expect(record.getByRole("heading")).toContainText("Voided");
  await expect(record.getByRole("heading")).toBeFocused();
  await addPayment(page, "supplier", "9.00", "3D supplier installment A");
  await addPayment(page, "supplier", "0.20", "3D supplier installment B");
  const supplier = page.getByRole("region", {
    name: "Supplier payments",
    exact: true,
  });
  await expect(supplier.getByText("Supplier outstanding:")).toContainText(
    "₱9,128.43",
  );
  const rawRevision = page.getByRole("form", { name: "Save Raw", exact: true });
  await rawRevision.getByLabel("Raw amount (PHP)").fill("9137.64");
  await rawRevision
    .getByLabel("Required change reason")
    .fill("3D supplier adjustment");
  await confirm(page, rawRevision, "Save Raw");
  await expect(supplier.getByText("Supplier outstanding:")).toContainText(
    "₱9,128.44",
  );
  await page.reload();
  await openWorkspacePanels(page);
  await expect(page.getByText("Current Sale:")).toContainText("₱100.10");
  await expect(client.getByText("Client outstanding:")).toContainText("₱99.90");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await accessible(page, "3C Lead finance dark mobile", "phase3d");
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const actor of ["DESIGNER", "BDM"]) {
    await login(page, actor);
    await page.goto(url);
    await openWorkspacePanels(page);
    await expect(page.getByText("Current Sale:")).toContainText("₱100.10");
    await expect(
      page.getByRole("heading", { name: "Raw", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Supplier outstanding:")).toHaveCount(0);
    await expect(
      page.getByRole("form", { name: "Record client payment" }),
    ).toHaveCount(0);
    expect(await page.content()).not.toContain("9137.63");
    expect(await page.content()).not.toContain("9,137.63");
    expect(await page.content()).not.toContain("9137.64");
    expect(await page.content()).not.toContain("9,137.64");
    await accessible(page, `3C ${actor} redacted financials`, "phase3d");
  }
  await login(page, "OPS");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Pipeline overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Financial summary" }),
  ).toHaveCount(0);
  const closed = JSON.parse(
    readFileSync(
      "artifacts/verification/monitoring-closed-fixture.json",
      "utf8",
    ),
  ).id;
  await page.goto(`/dashboard/projects/${closed}?tab=finance`);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", { name: "Financial summary" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sale", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: "Latest approved quotation:" }),
  ).toHaveCount(0);
  await expect(page.getByText("Client outstanding:")).toHaveCount(0);
  await addPayment(page, "client", "0.11", `3C Ops receipt ${project.id}`);
  await accessible(page, "3C assigned Closed Ops financials", "phase3d");
});
