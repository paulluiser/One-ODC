import type { Page } from "@playwright/test";
// Existing business regressions explicitly open the newly disclosed authorized panels.
export async function openWorkspacePanels(page: Page) {
  if (
    /\/dashboard\/(projects|leads)\/[0-9a-f-]+/.test(
      new URL(page.url()).pathname,
    )
  ) {
    await page
      .locator(".page-intro")
      .or(
        page.getByRole("heading", {
          name: "This space is still uncharted.",
          exact: true,
        }),
      )
      .or(page.getByLabel("Work email", { exact: true }))
      .first()
      .waitFor({ state: "visible" });
    // Forbidden records and lost sessions intentionally have no workspace panels.
    // Their callers still assert the expected 404 or sign-in destination.
    if (!(await page.locator(".page-intro").count())) return;
  }
  const projectUrl = new URL(page.url());
  if (
    /\/dashboard\/projects\/[0-9a-f-]+/.test(projectUrl.pathname) &&
    !projectUrl.searchParams.has("tab")
  ) {
    const nav = page.locator('nav[aria-label="Project workspace"]');
    if (await nav.count()) {
      await page
        .locator('nav[aria-label="Project workspace"][data-ready="true"]')
        .waitFor();
      await page
        .locator("summary")
        .filter({ hasText: /^Activities and project controls$/ })
        .waitFor({ state: "visible" });
      await page
        .locator("summary")
        .filter({ hasText: /^Project files and versions$/ })
        .waitFor({ state: "visible" });
    }
  }
  for (const label of [
    "Commercial closure and operations handoff",
    "Manage project assignments",
    "Edit Notes and resources",
    "Project files and versions",
    "Activities and project controls",
    "Progress, aging and deadline details",
    "Closure and handoff history",
    "Adjust Sale",
    "Adjust Raw",
    "Version history and comparison",
    "Submission and review activity",
    "Operational completion history",
    "Schedule or update installation",
    "Submission history",
    "Review history",
  ]) {
    const summaries = page
      .locator("summary")
      .filter({ hasText: new RegExp(`^${label}$`) });
    for (const summary of await summaries.all()) {
      if (
        (await summary.count()) &&
        (await summary.isVisible()) &&
        (await summary.locator("..").getAttribute("open")) === null
      )
        await summary.click();
    }
  }
}
