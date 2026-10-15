import { expect, test } from "@playwright/test";
test("sign-in renders and protected workspace cannot be bypassed", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Good work starts here." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  for (const path of [
    "/dashboard",
    "/dashboard/leads",
    "/dashboard/leads/new",
    "/dashboard/projects",
    "/dashboard/users",
    "/dashboard/notifications",
    "/auth/set-password",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});
test("dashboard search, filters, independent statuses, dialog keyboard recovery", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Design overview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overdue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Casa de Lorenzo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "The Rivera Residence", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "All projects" }).click();
  await page.getByRole("textbox", { name: "Search projects" }).fill("rivera");
  await page
    .getByRole("button", { name: "The Rivera Residence", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Closed");
  await expect(page.getByRole("dialog")).toContainText("4 of 6 spaces");
  await expect(page.getByRole("dialog")).toContainText("In Progress");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "The Rivera Residence", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Search projects" })
    .fill("does-not-exist");
  await expect(
    page.getByRole("heading", { name: "No matching projects" }),
  ).toBeVisible();
});
test("theme preference survives reload and notification state is interactive", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Open notifications" }).click();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("All reminders read")).toBeVisible();
});
test("mobile navigation and calendar work at 360px without document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/demo");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "October 2026" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Parkside Penthouse" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goto("/login");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
