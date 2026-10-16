import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  loadStagingEnvironment,
  stagingProject,
  quotationSpaces,
  installationSetup,
} from "../helpers/staging";
loadStagingEnvironment();
const root = "artifacts/verification/ui-r3";
mkdirSync(root, { recursive: true });
const ids = JSON.parse(
  readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
).accounts as { actor: string; id: string }[];
const id = (actor: string) => ids.find((a) => a.actor === actor)!.id;
async function login(page: Page, actor: string) {
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
async function freshLogin(page: Page, actor: string) {
  await page.context().clearCookies();
  await login(page, actor);
}
async function decision(
  page: Page,
  label: string,
  remarks: string,
  confirm: string,
) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const form = page.getByRole("form", { name: label, exact: true });
  await form.getByRole("textbox").fill(remarks);
  await form.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: confirm, exact: true }).click();
}
async function disclose(page: Page, label: string) {
  const s = page
    .locator("summary")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .first();
  if ((await s.locator("..").getAttribute("open")) === null) await s.click();
}
async function financeConfirm(page: Page, form: Locator, label: string) {
  await form.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm financial change", exact: true })
    .click();
  await expect(form.getByRole("status")).toBeVisible();
  await expect(form.locator("fieldset").first()).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const close = page.getByRole("button", { name: "Close editor", exact: true });
  if (await close.count()) {
    await close.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
}
test("UI-R3 bounded concurrent SSR reads (three roles, two waves)", async ({
  browser,
}) => {
  const project = JSON.parse(
    readFileSync(
      "artifacts/verification/monitoring-closed-fixture.json",
      "utf8",
    ),
  ).id;
  const contexts = [];
  const pages = [];
  for (const actor of ["LEAD", "BDM", "OPS"]) {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    const page = await ctx.newPage();
    await login(page, actor);
    pages.push(page);
  }
  try {
    for (let wave = 0; wave < 2; wave++)
      await Promise.all(
        pages.map(async (page) => {
          await page.goto(`/dashboard/projects/${project}?tab=finance`);
          await expect(
            page.getByRole("heading", {
              name: "Financial summary",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByText("Workspace records could not be loaded.", {
              exact: false,
            }),
          ).toHaveCount(0);
        }),
      );
  } finally {
    for (const ctx of contexts) await ctx.close();
  }
});
test("UI-R3 quotation draft, return, corrected approval, immutable history and comparison", async ({
  page,
}) => {
  const p = await stagingProject("UI-R3 quotation", id("DESIGNER"), id("OPS"));
  const spaces = await quotationSpaces(p.id, id("DESIGNER"));
  const url = `/dashboard/projects/${p.id}?tab=quotation`;
  writeFileSync(`${root}/quotation-fixture.json`, JSON.stringify(p));
  await login(page, "DESIGNER");
  await page.goto(url);
  await page
    .getByRole("button", { name: "Create quotation draft", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Quotation · Draft version 1",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`${url}&space=${spaces[0]}`);
  let editor = page.getByRole("form", {
    name: "Edit quotation: Kitchen",
    exact: true,
  });
  await editor.getByRole("button", { name: "Add item", exact: true }).click();
  await editor
    .getByLabel("Item 1 description", { exact: true })
    .fill("Oak cabinet");
  await editor
    .getByLabel("Unit price for item 1 (PHP)", { exact: true })
    .fill("100.10");
  await editor.getByRole("button", { name: "Add item", exact: true }).click();
  await editor
    .getByLabel("Item 2 description", { exact: true })
    .fill("Precision line");
  await editor.getByLabel("Quantity for item 2", { exact: true }).fill("0.005");
  await editor
    .getByLabel("Unit price for item 2 (PHP)", { exact: true })
    .fill("1.00");
  await editor.getByLabel("Change reason").fill("Initial itemization");
  // Native navigation guard keeps draft changes when discard is declined.
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("link", { name: "Return to quotation overview", exact: true })
    .click();
  await expect(editor).toBeVisible();
  await editor
    .getByRole("button", { name: "Save space items", exact: true })
    .click();
  await expect(editor.getByRole("status")).toHaveText("Quotation saved.");
  await expect(
    editor.getByRole("button", { name: "Save space items", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Quotation summary")).toContainText("₱100.11");
  await page
    .getByRole("link", { name: "Return to quotation overview", exact: true })
    .click();
  await decision(
    page,
    "Submit for Review",
    "Initial quotation ready",
    "Confirm submission",
  );
  await expect(
    page.getByRole("heading", {
      name: "Quotation · Submitted for Review version 1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Edit items for Kitchen", exact: true }),
  ).toHaveCount(0);
  await disclose(page, "Version history and comparison");
  const first = await page
    .getByRole("region", { name: "Quotation version history" })
    .getByRole("link", {
      name: "Version 1 · Submitted for Review",
      exact: true,
    })
    .getAttribute("href");
  const v1 = new URL(first!, "http://localhost:3003").searchParams.get(
    "version",
  )!;
  await freshLogin(page, "BDM");
  await page.goto(url);
  await expect(
    page.getByText("No approved quotation is available.", { exact: true }),
  ).toBeVisible();
  await freshLogin(page, "LEAD");
  await page.goto(url);
  await decision(
    page,
    "Return for Revision",
    "Clarify cabinet finish",
    "Confirm return",
  );
  await expect(
    page.getByRole("heading", {
      name: "Quotation · Returned for Revision version 1",
      exact: true,
    }),
  ).toBeVisible();
  await freshLogin(page, "DESIGNER");
  await page.goto(url);
  await page
    .getByRole("button", { name: "Create corrected draft", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Quotation · Draft version 2",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`${url}&space=${spaces[0]}`);
  editor = page.getByRole("form", {
    name: "Edit quotation: Kitchen",
    exact: true,
  });
  await expect(
    editor.getByLabel("Item 1 description", { exact: true }),
  ).toHaveValue("Oak cabinet");
  await editor
    .getByLabel("Item 1 description", { exact: true })
    .fill("Oak cabinet, matte finish");
  await editor
    .getByLabel("Unit price for item 1 (PHP)", { exact: true })
    .fill("110.10");
  await editor
    .getByLabel("Change reason")
    .fill("Requested finish clarification");
  await editor
    .getByRole("button", { name: "Save space items", exact: true })
    .click();
  await expect(editor.getByRole("status")).toHaveText("Quotation saved.");
  await expect(
    editor.getByRole("button", { name: "Save space items", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Return to quotation overview", exact: true })
    .click();
  await decision(
    page,
    "Submit for Review",
    "Corrected finish",
    "Confirm submission",
  );
  await expect(
    page.getByRole("heading", {
      name: "Quotation · Submitted for Review version 2",
      exact: true,
    }),
  ).toBeVisible();
  await freshLogin(page, "LEAD");
  await page.goto(url);
  await decision(
    page,
    "Approve quotation",
    "Finish confirmed",
    "Confirm approval",
  );
  await expect(
    page.getByRole("heading", {
      name: "Quotation · Approved version 2",
      exact: true,
    }),
  ).toBeVisible();
  await disclose(page, "Version history and comparison");
  await page
    .getByLabel("Compare with version", { exact: true })
    .selectOption(v1);
  await page
    .getByRole("button", { name: "Compare versions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Version 1.*Version 2/i }),
  ).toBeVisible();
  await page.goto(`${url}&version=${v1}`);
  await expect(
    page.getByRole("heading", {
      name: "Quotation · Returned for Revision version 1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Quotation summary")).toContainText("₱100.11");
  await expect(page.getByText("Oak cabinet", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Oak cabinet", { exact: true })).toBeVisible();
  await freshLogin(page, "BDM");
  await page.goto(url);
  await expect(
    page.getByRole("heading", {
      name: "Quotation · Approved version 2",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('select[name="version"] option')).toHaveCount(1);
});
test("UI-R3 finance values, both ledgers correction/void, overpayment and unsaved guard", async ({
  page,
}) => {
  const p = await stagingProject("UI-R3 finance", id("DESIGNER"), id("OPS"));
  await installationSetup(p.id, id("DESIGNER"), id("OPS"));
  writeFileSync(`${root}/finance-fixture.json`, JSON.stringify(p));
  const url = `/dashboard/projects/${p.id}?tab=finance`;
  await login(page, "LEAD");
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Financial summary", exact: true }),
  ).toBeVisible();
  for (const [kind, amount] of [
    ["Sale", "100.10"],
    ["Raw", "60.10"],
  ]) {
    await freshLogin(page, kind === "Sale" ? "BDM" : "LEAD");
    await page.goto(url);
    await page
      .getByRole("button", { name: `Adjust ${kind}`, exact: true })
      .click();
    const form = page.getByRole("form", { name: `Save ${kind}`, exact: true });
    await form.getByLabel(`${kind} amount (PHP)`, { exact: true }).fill(amount);
    await form
      .getByRole("textbox", { name: /reason/i })
      .fill("UI-R3 acceptance adjustment");
    await financeConfirm(page, form, `Save ${kind}`);
    await expect(
      page.getByRole("region", { name: `${kind} management`, exact: true }),
    ).toContainText(`₱${amount}`);
  }
  for (const kind of ["client", "supplier"] as const) {
    const section = page.getByRole("region", {
      name: kind === "client" ? "Client payments" : "Supplier payments",
      exact: true,
    });
    await section
      .getByRole("button", { name: `Add ${kind} payment`, exact: true })
      .click();
    let form = page.getByRole("form", {
      name: `Record ${kind} payment`,
      exact: true,
    });
    await form.getByLabel("Amount (PHP)", { exact: true }).fill("150.10");
    await form
      .getByLabel("Payment method", { exact: true })
      .fill("Bank transfer");
    await form
      .getByLabel("Reference (optional)", { exact: true })
      .fill(`UI-R3 ${kind}`);
    page.once("dialog", (d) => d.dismiss());
    await page
      .getByRole("button", { name: "Close editor", exact: true })
      .click();
    await expect(form).toBeVisible();
    await financeConfirm(page, form, `Record ${kind} payment`);
    await expect(section).toContainText("possible overpayment");
    let row = section.getByRole("row").filter({ hasText: `UI-R3 ${kind}` });
    await row
      .getByRole("button", { name: `Correct ${kind} payment`, exact: true })
      .click();
    form = page.getByRole("form", {
      name: `Correct ${kind} payment`,
      exact: true,
    });
    await form.getByLabel("Amount (PHP)", { exact: true }).fill("10.10");
    await form
      .getByRole("textbox", { name: "Required change reason", exact: true })
      .fill("Correct staging payment amount");
    await financeConfirm(page, form, `Correct ${kind} payment`);
    row = section.getByRole("row").filter({ hasText: `UI-R3 ${kind}` });
    await expect(row).toContainText("₱10.10");
    await row
      .getByRole("button", { name: `Void ${kind} payment`, exact: true })
      .click();
    form = page.getByRole("form", {
      name: `Void ${kind} payment`,
      exact: true,
    });
    await form
      .getByRole("textbox", { name: "Required change reason", exact: true })
      .fill("Staging acceptance void");
    await form
      .getByRole("button", { name: `Void ${kind} payment`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm financial change", exact: true })
      .click();
    await expect(row).toContainText("Voided");
    await expect(
      row.getByRole("button", { name: `Correct ${kind} payment`, exact: true }),
    ).toHaveCount(0);
    await row
      .locator("summary")
      .filter({ hasText: "Payment audit history" })
      .click();
    await expect(row).toContainText("Staging acceptance void");
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: /Voided/ })).toHaveCount(2);
});
for (const actor of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"])
  test(`UI-R3 ${actor} authorized finance and quotation visibility`, async ({
    page,
  }) => {
    const p = JSON.parse(readFileSync(`${root}/finance-fixture.json`, "utf8"));
    await login(page, actor);
    await page.goto(`/dashboard/projects/${p.id}?tab=finance`);
    await expect(
      page.getByRole("heading", { name: "Financial summary", exact: true }),
    ).toBeVisible();
    if (actor === "OPS") {
      await expect(
        page.getByRole("heading", { name: "Sale", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: /View version/ }),
      ).toHaveCount(0);
    } else
      await expect(
        page.getByRole("heading", { name: "Sale", exact: true }),
      ).toBeVisible();
    if (["BDM", "DESIGNER"].includes(actor)) {
      await expect(
        page.getByRole("heading", { name: "Raw", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Add supplier payment", exact: true }),
      ).toHaveCount(0);
    } else
      await expect(
        page.getByRole("heading", { name: "Raw", exact: true }),
      ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Financial summary", exact: true }),
    ).toBeVisible();
    if (actor === "OPS") {
      await page.goto(`/dashboard/projects/${p.id}?tab=quotation`);
      await expect(
        page.getByRole("heading", { name: /Quotation ·/ }),
      ).toHaveCount(0);
    } else {
      const q = JSON.parse(
        readFileSync(`${root}/quotation-fixture.json`, "utf8"),
      );
      await page.goto(`/dashboard/projects/${q.id}?tab=quotation`);
      await expect(
        page.getByRole("heading", {
          name: "Quotation · Approved version 2",
          exact: true,
        }),
      ).toBeVisible();
    }
  });
test("UI-R3 desktop laptop mobile Light/Dark captures and keyboard", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const auth = await context.newPage();
  await login(auth, "LEAD");
  const q = JSON.parse(readFileSync(`${root}/quotation-fixture.json`, "utf8")),
    f = JSON.parse(readFileSync(`${root}/finance-fixture.json`, "utf8"));
  const captures = [];
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
        for (const [screen, url] of [
          ["quotation", `/dashboard/projects/${q.id}?tab=quotation`],
          ["editor", `/dashboard/projects/${q.id}?tab=quotation&space=none`],
          ["finance", `/dashboard/projects/${f.id}?tab=finance`],
        ] as const) {
          if (screen === "editor") continue;
          const p = await context.newPage();
          await p.setViewportSize({ width, height });
          await p.goto(url);
          await expect(
            p.getByRole("heading", {
              name:
                screen === "finance"
                  ? "Financial summary"
                  : "Quotation · Approved version 2",
              exact: true,
            }),
          ).toBeVisible();
          await expect(p.locator("html")).toHaveClass(
            theme === "Dark" ? /dark/ : /light/,
          );
          const overflow = await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          );
          expect(overflow).toBe(false);
          await p.screenshot({
            path: `${root}/${screen}-${theme.toLowerCase()}-${size}.png`,
            fullPage: true,
          });
          captures.push({ screen, theme, size, overflow });
          if (screen === "finance") {
            await p
              .getByRole("button", { name: "Adjust Raw", exact: true })
              .click();
            await expect(
              p.getByLabel("Raw amount (PHP)", { exact: true }),
            ).toBeFocused();
            await p.screenshot({
              path: `${root}/raw-dialog-${theme.toLowerCase()}-${size}.png`,
            });
            await p.keyboard.press("Escape");
            await expect(
              p.getByRole("button", { name: "Adjust Raw", exact: true }),
            ).toBeFocused();
          }
          await p.close();
        }
      }
    }
    writeFileSync(
      `${root}/visual-checks.json`,
      JSON.stringify(captures, null, 2),
    );
  } finally {
    await context.close();
  }
});

test("UI-R3 all-role financial visual variants and quotation editor/comparison", async ({
  browser,
}) => {
  const finance = JSON.parse(
    readFileSync(`${root}/finance-fixture.json`, "utf8"),
  );
  const quote = JSON.parse(
    readFileSync(`${root}/quotation-fixture.json`, "utf8"),
  );
  const manifest = [];
  for (const actor of ["ADMIN", "BDM", "DESIGNER", "OPS", "LEAD"]) {
    const ctx = await browser.newContext();
    const auth = await ctx.newPage();
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
          const p = await ctx.newPage();
          await p.setViewportSize({ width, height });
          await p.goto(`/dashboard/projects/${finance.id}?tab=finance`);
          await expect(
            p.getByRole("heading", { name: "Financial summary", exact: true }),
          ).toBeVisible();
          await expect(
            p.getByRole("button", { name: "Choose appearance", exact: true }),
          ).toBeEnabled();
          expect(
            await p.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
          ).toBe(false);
          await p.screenshot({
            path: `${root}/${actor.toLowerCase()}-finance-${theme.toLowerCase()}-${size}.png`,
            fullPage: true,
          });
          if (size === "mobile") {
            const a11y = await new AxeBuilder({ page: p })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            manifest.push({
              actor,
              screen: "finance-accessibility",
              theme,
              size,
              violations: a11y.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                targets: v.nodes.map((n) => n.target),
              })),
              incomplete: a11y.incomplete.map((v) => v.id),
            });
            expect.soft(a11y.violations.map((v) => v.id)).toEqual([]);
          }
          manifest.push({ actor, screen: "finance", theme, size });
          await p.close();
        }
      }
    } finally {
      await ctx.close();
    }
  }
  const ctx = await browser.newContext();
  const auth = await ctx.newPage();
  await login(auth, "LEAD");
  const url = `/dashboard/projects/${quote.id}?tab=quotation`;
  await auth.goto(url);
  await auth
    .getByRole("button", { name: "Create next quotation draft", exact: true })
    .click();
  await expect(
    auth.getByRole("heading", {
      name: "Quotation · Draft version 3",
      exact: true,
    }),
  ).toBeVisible();
  const edit = await auth
    .getByRole("link", { name: "Edit items for Kitchen", exact: true })
    .first()
    .getAttribute("href");
  const historical = await auth
    .locator('select[name="version"] option')
    .evaluateAll((options) =>
      options
        .filter((o) => /Returned|Approved/.test(o.textContent ?? ""))
        .map((o) => (o as HTMLOptionElement).value),
    );
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
        const p = await ctx.newPage();
        await p.setViewportSize({ width, height });
        await p.goto(edit!);
        await expect(
          p.getByRole("form", { name: "Edit quotation: Kitchen", exact: true }),
        ).toBeVisible();
        await expect(
          p.getByRole("button", { name: "Choose appearance", exact: true }),
        ).toBeEnabled();
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false);
        await p.screenshot({
          path: `${root}/quotation-editor-${theme.toLowerCase()}-${size}.png`,
          fullPage: true,
        });
        await p
          .getByRole("link", {
            name: "Return to quotation overview",
            exact: true,
          })
          .click();
        await p
          .getByRole("button", { name: "Submit for Review", exact: true })
          .click();
        await expect(
          p.getByRole("dialog", { name: "Submit for Review", exact: true }),
        ).toBeVisible();
        await p.screenshot({
          path: `${root}/quotation-review-${theme.toLowerCase()}-${size}.png`,
        });
        await p.keyboard.press("Escape");
        await expect(
          p.getByRole("button", { name: "Submit for Review", exact: true }),
        ).toBeFocused();
        await p.goto(
          `${url}&version=${historical[0]}&compare=${historical[1]}`,
        );
        await expect(
          p.getByRole("region", {
            name: "Quotation version comparison",
            exact: true,
          }),
        ).toBeVisible();
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false);
        await p.screenshot({
          path: `${root}/quotation-comparison-${theme.toLowerCase()}-${size}.png`,
          fullPage: true,
        });
        await p.close();
        manifest.push({
          actor: "LEAD",
          screen: "quotation-editor/review",
          theme,
          size,
        });
      }
    }
  } finally {
    await ctx.close();
  }
  writeFileSync(
    `${root}/role-visual-checks.json`,
    JSON.stringify(manifest, null, 2),
  );
});
