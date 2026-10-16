import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
const root = "ui-review",
  base = "http://localhost:3003";
mkdirSync(`${root}/screenshots`, { recursive: true });
const fixture = (p) =>
  JSON.parse(readFileSync(`artifacts/verification/${p}`, "utf8"));
const project = fixture("ui-r2/fixture.json"),
  quote = fixture("ui-r3/quotation-fixture.json"),
  finance = fixture("ui-r3/finance-fixture.json"),
  ops = fixture("ui-r4/fixture.json"),
  pending = fixture("ui-r4/pending-fixture.json");
const file = `${root}/manifest.json`,
  manifest = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [],
  checks = [];
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const requested = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const selectedScreens = process.argv
  .find((a) => a.startsWith("--screens="))
  ?.slice(10)
  .split(",");
const actors = requested.length
  ? requested
  : ["LOGIN", "ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"];
const button = (p, name) => p.getByRole("button", { name, exact: true });
const screens = {
  LOGIN: [
    ["login", "/login"],
    ["login-menu", "/login", "Choose appearance"],
  ],
  ADMIN: [
    ["navigation", "/dashboard", "Open navigation"],
    ["dashboard", "/dashboard"],
    ["analytics", "/dashboard/analytics"],
    ["users", "/dashboard/users"],
    ["invitation", "/dashboard/users", "Invite a team member"],
    ["account-menu", "/dashboard", "Open account menu"],
    ["theme-menu", "/dashboard", "Choose appearance"],
  ],
  LEAD: [
    ["dashboard", "/dashboard"],
    ["analytics", "/dashboard/analytics"],
    ["leads", "/dashboard/leads"],
    ["lead-review", `/dashboard/leads/${project.lead}`],
    ["projects", "/dashboard/projects"],
    ["project-list", "/dashboard/projects?view=list"],
    ["project-details", `/dashboard/projects/${project.project}`],
    ["spaces", `/dashboard/projects/${project.project}#project-spaces`],
    ["activities", `/dashboard/projects/${project.project}#project-activities`],
    ["quotation", `/dashboard/projects/${quote.id}?tab=quotation`],
    ["quotation-history", `/dashboard/projects/${quote.id}?tab=quotation`],
    ["finance", `/dashboard/projects/${finance.id}?tab=finance`],
    ["completion", `/dashboard/projects/${ops.id}?tab=installation`],
    [
      "completion-dialog",
      `/dashboard/projects/${ops.id}?tab=installation`,
      "Complete project operations",
    ],
    ["readiness-blocked", `/dashboard/projects/${pending.id}?tab=installation`],
  ],
  DESIGNER: [
    ["permission-restricted", "/dashboard/users"],
    ["dashboard", "/dashboard"],
    ["analytics", "/dashboard/analytics"],
    ["spaces", `/dashboard/projects/${project.project}#project-spaces`],
    ["installation", `/dashboard/projects/${ops.id}?tab=installation`],
  ],
  BDM: [
    ["dashboard", "/dashboard"],
    ["analytics", "/dashboard/analytics"],
    ["lead-form", "/dashboard/leads/new"],
    ["lead-form-notes", "/dashboard/leads/new"],
    ["lead-detail", `/dashboard/leads/${project.lead}`],
    ["sale", `/dashboard/projects/${finance.id}?tab=finance`],
    ["approved-quotation", `/dashboard/projects/${quote.id}?tab=quotation`],
  ],
  OPS: [
    ["dashboard", "/dashboard"],
    ["analytics", "/dashboard/analytics"],
    ["suppliers", `/dashboard/suppliers?q=${encodeURIComponent(ops.supplier)}`],
    ["supplier-form", "/dashboard/suppliers", "Add supplier"],
    ["logistics", `/dashboard/projects/${ops.id}?tab=logistics`],
    ["logistics-record", `/dashboard/projects/${ops.id}?tab=logistics`],
    [
      "logistics-form",
      `/dashboard/projects/${ops.id}?tab=logistics`,
      "Add logistics record",
    ],
    ["installation", `/dashboard/projects/${ops.id}?tab=installation`],
    ["installation-record", `/dashboard/projects/${ops.id}?tab=installation`],
    ["restricted-finance", `/dashboard/projects/${finance.id}?tab=finance`],
    [
      "installation-form",
      `/dashboard/projects/${ops.id}?tab=installation`,
      "Schedule or update installation",
    ],
    ["notifications", "/dashboard/notifications"],
    ["calendar", "/dashboard/calendar"],
    ["calendar-agenda", "/dashboard/calendar?view=agenda"],
    ["calendar-event", "/dashboard/calendar", "Add event"],
    ["empty-projects", "/dashboard/projects?q=UI-R5-no-matching-project-357"],
  ],
};
try {
  for (const actor of actors) {
    const previousChecks = `artifacts/verification/ui-r5/checks-${actor.toLowerCase()}.json`;
    if (existsSync(previousChecks))
      checks.push(...JSON.parse(readFileSync(previousChecks, "utf8")));
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const auth = await context.newPage();
    if (actor !== "LOGIN") {
      await auth.goto(`${base}/login`);
      await expect(button(auth, "Choose appearance")).toBeEnabled({
        timeout: 30000,
      });
      await auth
        .getByLabel("Work email")
        .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]);
      await auth
        .getByLabel("Password", { exact: true })
        .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]);
      await button(auth, "Sign in to your workspace").click();
      await expect(auth).toHaveURL(/\/dashboard$/, { timeout: 30000 });
      await expect(button(auth, "Choose appearance")).toBeEnabled();
    }
    if (actor === "LEAD" && selectedScreens?.includes("lead-review-form")) {
      await auth.goto(base + "/dashboard/leads?status=Submitted");
      const pendingLink = auth
        .locator('a[href^="/dashboard/leads/"]:not([href$="/new"])')
        .first();
      await pendingLink.waitFor({ timeout: 30000 });
      if (
        !/STAGING|UI-R|verification|acceptance/i.test(
          await pendingLink.textContent(),
        )
      )
        throw Error("Refusing to capture an unidentified lead");
      screens.LEAD.push([
        "lead-review-form",
        await pendingLink.getAttribute("href"),
      ]);
    }
    await auth.close();
    for (const [screen, path, action] of screens[actor].filter(
      ([screen]) => !selectedScreens || selectedScreens.includes(screen),
    ))
      for (const theme of ["Light", "Dark"])
        for (const [size, width, height] of [
          ["desktop", 1440, 900],
          ["laptop", 1280, 800],
          ["mobile", 390, 844],
        ]) {
          if (screen === "navigation" && size !== "mobile") continue;
          const name = `${actor.toLowerCase()}-${screen}-${theme.toLowerCase()}-${size}.png`,
            entry = {
              role: actor,
              screen,
              theme,
              viewport: size,
              width,
              height,
              file: `screenshots/${name}`,
              capturedAt: new Date().toISOString(),
            };
          const p = await context.newPage();
          p.setDefaultTimeout(20000);
          p.setDefaultNavigationTimeout(45000);
          try {
            await p.setViewportSize({ width, height });
            await p.goto(base + path);
            if (actor === "LOGIN") {
              await button(p, "Choose appearance").click();
              await button(p, theme).click();
            } else {
              await expect(button(p, "Choose appearance")).toBeEnabled();
              await button(p, "Choose appearance").click();
              await button(p, theme).click();
            }
            await expect(p.locator("html")).toHaveClass(
              theme === "Dark" ? /dark/ : /light/,
            );
            await expect(
              p.locator(
                '.section-skeleton:visible, section[aria-busy="true"]:visible',
              ),
            ).toHaveCount(0, { timeout: 45000 });
            await expect(p.locator(".workspace-error:visible")).toHaveCount(0);
            if (screen === "spaces") {
              const row = p.locator('details[id^="space-"]').first();
              if (await row.count()) {
                await row.locator(":scope > summary").click();
                await row.scrollIntoViewIfNeeded();
                const change = row
                  .locator("summary")
                  .filter({ hasText: /^Change design status$/ });
                if (await change.count()) await change.click();
              }
            }
            if (screen === "lead-review-form")
              await p
                .getByRole("combobox", { name: "Review decision", exact: true })
                .selectOption("Accepted");
            if (screen === "lead-form-notes")
              await p
                .getByLabel("Notes", { exact: true })
                .scrollIntoViewIfNeeded();
            if (screen === "logistics-record")
              await p
                .locator('article[id^="logistics-"]')
                .first()
                .scrollIntoViewIfNeeded();
            if (screen === "installation-record")
              await p
                .locator('article[id^="installation-"]')
                .first()
                .scrollIntoViewIfNeeded();
            if (screen === "activities")
              await p.locator("#project-activities").scrollIntoViewIfNeeded();
            if (screen === "quotation-history") {
              const s = p
                .locator("summary")
                .filter({ hasText: /^Submission and review activity$/ })
                .first();
              if (await s.count()) {
                await s.click();
                await s.scrollIntoViewIfNeeded();
              }
            }
            if (action) {
              const b = button(p, action).first();
              if (!(await b.count()) || !(await b.isEnabled()))
                throw Error("State unavailable: control absent or disabled");
              await b.click();
              await expect(p.getByRole("dialog").first()).toBeVisible();
            }
            if (["finance", "sale", "restricted-finance"].includes(screen))
              await expect(
                p.getByRole("region", {
                  name: "Financial summary",
                  exact: true,
                }),
              ).toBeVisible();
            if (actor === "ADMIN" && path.includes("/users"))
              await p.locator("tbody tr").first().waitFor();
            await p.evaluate(() => document.fonts.ready);
            await p.screenshot({
              path: `${root}/${entry.file}`,
              animations: "disabled",
              maskColor: "#E7EBF2",
              mask:
                actor === "ADMIN" && path.includes("/users")
                  ? [
                      p.locator(
                        "tbody tr > :first-child, tbody tr > :last-child",
                      ),
                    ]
                  : [],
            });
            entry.status = "captured";
            entry.masked =
              actor === "ADMIN" && path.includes("/users")
                ? "Team identity and named access-trigger columns masked; role/access retained"
                : undefined;
            entry.overflow = await p.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            );
            if (size === "mobile") {
              const a = await new AxeBuilder({ page: p }).analyze();
              const previousCheck = checks.findIndex(
                (c) =>
                  c.role === actor && c.screen === screen && c.theme === theme,
              );
              if (previousCheck >= 0) checks.splice(previousCheck, 1);
              checks.push({
                role: actor,
                screen,
                theme,
                violations: a.violations.map((v) => ({
                  id: v.id,
                  impact: v.impact,
                  nodes: v.nodes.map((n) => n.target),
                })),
                incomplete: a.incomplete.map((v) => v.id),
                overflow: entry.overflow,
              });
            }
          } catch (e) {
            entry.status = "unavailable";
            entry.reason = e.message.split("\n")[0];
            console.log(`${actor}/${screen}/${theme}/${size}: ${entry.reason}`);
          }
          const i = manifest.findIndex((m) => m.file === entry.file);
          if (i >= 0) manifest.splice(i, 1);
          manifest.push(entry);
          writeFileSync(file, JSON.stringify(manifest, null, 2));
          writeFileSync(
            `artifacts/verification/ui-r5/checks-${actor.toLowerCase()}.json`,
            JSON.stringify(
              checks.filter((c) => c.role === actor),
              null,
              2,
            ),
          );
          await p.close();
        }
    await context.close();
    console.log(`${actor}: capture matrix completed`);
  }
} finally {
  await browser.close();
}
console.log(
  JSON.stringify({
    captured: manifest.filter((m) => m.status === "captured").length,
    unavailable: manifest.filter((m) => m.status !== "captured").length,
    overflow: manifest.filter((m) => m.overflow).length,
  }),
);
