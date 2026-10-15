import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadStagingEnvironment, operationalJourney } from "../helpers/staging";
import { accessible } from "../helpers/accessibility";
loadStagingEnvironment();
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
async function save(page: Page, form: Locator, status: string, reason: string) {
  await form
    .getByLabel("Installation status", { exact: true })
    .selectOption(status);
  await form.getByLabel("Change reason").fill(reason);
  await form
    .getByRole("button", { name: "Save installation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm installation change", exact: true })
    .click();
}
test("4D complete journey remains consistent across roles, stale tabs, lifecycle recovery, focus and lost sessions", async ({
  page,
}) => {
  test.setTimeout(360000);
  const journey = await operationalJourney(),
    url = `/dashboard/projects/${journey.project}`,
    installation = `${url}?tab=installation`;
  mkdirSync("artifacts/verification", { recursive: true });
  writeFileSync(
    "artifacts/verification/phase4-query-performance.json",
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        project: journey.project,
        sample:
          "Three authenticated serial requests per query on one integrated staging Project; network-inclusive, not a load/SLA claim",
        milliseconds: journey.timings,
      },
      null,
      2,
    ) + "\n",
  );
  await login(page, "BDM");
  await page.goto(`/dashboard/projects?q=${encodeURIComponent(journey.name)}`);
  await openWorkspacePanels(page);
  const row = page.getByRole("row").filter({ hasText: journey.name });
  await expect(row).toContainText("Operationally Completed");
  await row.getByRole("link", { name: journey.name, exact: true }).click();
  await expect(
    page
      .getByText("<script>window.odcInjected=true</script>", { exact: false })
      .first(),
  ).toBeVisible();
  expect(await page.evaluate(() => "odcInjected" in window)).toBe(false);
  await expect(
    page.getByRole("link", {
      name: "Resource 1: https://example.com/4d-plans",
      exact: true,
    }),
  ).toBeVisible();
  await accessible(page, "4D completed BDM workspace", "phase4");
  await page.goto(`${url}?tab=quotation`);
  await openWorkspacePanels(page);
  await expect(page.getByText("Saved project total:")).toContainText("₱0.21");
  await page.reload();
  await openWorkspacePanels(page);
  await expect(page.getByText("Saved project total:")).toContainText("₱0.21");
  await login(page, "OPS");
  await page.goto(`${url}?tab=finance`);
  await openWorkspacePanels(page);
  await expect(page.getByText("Current Raw:")).toContainText("₱40.05");
  expect(await page.content()).not.toContain("Current Sale:");
  await accessible(page, "4D post-completion Ops finance", "phase4");
  await login(page, "DESIGNER");
  await page.goto(installation);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("form", { name: "Save installation" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", {
        name: "Installation and operational readiness",
        exact: true,
      })
      .getByText("Operationally Completed", { exact: true }),
  ).toBeVisible();
  await login(page, "LEAD");
  await page.goto(url);
  await openWorkspacePanels(page);
  await page
    .getByText("Project controls and deadline revisions", { exact: true })
    .click();
  const reopen = page.getByRole("button", {
    name: "Reopen Project",
    exact: true,
  });
  const control = reopen.locator("xpath=ancestor::form");
  await control
    .getByLabel("Change reason")
    .fill("4D additional operational correction");
  await reopen.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(reopen).toBeFocused();
  await reopen.click();
  await page
    .getByRole("button", { name: "Confirm reopen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(installation);
  await openWorkspacePanels(page);
  const article = page.locator(`#installation-${journey.space}`),
    form = article.getByRole("form", { name: "Save installation" });
  const stale = await page.context().newPage();
  await stale.goto(installation);
  await openWorkspacePanels(stale);
  const staleForm = stale
    .locator(`#installation-${journey.space}`)
    .getByRole("form", { name: "Save installation" });
  // Keep a genuine stale tab; a successful first update must make the old version fail.
  await save(page, form, "In Progress", "4D reopened installation");
  await expect(article.getByRole("heading")).toContainText("In Progress");
  await save(
    stale,
    staleForm,
    "Not Applicable",
    "Stale-tab attempted exception",
  );
  await expect(stale.getByRole("dialog").getByRole("alert")).toContainText(
    "changed elsewhere",
  );
  await stale.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(staleForm.getByLabel("Change reason")).toHaveValue(
    "Stale-tab attempted exception",
  );
  await stale.reload();
  await expect(
    stale.locator(`#installation-${journey.space}`).getByRole("heading"),
  ).toContainText("In Progress");
  await stale.close();
  // Gate a real save to verify pending feedback, then permit the server transaction.
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const pattern = `**/dashboard/projects/${journey.project}**`;
  await page.route(pattern, async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  try {
    await save(page, form, "Completed", "");
    await expect(
      page.getByRole("button", { name: "Saving installation…", exact: true }),
    ).toBeDisabled();
    release();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(article.getByRole("heading")).toContainText("Completed");
  } finally {
    release();
    await page.unroute(pattern);
  }
  const complete = page.getByRole("form", {
    name: "Confirm Operational Completion",
  });
  await complete
    .getByLabel("Required completion reason")
    .fill("4D keyboard completion");
  await complete
    .getByRole("button", {
      name: "Confirm Operational Completion",
      exact: true,
    })
    .click();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
    ).toBe(true);
  }
  await accessible(page, "4D explicit completion dialog", "phase4");
  await page
    .getByRole("button", { name: "Confirm completion", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", {
        name: "Installation and operational readiness",
        exact: true,
      })
      .getByText("Operationally Completed", { exact: true }),
  ).toBeVisible();
  // Successful completion removes its form; keyboard focus must reach preserved readiness content.
  await expect(
    page.getByRole("heading", { name: "Operational readiness", exact: true }),
  ).toBeFocused();
  await login(page, "ADMIN");
  await page.goto(installation);
  await openWorkspacePanels(page);
  await expect(page.getByText(/Cycle 3/)).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await accessible(page, "4D admin completion history mobile dark", "phase4");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // A lost browser session must fail closed; this is not a claim of natural JWT expiry testing.
  await page.context().clearCookies();
  await page.reload();
  await openWorkspacePanels(page);
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Installation", exact: true }),
  ).toHaveCount(0);
  await login(page, "OTHER_BDM");
  await page.goto(url);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("heading", {
      name: "This space is still uncharted.",
      exact: true,
    }),
  ).toBeVisible();
});
