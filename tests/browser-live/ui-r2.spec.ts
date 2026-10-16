import { expect, test, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { loadStagingEnvironment } from "../helpers/staging";
loadStagingEnvironment();
const root = "artifacts/verification/ui-r2";
mkdirSync(root, { recursive: true });
const ids = JSON.parse(
  readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
).accounts as { actor: string; id: string }[];
const id = (actor: string) => ids.find((a) => a.actor === actor)!.id;
async function login(page: Page, actor: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page
    .getByLabel("Work email")
    .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]!);
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("button", { name: "Choose appearance", exact: true }),
  ).toBeEnabled();
}
async function settled(page: Page) {
  await expect(page.locator("[data-ui-r2]:visible").first()).toBeVisible();
  await expect(page.locator(".section-skeleton:visible")).toHaveCount(0, {
    timeout: 90000,
  });
}
async function disclose(root: Page | Locator, label: string) {
  const summary = root
    .locator("summary")
    .filter({ hasText: new RegExp(`^${label}$`) });
  await expect(summary).toBeVisible();
  if ((await summary.locator("..").getAttribute("open")) === null)
    await summary.click();
  return summary;
}
const form = (page: Page, label: string) =>
  page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: label, exact: true }) });
let fixture: { project: string; lead: string; name: string; space: string };
test("UI-R2: BDM draft/files/clarification, acceptance, Designer updates, completion/revision, activity and history persist", async ({
  page,
}) => {
  await login(page, "BDM");
  await page.goto("/dashboard/leads/new");
  await settled(page);
  await page.getByRole("button", { name: "Submit lead", exact: true }).click();
  expect(
    await page
      .getByLabel("Project Name / Client Name", { exact: false })
      .evaluate((e: HTMLInputElement) => e.validity.valueMissing),
  ).toBe(true);
  const name = `UI-R2 acceptance ${randomUUID().slice(0, 8)}`;
  await page
    .getByLabel("Project Name / Client Name", { exact: false })
    .fill(name);
  await page
    .getByLabel("Address", { exact: false })
    .fill(`Fictional staging design brief, Makati ${name}`);
  await page.getByLabel("Estimated Cabinetries", { exact: false }).fill("3");
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Review the kitchen scope. <script>plain text only</script>");
  await page.getByRole("button", { name: "Add Link", exact: true }).click();
  await page
    .getByLabel("Resource link 1")
    .fill("https://example.com/design-brief");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]+$/);
  await settled(page);
  const lead = page.url().split("/").at(-1)!;
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    /plain text only/,
  );
  await expect(page.getByLabel("Resource link 1")).toHaveValue(
    "https://example.com/design-brief",
  );
  await expect(page.getByLabel("File to upload or resume")).toBeEnabled();
  await page.getByLabel("File to upload or resume").setInputFiles({
    name: "ui-r2-brief.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("One ODC UI-R2 private staging brief"),
  });
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(
    page.getByText("File uploaded and verified in private storage."),
  ).toBeVisible({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Get download link", exact: true })
    .click();
  const download = page.getByRole("link", { name: "Download authorized file" });
  await expect(download).toBeVisible();
  const response = await page.request.get(
    (await download.getAttribute("href"))!,
  );
  expect(await response.text()).toBe("One ODC UI-R2 private staging brief");
  await page
    .getByLabel("Archive / restore reason")
    .fill("UI-R2 archive control verification");
  await page
    .getByRole("button", { name: "Archive attachment", exact: true })
    .click();
  await disclose(page, "ui-r2-brief.txtArchived");
  await page
    .getByLabel("Archive / restore reason")
    .fill("UI-R2 restore control verification");
  await page
    .getByRole("button", { name: "Restore attachment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Get download link", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit lead", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Request details", exact: true }),
  ).toBeVisible();
  await login(page, "LEAD");
  await page.goto(`/dashboard/leads/${lead}`);
  await settled(page);
  await page
    .getByLabel("Review decision", { exact: true })
    .selectOption("Returned for Clarification");
  await page
    .getByLabel("Remarks", { exact: false })
    .fill("Please confirm the countertop specification.");
  await form(page, "Return for Clarification")
    .getByRole("button", { name: "Return for Clarification", exact: true })
    .click();
  await expect(
    page.getByText("Returned for Clarification", { exact: true }).first(),
  ).toBeVisible();
  await login(page, "BDM");
  await page.goto(`/dashboard/leads/${lead}`);
  await settled(page);
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Countertop confirmed. <script>plain text only</script>");
  await page
    .getByRole("button", { name: "Resubmit lead", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Request details", exact: true }),
  ).toBeVisible();
  await login(page, "LEAD");
  await page.goto(`/dashboard/leads/${lead}`);
  await settled(page);
  await page
    .getByLabel("Review decision", { exact: true })
    .selectOption("Accepted");
  await page
    .getByLabel("Primary Designer", { exact: false })
    .selectOption(id("DESIGNER"));
  await page.locator(`input[type="checkbox"][value="${id("OPS")}"]`).check();
  await page
    .getByRole("button", { name: "Accept and create Project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  await settled(page);
  const project = page.url().split("/").at(-1)!;
  fixture = { lead, project, name, space: "" };
  writeFileSync(`${root}/fixture.json`, JSON.stringify(fixture));
  await disclose(page, "Notes, Files and Resources");
  await expect(
    page.locator("p").filter({
      hasText: "Countertop confirmed. <script>plain text only</script>",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: /https:\/\/example\.com\/design-brief/,
      exact: true,
    }),
  ).toBeVisible();
  await disclose(page, "Create a space");
  const create = form(page, "Create space");
  await create.getByLabel("Space name", { exact: true }).fill("Kitchen");
  await create
    .getByLabel("Primary Designer", { exact: true })
    .selectOption(id("DESIGNER"));
  await create
    .getByLabel("Reason", { exact: true })
    .fill("Independent kitchen design scope");
  await create
    .getByRole("button", { name: "Create space", exact: true })
    .click();
  await expect(page.locator('details[id^="space-"]')).toHaveCount(1);
  fixture.space = (await page
    .locator('details[id^="space-"]')
    .first()
    .getAttribute("id"))!.slice(6);
  writeFileSync(`${root}/fixture.json`, JSON.stringify(fixture));
  // A separate, duplicate-name space tests stable IDs and cancellation without deleting history.
  await create.getByLabel("Space name", { exact: true }).fill("Kitchen");
  await create
    .getByLabel("Primary Designer", { exact: true })
    .selectOption(id("DESIGNER"));
  await create
    .getByLabel("Reason", { exact: true })
    .fill("Separate kitchen scope sharing a display name");
  await create
    .getByRole("button", { name: "Create space", exact: true })
    .click();
  await expect(page.locator('details[id^="space-"]')).toHaveCount(2);
  const second = page.locator('details[id^="space-"]').nth(1);
  await second.locator(":scope > summary").click();
  await disclose(second, "Cancel space");
  const cancel = second.locator("form").filter({
    has: page.getByRole("button", { name: "Cancel space", exact: true }),
  });
  await cancel
    .getByLabel("Reason", { exact: true })
    .fill("Duplicate scope removed during UI acceptance");
  const trigger = cancel.getByRole("button", {
    name: "Cancel space",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("button", { name: "Confirm space cancellation", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(second.locator(":scope > summary")).toContainText("Cancelled");
  await login(page, "DESIGNER");
  await page.goto(`/dashboard/projects/${project}#space-${fixture.space}`);
  await settled(page);
  const row = page.locator(`#space-${fixture.space}`);
  await expect(row).toHaveAttribute("open", "");
  await disclose(row, "Change design status");
  let status = form(page, "Update status");
  await expect(status.getByLabel("Next design status")).not.toContainText(
    "Completed",
  );
  for (const next of ["In Progress", "Submitted"]) {
    await status.getByLabel("Next design status").selectOption(next);
    await status
      .getByLabel("Reason", { exact: true })
      .fill("Designer staging progress");
    await status
      .getByRole("button", { name: "Update status", exact: true })
      .click();
    await expect(row.locator(":scope > summary")).toContainText(next);
  }
  await disclose(page, "Record project activity");
  const activity = form(page, "Record activity");
  await activity.getByLabel("Activity category").selectOption("General Update");
  await activity.getByLabel("Actual activity date").fill(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  await activity
    .getByLabel("Activity description")
    .fill("Kitchen design submitted for Lead Designer review");
  await activity
    .getByLabel("Change reason", { exact: true })
    .fill("UI-R2 timeline verification");
  await activity
    .getByRole("button", { name: "Record activity", exact: true })
    .click();
  await expect(activity.getByText("Change saved with history.")).toBeVisible();
  await login(page, "LEAD");
  await page.goto(`/dashboard/projects/${project}#space-${fixture.space}`);
  await settled(page);
  await disclose(
    page.locator(`#space-${fixture.space}`),
    "Change design status",
  );
  status = form(page, "Update status");
  await status.getByLabel("Next design status").selectOption("Completed");
  await status
    .getByLabel("External approval reference")
    .fill("UI-R2 synthetic client acceptance");
  await status
    .getByLabel("Reason", { exact: true })
    .fill("Approved kitchen design");
  await status
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Project at a glance" }),
  ).toContainText("100.0%");
  await status.getByLabel("Next design status").selectOption("For Revision");
  await status
    .getByLabel("Reason", { exact: true })
    .fill("Client requested an additional shelf");
  await status
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await expect(page.locator(`#space-${fixture.space}`)).toContainText(
    "Revision 1",
  );
  await page.reload();
  await settled(page);
  await expect(page.locator(`#space-${fixture.space}`)).toContainText(
    "For Revision",
  );
  await disclose(page, "Space history \\(latest 100 events\\)");
  await expect(
    page
      .getByText("Client requested an additional shelf", { exact: false })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Timeline category", exact: true })
    .selectOption("General Update");
  await page
    .getByRole("button", { name: "Filter timeline", exact: true })
    .click();
  await settled(page);
  await expect(page.locator(".project-timeline")).toContainText(
    "Kitchen design submitted for Lead Designer review",
  );
  console.log(
    "UI-R2 core journey passed; dedicated staging fixture retained with immutable history.",
  );
});
for (const actor of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"])
  test(`UI-R2 ${actor}: authorized project links, responsive themes, disclosure keyboard and role restrictions`, async ({
    page,
  }) => {
    await login(page, actor);
    const saved = JSON.parse(
      readFileSync(`${root}/fixture.json`, "utf8"),
    ) as typeof fixture;
    await page.goto(`/dashboard/projects/${saved.project}`);
    await settled(page);
    if (actor === "OPS") {
      await expect(
        page.getByRole("heading", { name: "Pipeline overview", exact: true }),
      ).toBeVisible();
      await expect(page.locator("#project-spaces")).toHaveCount(0);
      await expect(
        page.getByText("Countertop confirmed.", { exact: false }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("group", { name: "Project at a glance" }),
      ).toHaveCount(0);
      return;
    }
    await expect(
      page.getByRole("heading", { name: saved.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('nav[aria-label="Project workspace"][data-ready="true"]'),
    ).toBeVisible();
    await page.getByRole("link", { name: "Spaces", exact: true }).click();
    await expect(page).toHaveURL(/#project-spaces$/);
    await page.getByRole("link", { name: "Activities", exact: true }).click();
    await expect(page).toHaveURL(/#project-activities$/);
    const row = page.locator(`#space-${saved.space}`);
    await row.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(row).toHaveAttribute("open", "");
    expect(
      await row
        .locator(":scope > summary svg")
        .evaluate((el) => getComputedStyle(el).transform),
    ).not.toBe("none");
    if (actor === "BDM") {
      await expect(
        row.getByRole("button", { name: "Update status", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Record activity", exact: true }),
      ).toHaveCount(0);
    } else if (actor === "DESIGNER") {
      await expect(
        page.getByRole("button", { name: "Create space", exact: true }),
      ).toHaveCount(0);
    }
    const reports = [];
    for (const theme of ["Light", "Dark"]) {
      await page
        .getByRole("button", { name: "Choose appearance", exact: true })
        .click();
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const a = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      reports.push({
        theme,
        violations: a.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        })),
        incomplete: a.incomplete.map((v) => v.id),
      });
      expect.soft(a.violations.map((v) => v.id)).toEqual([]);
    }
    writeFileSync(
      `${root}/${actor.toLowerCase()}-a11y.json`,
      JSON.stringify(reports, null, 2),
    );
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Workspace navigation" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation", exact: true }),
    ).toBeFocused();
  });
test("UI-R2 unrelated BDM and unassigned Designer cannot open the acceptance lead or project", async ({
  page,
}) => {
  const saved = JSON.parse(
    readFileSync(`${root}/fixture.json`, "utf8"),
  ) as typeof fixture;
  for (const actor of ["OTHER_BDM", "UNASSIGNED"]) {
    await login(page, actor);
    await page.goto(`/dashboard/projects/${saved.project}`);
    await expect(
      page.getByRole("heading", {
        name: "This space is still uncharted.",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(`/dashboard/leads/${saved.lead}`);
    if (actor === "OTHER_BDM")
      await expect(
        page.getByRole("heading", {
          name: "This space is still uncharted.",
          exact: true,
        }),
      ).toBeVisible();
    else await expect(page).toHaveURL(/restricted=1/);
  }
});

test("UI-R2: project/lead directory filters, bulk assignments, editing and an empty timeline", async ({
  page,
}) => {
  const saved = JSON.parse(
    readFileSync(`${root}/fixture.json`, "utf8"),
  ) as typeof fixture;
  await login(page, "LEAD");
  await page.goto("/dashboard/projects");
  await settled(page);
  await page.getByLabel("Search projects", { exact: true }).fill(saved.name);
  await page
    .getByRole("combobox", { name: "Commercial stage", exact: true })
    .selectOption("For Quotation");
  await page
    .getByRole("combobox", { name: "Sort projects", exact: true })
    .selectOption("name");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await settled(page);
  await expect(
    page.getByRole("heading", { name: saved.name, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 project", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(saved.name) }).click();
  await settled(page);
  await disclose(page, "Bulk reassignment");
  const bulk = form(page, "Reassign selected spaces");
  await bulk.locator('input[name="spaces"]').first().check();
  await bulk
    .getByLabel("Primary Designer", { exact: true })
    .selectOption(id("DESIGNER"));
  await bulk.locator(`input[name="support"][value="${id("LEAD")}"]`).check();
  await bulk
    .getByLabel("Reason", { exact: true })
    .fill("UI-R2 supporting design assignment verification");
  await bulk
    .getByRole("button", { name: "Reassign selected spaces", exact: true })
    .click();
  await expect(
    bulk.getByText("Selected spaces reassigned together."),
  ).toBeVisible();
  const row = page.locator(`#space-${saved.space}`);
  await row.locator(":scope > summary").click();
  await disclose(row, "Edit space");
  const edit = row.locator("form").filter({
    has: page.getByRole("button", { name: "Save space", exact: true }),
  });
  await edit
    .getByLabel("Space name", { exact: true })
    .fill("Kitchen — confirmed");
  await edit.getByLabel("Design deadline", { exact: true }).fill("2026-12-01");
  await edit
    .getByLabel("Reason", { exact: true })
    .fill("Confirm the kitchen deadline and display name");
  await edit.getByRole("button", { name: "Save space", exact: true }).click();
  await expect(row.locator(":scope > summary")).toContainText(
    "Kitchen — confirmed",
  );
  await page.reload();
  await settled(page);
  await expect(row.locator(":scope > summary")).toContainText("2026-12-01");
  await page.getByLabel("From date", { exact: true }).fill("2040-01-01");
  await page.getByLabel("To date", { exact: true }).fill("2040-01-02");
  await page
    .getByRole("button", { name: "Filter timeline", exact: true })
    .click();
  await settled(page);
  await expect(
    page.getByText("No authorized events match these filters.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/dashboard/leads?status=All");
  await settled(page);
  await page
    .getByLabel("Search project or client name", { exact: true })
    .fill(saved.name);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("Accepted");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await settled(page);
  await expect(
    page.getByRole("link", { name: new RegExp(saved.name) }),
  ).toBeVisible();
  await page
    .getByLabel("Search project or client name", { exact: true })
    .fill(`missing-${randomUUID()}`);
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await settled(page);
  await expect(
    page.getByRole("heading", { name: "No leads to show", exact: true }),
  ).toBeVisible();
});

for (const actor of ["BDM", "OPS"])
  test(`Project directory grid/list switch: ${actor}`, async ({ page }) => {
    await login(page, actor);
    await page.goto("/dashboard/projects?sort=name");
    await settled(page);
    const controls = page.getByRole("group", {
      name: "Project view",
      exact: true,
    });
    await controls.getByRole("link", { name: "List", exact: true }).click();
    await settled(page);
    await expect(page.locator("[data-project-view]")).toHaveAttribute(
      "data-project-view",
      "list",
    );
    await expect(page).toHaveURL(/sort=name.*view=list/);
    await expect(
      controls.getByRole("link", { name: "List", exact: true }),
    ).toHaveAttribute("aria-current", "true");
    await page.reload();
    await settled(page);
    await expect(page.locator("[data-project-view]")).toHaveAttribute(
      "data-project-view",
      "list",
    );
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await settled(page);
    await expect(page.locator("[data-project-view]")).toHaveAttribute(
      "data-project-view",
      "list",
    );
    for (const theme of ["Light", "Dark"]) {
      await page
        .getByRole("button", { name: "Choose appearance", exact: true })
        .click();
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const [size, width, height] of [
        ["desktop", 1440, 900],
        ["laptop", 1280, 800],
        ["mobile", 390, 844],
      ] as const) {
        const snapshot = await page.context().newPage();
        await snapshot.setViewportSize({ width, height });
        await snapshot.goto(page.url());
        await settled(snapshot);
        await expect(
          snapshot.getByRole("button", {
            name: "Choose appearance",
            exact: true,
          }),
        ).toBeEnabled();
        await expect(snapshot.locator("html")).toHaveClass(
          theme === "Dark" ? /dark/ : /light/,
        );
        expect(
          await snapshot.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(
          snapshot.getByRole("button", {
            name: "Choose appearance",
            exact: true,
          }),
        ).toHaveCount(1);
        await snapshot.screenshot({
          path: `${root}/${actor.toLowerCase()}-projects-list-${theme.toLowerCase()}-${size}.png`,
          animations: "disabled",
        });
        await snapshot.close();
      }
    }
    await controls.getByRole("link", { name: "Grid", exact: true }).click();
    await settled(page);
    await expect(page.locator("[data-project-view]")).toHaveAttribute(
      "data-project-view",
      "grid",
    );
  });
