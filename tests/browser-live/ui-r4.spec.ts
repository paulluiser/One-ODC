import { test, expect, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  loadStagingEnvironment,
  stagingProject,
  installationSetup,
  quotationSpaces,
} from "../helpers/staging";
loadStagingEnvironment();
const root = "artifacts/verification/ui-r4";
mkdirSync(root, { recursive: true });
const ids = JSON.parse(
  readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
).accounts as { actor: string; id: string }[];
const id = (a: string) => ids.find((x) => x.actor === a)!.id;
async function login(p: Page, a: string) {
  await p.context().clearCookies();
  await p.goto("/login");
  await p
    .getByLabel("Work email")
    .fill(process.env[`ONE_ODC_TEST_${a}_EMAIL`]!);
  await p
    .getByLabel("Password", { exact: true })
    .fill(process.env[`ONE_ODC_TEST_${a}_PASSWORD`]!);
  await p.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(p).toHaveURL(/\/dashboard$/);
  await expect(
    p.getByRole("button", { name: "Choose appearance", exact: true }),
  ).toBeEnabled();
}
async function closeEditor(p: Page) {
  await p.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(p.getByRole("dialog")).toHaveCount(0);
}
async function confirm(
  p: Page,
  form: Locator,
  label: string,
  confirmation: string,
) {
  await form.getByRole("button", { name: label, exact: true }).click();
  await p.getByRole("button", { name: confirmation, exact: true }).click();
  await expect(form.locator(".form-success")).toBeVisible();
  await expect(
    form.getByRole("button", { name: label, exact: true }),
  ).toBeEnabled();
  await closeEditor(p);
}
async function disclose(p: Page, label: string, within?: Locator) {
  const s = (within ?? p)
    .locator("summary")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .first();
  if ((await s.locator("..").getAttribute("open")) === null) await s.click();
}
test("UI-R4 supplier create/edit/deactivate/reactivate, search, history and logistics transitions", async ({
  page: p,
}) => {
  const project = await stagingProject(
    "UI-R4 operations",
    id("DESIGNER"),
    id("OPS"),
  );
  const setup = await installationSetup(project.id, id("DESIGNER"), id("OPS"));
  const name = `UI-R4 supplier ${randomUUID().slice(0, 8)}`;
  writeFileSync(
    `${root}/fixture.json`,
    JSON.stringify({ ...project, spaces: setup.spaces, supplier: name }),
  );
  await login(p, "OPS");
  await p.goto("/dashboard/suppliers");
  await p.getByRole("button", { name: "Add supplier", exact: true }).click();
  let form = p.getByRole("form", { name: "Create supplier", exact: true });
  await form.getByLabel("Supplier name", { exact: false }).fill(name);
  await form
    .getByLabel("Contact person (optional)", { exact: true })
    .fill("Staging logistics coordinator");
  await form
    .getByLabel("Contact details (optional)", { exact: true })
    .fill("Authorized synthetic contact");
  await form
    .getByLabel("Brand (optional)", { exact: true })
    .selectOption("Stosa");
  await form
    .getByLabel("Change reason", { exact: false })
    .fill("Authorized staging supplier");
  await confirm(p, form, "Create supplier", "Confirm change");
  await p.getByLabel("Search supplier name", { exact: true }).fill(name);
  await p.getByRole("button", { name: "Search", exact: true }).click();
  const row = p.getByRole("row", { name: `Supplier ${name}`, exact: true });
  await expect(row).toContainText("Stosa");
  for (const active of [false, true]) {
    await row
      .getByRole("button", { name: `Edit supplier: ${name}`, exact: true })
      .click();
    form = p.getByRole("form", { name: "Update supplier", exact: true });
    await form
      .getByLabel("Active supplier", { exact: true })
      .setChecked(active);
    await form
      .getByLabel("Change reason", { exact: false })
      .fill(
        active
          ? "Restore supplier availability"
          : "Temporarily deactivate staging supplier",
      );
    await confirm(p, form, "Update supplier", "Confirm change");
    await expect(
      row.getByText(active ? "Active" : "Inactive", { exact: true }),
    ).toBeVisible();
  }
  await disclose(p, "Supplier audit history", row);
  await expect(row).toContainText("Restore supplier availability");
  await p.reload();
  await expect(row).toBeVisible();
  await p.goto(`/dashboard/projects/${project.id}?tab=logistics`);
  await p
    .getByRole("button", { name: "Add logistics record", exact: true })
    .click();
  form = p.getByRole("form", { name: "Create logistics record", exact: true });
  await form
    .getByLabel("Supplier", { exact: true })
    .selectOption({ label: name });
  await form
    .getByLabel("Supplier reference (optional)", { exact: true })
    .fill("UI-R4 shipment");
  await form
    .getByLabel("Change reason", { exact: false })
    .fill("Initial procurement record");
  await confirm(p, form, "Create logistics record", "Confirm change");
  const article = p
    .locator('article[id^="logistics-"]')
    .filter({ hasText: name });
  await expect(article).toContainText("Current stage: RFP");
  for (const status of ["In Transit", "On Hold", "In Transit", "Delivered"]) {
    await article
      .getByRole("button", {
        name: "Edit logistics / change status",
        exact: true,
      })
      .click();
    form = p.getByRole("form", { name: "Update logistics", exact: true });
    await form
      .getByLabel("Logistics status", { exact: true })
      .selectOption(status);
    await form
      .getByLabel("Change reason", { exact: false })
      .fill(`Reasoned staging transition to ${status}`);
    await confirm(p, form, "Update logistics", "Confirm change");
    await expect(article).toContainText(`Current stage: ${status}`);
  }
  await expect(article).toContainText("Skipped stages");
  await expect(article.locator('[aria-current="step"]')).toHaveCount(1);
  await disclose(p, "Logistics status and audit history", article);
  await expect(article).toContainText(
    "Reasoned staging transition to Delivered",
  );
  await p.reload();
  await expect(article).toContainText("Delivered");
});
test("UI-R4 installation schedule/reschedule, completion, Not Applicable, readiness and project completion", async ({
  page: p,
}) => {
  const f = JSON.parse(readFileSync(`${root}/fixture.json`, "utf8"));
  const url = `/dashboard/projects/${f.id}?tab=installation`;
  await login(p, "DESIGNER");
  await p.goto(url);
  const first = p.locator(`#installation-${f.spaces[0]}`),
    second = p.locator(`#installation-${f.spaces[1]}`);
  await expect(
    second.getByRole("button", {
      name: "Schedule or update installation",
      exact: true,
    }),
  ).toHaveCount(0);
  for (const [status, date, reason] of [
    ["Scheduled", "2026-11-01", "Initial installation schedule"],
    ["Scheduled", "2026-11-02", "Client reschedule"],
    ["In Progress", "", "Work commenced"],
    ["Completed", "", "Installation checked"],
  ]) {
    await first
      .getByRole("button", {
        name: "Schedule or update installation",
        exact: true,
      })
      .click();
    const form = p.getByRole("form", {
      name: "Save installation",
      exact: true,
    });
    await form
      .getByLabel("Installation status", { exact: true })
      .selectOption(status);
    if (date)
      await form
        .getByLabel("Scheduled installation date", { exact: true })
        .fill(date);
    await form.getByLabel("Change reason", { exact: false }).fill(reason);
    await confirm(p, form, "Save installation", "Confirm installation change");
    await expect(first.getByRole("heading", { level: 3 })).toContainText(
      status,
    );
  }
  await login(p, "OPS");
  await p.goto(url);
  await second
    .getByRole("button", {
      name: "Schedule or update installation",
      exact: true,
    })
    .click();
  let form = p.getByRole("form", { name: "Save installation", exact: true });
  await form
    .getByLabel("Installation status", { exact: true })
    .selectOption("Not Applicable");
  await form
    .getByLabel("Change reason", { exact: false })
    .fill("No physical installation for this synthetic Space");
  await confirm(p, form, "Save installation", "Confirm installation change");
  await expect(
    p.getByText("Ready for operational completion", { exact: true }),
  ).toBeVisible();
  await login(p, "LEAD");
  await p.goto(url);
  await p
    .getByRole("button", { name: "Complete project operations", exact: true })
    .click();
  form = p.getByRole("form", {
    name: "Confirm Operational Completion",
    exact: true,
  });
  await form
    .getByLabel("Required completion reason", { exact: true })
    .fill("UI-R4 prerequisites checked");
  await form
    .getByRole("button", {
      name: "Confirm Operational Completion",
      exact: true,
    })
    .click();
  await p
    .getByRole("button", { name: "Confirm completion", exact: true })
    .click();
  await expect(
    p.getByText("Operationally Completed", { exact: true }),
  ).toBeVisible();
  await expect(
    p.getByRole("heading", { name: "Operational readiness", exact: true }),
  ).toBeFocused();
  await p.reload();
  await expect(
    p.getByText("Operationally Completed", { exact: true }),
  ).toBeVisible();
  await disclose(p, "Operational completion history");
  await expect(p.getByText(/UI-R4 prerequisites checked/)).toBeVisible();
  await p
    .getByRole("link", {
      name: "Reopen through Project monitoring controls",
      exact: true,
    })
    .click();
  if (
    await p
      .locator("summary")
      .filter({ hasText: /^Activities and project controls$/ })
      .count()
  )
    await disclose(p, "Activities and project controls");
  await disclose(p, "Project controls and deadline revisions");
  const reopen = p.getByRole("button", { name: "Reopen Project", exact: true });
  const control = reopen.locator("xpath=ancestor::form");
  await control
    .getByLabel("Change reason", { exact: false })
    .fill("UI-R4 additional operational work");
  await reopen.click();
  await p.getByRole("button", { name: "Confirm reopen", exact: true }).click();
  await p.goto(url);
  await expect(
    p
      .getByRole("button", {
        name: "Schedule or update installation",
        exact: true,
      })
      .first(),
  ).toBeVisible();
});
test("UI-R4 pending handoff gates operational editors and acknowledgment persists", async ({
  page: p,
}) => {
  const project = await stagingProject(
    "UI-R4 pending handoff",
    id("DESIGNER"),
    id("OPS"),
  );
  writeFileSync(`${root}/pending-fixture.json`, JSON.stringify(project));
  const url = `/dashboard/projects/${project.id}`;
  await login(p, "OPS");
  await p.goto(`${url}?tab=logistics`);
  await expect(
    p.getByRole("heading", { name: "Pipeline overview", exact: true }),
  ).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Add logistics record", exact: true }),
  ).toHaveCount(0);
  await login(p, "BDM");
  await p.goto(`${url}?tab=finance`);
  await p.getByRole("button", { name: "Adjust Sale", exact: true }).click();
  let form = p.getByRole("form", { name: "Save Sale", exact: true });
  await form.getByLabel("Sale amount (PHP)", { exact: true }).fill("250000.10");
  await confirm(p, form, "Save Sale", "Confirm financial change");
  await p.goto(`${url}?tab=logistics`);
  await p
    .getByRole("button", { name: "Commercial closure", exact: true })
    .click();
  form = p.getByRole("form", { name: "Close Sale", exact: true });
  await form.getByRole("button", { name: "Close Sale", exact: true }).click();
  await p
    .getByRole("button", { name: "Confirm Close Sale", exact: true })
    .click();
  await expect(
    p.getByText("Pending Acknowledgment", { exact: true }),
  ).toBeVisible();
  await login(p, "OPS");
  await p.goto(`${url}?tab=logistics`);
  await expect(
    p.getByRole("button", { name: "Add logistics record", exact: true }),
  ).toHaveCount(0);
  await p
    .getByRole("button", { name: "Acknowledge Handoff", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Confirm acknowledgment", exact: true })
    .click();
  await expect(
    p.getByRole("button", { name: "Add logistics record", exact: true }),
  ).toBeVisible();
  await p.reload();
  await expect(
    p.getByRole("button", { name: "Add logistics record", exact: true }),
  ).toBeVisible();
});
test("UI-R4 admin contextual access editor, role fields, invitation configuration and audit history", async ({
  page: p,
}) => {
  await login(p, "ADMIN");
  await p.goto("/dashboard/users");
  await expect(
    p.getByRole("table", { name: "Team accounts and access", exact: true }),
  ).toBeVisible();
  await p
    .getByRole("button", { name: "Invite a team member", exact: true })
    .click();
  await expect(
    p.getByRole("button", { name: "Send invitation", exact: true }),
  ).toBeDisabled();
  await closeEditor(p);
  const user = ids.find((x) => x.actor === "UNASSIGNED")!.id;
  let original = "";
  const row = p.getByRole("row").filter({
    has: p.getByRole("button", { name: /Manage access: .*UNASSIGNED/ }),
  });
  await row.getByRole("button").click();
  const form = p.getByRole("dialog").locator("form");
  original = await form
    .getByLabel("Display name", { exact: true })
    .inputValue();
  const originalRole = await form
    .getByLabel("Role", { exact: true })
    .inputValue();
  const originalActive = await form
    .getByLabel("Active account", { exact: true })
    .isChecked();
  try {
    await form.getByLabel("Role", { exact: true }).selectOption("bdm");
    await form.getByLabel("Active account", { exact: true }).uncheck();
    await form
      .getByLabel("Display name", { exact: true })
      .fill(`${original} UI-R4`);
    await form
      .getByLabel("Change reason *", { exact: true })
      .fill("UI-R4 staging administrative display correction");
    await form
      .getByRole("button", { name: "Update access", exact: true })
      .click();
    await expect(form.locator(".form-success")).toBeVisible();
    await expect(
      form.getByRole("button", { name: "Update access", exact: true }),
    ).toBeEnabled();
    await closeEditor(p);
    await p.reload();
    await expect(
      p
        .getByRole("cell", { name: `${original} UI-R4`, exact: true })
        .or(
          p.getByRole("rowheader", { name: `${original} UI-R4`, exact: true }),
        ),
    ).toBeVisible();
    await disclose(p, "Recent administrative history");
    await expect(
      p.getByText("access changed", { exact: true }).first(),
    ).toBeVisible();
  } finally {
    await p.goto("/dashboard/users");
    await p
      .getByRole("button", {
        name: `Manage access: ${original} UI-R4`,
        exact: true,
      })
      .click();
    const restore = p.getByRole("dialog").locator("form");
    await restore.getByLabel("Display name", { exact: true }).fill(original);
    await restore
      .getByLabel("Role", { exact: true })
      .selectOption(originalRole);
    await restore
      .getByLabel("Active account", { exact: true })
      .setChecked(originalActive);
    await restore
      .getByLabel("Change reason *", { exact: true })
      .fill("Restore dedicated staging account after UI-R4 verification");
    await restore
      .getByRole("button", { name: "Update access", exact: true })
      .click();
    await expect(restore.locator(".form-success")).toBeVisible();
    await expect(
      restore.getByRole("button", { name: "Update access", exact: true }),
    ).toBeEnabled();
    await closeEditor(p);
  }
  expect(user).toBeTruthy();
});
for (const actor of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"])
  test(`UI-R4 ${actor} authorized operational views`, async ({ page: p }) => {
    const f = JSON.parse(readFileSync(`${root}/fixture.json`, "utf8"));
    await login(p, actor);
    await p.goto(`/dashboard/projects/${f.id}?tab=installation`);
    await expect(
      p.getByRole("heading", { name: "Installation", exact: true }),
    ).toBeVisible();
    await p.goto(`/dashboard/projects/${f.id}?tab=logistics`);
    await expect(
      p.getByRole("heading", { name: "Supplier & Logistics", exact: true }),
    ).toBeVisible();
    if (["BDM", "DESIGNER"].includes(actor)) {
      await expect(
        p.getByRole("button", { name: "Add logistics record", exact: true }),
      ).toHaveCount(0);
      await p.goto("/dashboard/suppliers");
      await expect(p).toHaveURL(/dashboard\?restricted=1/);
    }
    if (actor !== "ADMIN") {
      await p.goto("/dashboard/users");
      await expect(p).toHaveURL(/dashboard\?restricted=1/);
    }
  });
test("UI-R4 fresh Light/Dark desktop laptop mobile visual and keyboard acceptance", async ({
  browser,
}) => {
  const f = JSON.parse(readFileSync(`${root}/fixture.json`, "utf8")),
    manifest = [];
  const pending = JSON.parse(
    readFileSync(`${root}/pending-fixture.json`, "utf8"),
  );
  if (!pending.visualSpaces) {
    pending.visualSpaces = await quotationSpaces(pending.id, id("DESIGNER"));
    writeFileSync(`${root}/pending-fixture.json`, JSON.stringify(pending));
  }
  for (const actor of ["ADMIN", "OPS", "LEAD"]) {
    const ctx = await browser.newContext({ reducedMotion: "reduce" }),
      auth = await ctx.newPage();
    await login(auth, actor);
    try {
      for (const theme of ["Light", "Dark"]) {
        await auth
          .getByRole("button", { name: "Choose appearance", exact: true })
          .click();
        await auth.getByRole("button", { name: theme, exact: true }).click();
        for (const [size, width, height] of [
          ["desktop", 1440, 900],
          ["laptop", 1280, 800],
          ["mobile", 390, 844],
        ] as const) {
          for (const [screen, url] of actor === "ADMIN"
            ? [
                ["users", "/dashboard/users"],
                [
                  "suppliers",
                  `/dashboard/suppliers?q=${encodeURIComponent(f.supplier)}`,
                ],
              ]
            : [
                ["logistics", `/dashboard/projects/${f.id}?tab=logistics`],
                [
                  "installation",
                  `/dashboard/projects/${f.id}?tab=installation`,
                ],
                [
                  "readiness",
                  `/dashboard/projects/${pending.id}?tab=installation`,
                ],
              ]) {
            const p = await ctx.newPage();
            await p.setViewportSize({ width, height });
            await p.goto(url);
            await expect(
              p.locator("[data-ui-r2]:visible").first(),
            ).toBeVisible();
            await expect(
              p.getByRole("button", { name: "Choose appearance", exact: true }),
            ).toBeEnabled();
            await expect(p.locator(".section-skeleton:visible")).toHaveCount(0);
            await expect(
              p.locator('section[aria-busy="true"]:visible'),
            ).toHaveCount(0);
            if (["installation", "readiness"].includes(screen))
              await expect(
                p.getByRole("heading", {
                  name: "Operational readiness",
                  exact: true,
                }),
              ).toBeVisible();
            if (screen === "logistics")
              await expect(
                p.getByRole("heading", {
                  name: "Supplier & Logistics",
                  exact: true,
                }),
              ).toBeVisible();
            expect(
              await p.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            await expect(p.locator("html")).toHaveClass(
              theme === "Dark" ? /dark/ : /light/,
            );
            await p.screenshot({
              path: `${root}/${actor.toLowerCase()}-${screen}-${theme.toLowerCase()}-${size}.png`,
              fullPage: true,
            });
            manifest.push({ actor, screen, theme, size });
            if (size === "mobile") {
              if (screen === "logistics") {
                const stages = p.getByRole("region", {
                  name: "Logistics stage sequence",
                  exact: true,
                });
                await stages.focus();
                await p.keyboard.press("ArrowRight");
                await expect
                  .poll(() => stages.evaluate((e) => e.scrollLeft))
                  .toBeGreaterThan(0);
              }
              const a = await new AxeBuilder({ page: p })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze();
              manifest.push({
                actor,
                screen,
                theme,
                size,
                violations: a.violations.map((v) => ({
                  id: v.id,
                  targets: v.nodes.map((n) => n.target),
                })),
                incomplete: a.incomplete.map((v) => v.id),
              });
              expect.soft(a.violations.map((v) => v.id)).toEqual([]);
            }
            const trigger =
              screen === "suppliers"
                ? p.getByRole("button", {
                    name: `Edit supplier: ${f.supplier}`,
                    exact: true,
                  })
                : screen === "users"
                  ? p.getByRole("button", {
                      name: "Invite a team member",
                      exact: true,
                    })
                  : screen === "logistics"
                    ? p.getByRole("button", {
                        name: "Add logistics record",
                        exact: true,
                      })
                    : p
                        .getByRole("button", {
                          name: "Schedule or update installation",
                          exact: true,
                        })
                        .first();
            await trigger.click();
            await expect(p.getByRole("dialog")).toBeVisible();
            await p.screenshot({
              path: `${root}/${actor.toLowerCase()}-${screen}-dialog-${theme.toLowerCase()}-${size}.png`,
            });
            await p.keyboard.press("Escape");
            await expect(trigger).toBeFocused();
            await p.close();
          }
        }
      }
      await auth
        .getByRole("button", { name: "Choose appearance", exact: true })
        .click();
      await auth.getByRole("button", { name: "System", exact: true }).click();
      await auth.emulateMedia({ colorScheme: "dark" });
      await expect(auth.locator("html")).toHaveClass(/dark/);
      await auth.emulateMedia({ colorScheme: "light" });
      await expect(auth.locator("html")).toHaveClass(/light/);
      await auth
        .getByRole("button", { name: "Choose appearance", exact: true })
        .click();
      await expect(
        auth.getByRole("button", { name: "System", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await auth.keyboard.press("Escape");
    } finally {
      await ctx.close();
    }
  }
  writeFileSync(
    `${root}/visual-checks.json`,
    JSON.stringify(manifest, null, 2),
  );
});

test("UI-R4 terminal logistics cancellation/reopening requires manager override and installation corrections preserve history", async ({
  page: p,
}) => {
  const f = JSON.parse(readFileSync(`${root}/fixture.json`, "utf8")),
    url = `/dashboard/projects/${f.id}?tab=logistics`;
  await login(p, "OPS");
  await p.goto(url);
  let article = p
    .locator('article[id^="logistics-"]')
    .filter({ hasText: f.supplier });
  await article
    .getByRole("button", {
      name: "Edit logistics / change status",
      exact: true,
    })
    .click();
  let form = p.getByRole("form", { name: "Update logistics", exact: true });
  await form
    .getByLabel("Logistics status", { exact: true })
    .selectOption("Cancelled");
  await form
    .getByLabel("Change reason", { exact: false })
    .fill("Verify terminal correction authorization");
  await form
    .getByRole("button", { name: "Update logistics", exact: true })
    .click();
  await p.getByRole("button", { name: "Confirm change", exact: true }).click();
  await expect(
    p
      .getByRole("alert")
      .filter({ hasText: /manager override/i })
      .first(),
  ).toBeVisible();
  await p.getByRole("button", { name: "Go back", exact: true }).click();
  await closeEditor(p);
  await login(p, "LEAD");
  await p.goto(url);
  article = p
    .locator('article[id^="logistics-"]')
    .filter({ hasText: f.supplier });
  for (const status of ["Cancelled", "Delivered"]) {
    await article
      .getByRole("button", {
        name: "Edit logistics / change status",
        exact: true,
      })
      .click();
    form = p.getByRole("form", { name: "Update logistics", exact: true });
    await form
      .getByLabel("Logistics status", { exact: true })
      .selectOption(status);
    await form
      .getByLabel("Change reason", { exact: false })
      .fill(`UI-R4 documented terminal ${status}`);
    await form
      .getByRole("checkbox", { name: /Documented manager override/ })
      .check();
    await confirm(p, form, "Update logistics", "Confirm change");
    await expect(article).toContainText(`Current stage: ${status}`);
  }
  await disclose(p, "Logistics status and audit history", article);
  await expect(article).toContainText("UI-R4 documented terminal Cancelled");
  await expect(article).toContainText("Audited administrative override");
  await p.goto(`/dashboard/projects/${f.id}?tab=installation`);
  const space = p.locator(`#installation-${f.spaces[0]}`);
  for (const status of ["In Progress", "Completed"]) {
    await space
      .getByRole("button", {
        name: "Schedule or update installation",
        exact: true,
      })
      .click();
    form = p.getByRole("form", { name: "Save installation", exact: true });
    await form
      .getByLabel("Installation status", { exact: true })
      .selectOption(status);
    await form
      .getByLabel("Change reason", { exact: false })
      .fill(`UI-R4 audited installation correction ${status}`);
    await confirm(p, form, "Save installation", "Confirm installation change");
    await expect(space.getByRole("heading", { level: 3 })).toContainText(
      status,
    );
  }
  await disclose(p, "Installation history", space);
  await expect(space).toContainText(
    "UI-R4 audited installation correction In Progress",
  );
  await p.reload();
  await expect(space.getByRole("heading", { level: 3 })).toContainText(
    "Completed",
  );
});
