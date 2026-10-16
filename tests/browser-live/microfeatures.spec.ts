import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { loadStagingEnvironment } from "../helpers/staging";
loadStagingEnvironment();
const root = "artifacts/verification/microfeatures";
mkdirSync(root, { recursive: true });
const f = JSON.parse(readFileSync(`${root}/fixture.json`, "utf8"));
const ids = JSON.parse(
  readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
).accounts as { actor: string; id: string }[];
const id = (a: string) => ids.find((x) => x.actor === a)!.id;
async function login(p: Page, actor: string) {
  await p.context().clearCookies();
  await p.goto("/login");
  await p
    .getByLabel("Work email")
    .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]!);
  await p
    .getByLabel("Password", { exact: true })
    .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]!);
  await p.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(p).toHaveURL(/\/dashboard$/);
  await expect(
    p.getByRole("button", { name: "Search workspace", exact: true }),
  ).toBeVisible();
}
const api = (action: string, extra: Record<string, string> = {}) =>
  "/api/productivity?" + new URLSearchParams({ action, ...extra });
test("microfeatures: authenticated search/export/discussion/template role boundaries and CSRF", async ({
  page: p,
}) => {
  for (const actor of [
    "ADMIN",
    "LEAD",
    "DESIGNER",
    "BDM",
    "OPS",
    "OTHER_BDM",
    "UNASSIGNED",
  ]) {
    await login(p, actor);
    const r = await p.request.get(api("search", { q: f.target.name }));
    expect(r.ok()).toBe(true);
    const data = await r.json();
    const allowed = !["OTHER_BDM", "UNASSIGNED"].includes(actor);
    expect(
      data.results.some(
        (x: { href: string }) =>
          x.href === `/dashboard/projects/${f.target.id}`,
      ),
    ).toBe(allowed);
    if (["OPS", "DESIGNER"].includes(actor))
      expect(
        data.results.filter((x: { kind: string }) => x.kind === "Leads"),
      ).toHaveLength(0);
    const discussion = await p.request.get(
      api("discussion", { project: f.target.id }),
    );
    expect(discussion.status()).toBe(allowed && actor !== "OPS" ? 200 : 403);
    const csv = await p.request.get(
      api("export", { kind: "spaces", project: f.target.id }),
    );
    expect(csv.status()).toBe(allowed && actor !== "OPS" ? 200 : 403);
    if (csv.ok()) {
      expect(await csv.text()).toContain("Kitchen");
      expect(await csv.text()).not.toContain(f.space);
    }
    const templates = await p.request.get(api("templates"));
    expect(templates.status()).toBe(
      ["ADMIN", "LEAD"].includes(actor) ? 200 : 403,
    );
  }
  await login(p, "LEAD");
  const noOrigin = await p.request.post("/api/productivity", {
    data: { action: "remember", project: f.target.id, favorite: true },
  });
  expect(noOrigin.status()).toBe(403);
  const literal = await p.request.get(api("search", { q: "%),id.gt.0" }));
  expect(literal.ok()).toBe(true);
  expect((await literal.json()).results).toHaveLength(0);
});
test("microfeatures: search keyboard, clipboard fallback, favorites persistence, help, filters and responsive themes", async ({
  page: p,
  context,
}) => {
  await login(p, "LEAD");
  await p.goto(`/dashboard/projects/${f.target.id}?tab=finance`);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await p.getByRole("button", { name: "Copy Link", exact: true }).click();
  expect(await p.evaluate(() => navigator.clipboard.readText())).toBe(
    `http://localhost:3003/dashboard/projects/${f.target.id}`,
  );
  await p.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(Error("blocked")) },
    });
  });
  await p.getByRole("button", { name: "Copy Link", exact: true }).click();
  await expect(
    p.getByLabel("Clipboard unavailable. Copy this project URL"),
  ).toHaveValue(`http://localhost:3003/dashboard/projects/${f.target.id}`);
  const favorite = p.getByRole("button", { name: /^(Favorite|Unfavorite)$/ });
  await expect(favorite).toBeEnabled();
  if ((await favorite.getAttribute("aria-pressed")) !== "true")
    await favorite.click();
  await expect(
    p.getByRole("button", { name: "Unfavorite", exact: true }),
  ).toBeEnabled();
  await p.reload();
  await expect(
    p.getByRole("button", { name: "Unfavorite", exact: true }),
  ).toBeEnabled();
  await p
    .getByRole("button", { name: "Favorite and recent projects", exact: true })
    .click();
  await expect(p.getByRole("dialog")).toContainText(f.target.name);
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "Workspace help", exact: true }).click();
  await expect(p.getByRole("dialog")).toContainText("Review submitted leads");
  await p.keyboard.press("Escape");
  await p
    .getByRole("button", { name: "Search workspace", exact: true })
    .click();
  await p.getByLabel("Search records").fill(f.target.name);
  const match = p
    .getByRole("dialog")
    .getByRole("link")
    .filter({ hasText: f.target.name })
    .first();
  await expect(match).toBeVisible();
  await p.getByLabel("Search records").press("ArrowDown");
  await expect(match).toBeFocused();
  await p.keyboard.press("Escape");
  await expect(
    p.getByRole("button", { name: "Search workspace", exact: true }),
  ).toBeFocused();
  await p.goto("/dashboard/projects?q=Microfeatures&view=list&sort=name");
  await p.reload();
  expect(new URL(p.url()).searchParams.get("view")).toBe("list");
  const csv = await p.request.get(
    api("export", { kind: "projects", q: "Microfeatures", sort: "name" }),
  );
  expect(csv.ok()).toBe(true);
  expect(csv.headers()["x-export-scope"]).toContain("Filtered page");
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    await p.setViewportSize({ width, height });
    for (const theme of ["Light", "Dark"]) {
      await p
        .getByRole("button", { name: "Choose appearance", exact: true })
        .click();
      await p.getByRole("button", { name: theme, exact: true }).click();
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await p.screenshot({
        path: `${root}/projects-${theme.toLowerCase()}-${width}.png`,
      });
    }
  }
});
test("microfeatures: discussion saves and corrections, retained input on failure, navigation guard and template preview/apply", async ({
  page: p,
}) => {
  const bodyText = `Microfeature browser comment ${Date.now()}`,
    correctedText = bodyText + " corrected";
  await login(p, "LEAD");
  await p.goto(`/dashboard/projects/${f.target.id}`);
  const region = p.getByRole("region", { name: "Project productivity" });
  await region
    .locator("summary")
    .filter({ hasText: /^Discussion$/ })
    .click();
  const commentForm = region.getByRole("form", { name: "Project comment" });
  const comment = commentForm.getByLabel("Comment", { exact: true });
  await comment.fill(bodyText);
  await p.route("**/api/productivity", (r) =>
    r.request().method() === "POST" &&
    r.request().postDataJSON()?.action === "comment"
      ? r.abort("failed")
      : r.continue(),
  );
  await commentForm
    .getByRole("button", { name: "Post comment", exact: true })
    .click();
  await expect(region.getByRole("alert")).toContainText(
    "Connection interrupted",
  );
  await expect(comment).toHaveValue(bodyText);
  const leave = p.waitForEvent("dialog").then((d) => d.dismiss());
  await p
    .getByRole("link", { name: "Projects", exact: true })
    .click({ noWaitAfter: true });
  await leave;
  expect(p.url()).toContain(f.target.id);
  await expect(comment).toHaveValue(bodyText);
  await p.unroute("**/api/productivity");
  await commentForm
    .getByRole("button", { name: "Post comment", exact: true })
    .click();
  await expect(
    region.getByText("Comment saved.", { exact: true }),
  ).toBeVisible();
  await expect(comment).toHaveValue("");
  const text = region.getByText(bodyText, {
    exact: true,
  });
  await text
    .locator("..")
    .getByRole("button", { name: "Correct comment" })
    .click();
  await commentForm
    .getByLabel("Correct comment", { exact: true })
    .fill(correctedText);
  await commentForm.getByLabel("Correction reason").fill("Fix wording");
  await commentForm
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect(
    region
      .locator("p")
      .filter({ hasText: new RegExp("^" + correctedText + "$") }),
  ).toBeVisible();
  await region
    .locator("summary")
    .filter({ hasText: /^Space structure templates$/ })
    .click();
  await region.getByLabel("Template", { exact: true }).selectOption(f.template);
  await region
    .getByLabel("Primary Designer", { exact: true })
    .selectOption(id("DESIGNER"));
  await expect(region.getByText("Preview · 2 new Spaces")).toBeVisible();
  await expect(
    region.getByRole("button", { name: "Apply structure template" }),
  ).toBeDisabled();
  await region
    .getByLabel(
      "Add these Spaces, including any duplicate names. Keep all existing Spaces.",
    )
    .check();
  await region
    .getByRole("button", { name: "Apply structure template" })
    .click();
  await expect(
    region.getByText("2 new Spaces created. Existing Spaces were preserved.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(region.getByRole("alert")).toHaveCount(0);
});
test("microfeatures: authorized private image/PDF previews, expiry refresh and download original", async ({
  page: p,
}) => {
  await login(p, "DESIGNER");
  await p.goto(`/dashboard/projects/${f.target.id}`);
  await p
    .locator("summary")
    .filter({ hasText: /^Notes, Files and Resources$/ })
    .click();
  await p
    .locator("summary")
    .filter({ hasText: /^Project files and versions$/ })
    .click();
  for (const file of f.files) {
    const detail = p
      .locator("details")
      .filter({ has: p.locator("summary").filter({ hasText: file.name }) })
      .last();
    if ((await detail.getAttribute("open")) === null)
      await detail.locator("summary").first().click();
    await p
      .getByRole("button", { name: `Preview ${file.name}`, exact: true })
      .click();
    const dialog = p.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: file.name, exact: true }),
    ).toBeVisible();
    if (file.mime === "image/png") {
      await expect(
        dialog.getByRole("img", { name: file.name, exact: true }),
      ).toBeVisible();
      await expect(dialog.getByRole("img")).toHaveJSProperty("naturalWidth", 1);
      await dialog.getByLabel("Preview zoom").selectOption("175");
    } else
      await expect(
        dialog.getByTitle(`PDF preview: ${file.name}`),
      ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Download Original", exact: true })
      .click();
    await expect(
      dialog.getByRole("link", {
        name: "Open authorized original (60 seconds)",
      }),
    ).toBeVisible();
    await p.screenshot({
      path: `${root}/preview-${file.mime === "image/png" ? "image" : "pdf"}.png`,
    });
    await p.keyboard.press("Escape");
  }
  await p.clock.install();
  await p
    .getByRole("button", { name: "Preview micro-preview.png", exact: true })
    .click();
  await expect(p.getByRole("dialog").getByRole("img")).toBeVisible();
  await p.clock.fastForward(56000);
  await expect(p.getByRole("alert")).toContainText("expired");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Refresh preview", exact: true })
    .click();
  await expect(p.getByRole("dialog").getByRole("img")).toBeVisible();
  await p.keyboard.press("Escape");
  writeFileSync(
    `${root}/preview-note.json`,
    JSON.stringify(
      {
        expiry:
          "Client expiry simulated with Playwright clock; real private Storage bytes/MIME/signing denial separately verified",
        nativePdf: "Browser-native embed; no external viewer",
      },
      null,
      2,
    ),
  );
});

test("microfeatures: payment CSV uses existing role-scoped financial DTOs", async ({
  page: p,
}) => {
  const finance = JSON.parse(
    readFileSync("artifacts/verification/ui-r3/finance-fixture.json", "utf8"),
  );
  const scope = JSON.parse(
    readFileSync(`${root}/financial-scope.json`, "utf8"),
  );
  for (const actor of ["LEAD", "BDM", "OPS"]) {
    await login(p, actor);
    await p.goto(`/dashboard/projects/${finance.id}?tab=finance`);
    await expect(
      p.getByRole("heading", { name: "Financial summary", exact: true }),
    ).toBeVisible();
    for (const kind of ["client", "supplier"]) {
      if (scope[actor][kind]) {
        const download = p.waitForEvent("download");
        await p
          .getByRole("button", {
            name: `Export ${kind} payments CSV`,
            exact: true,
          })
          .click();
        const d = await download;
        const file = `${root}/${actor.toLowerCase()}-${kind}-payments.csv`;
        await d.saveAs(file);
        const csv = readFileSync(file, "utf8");
        expect(csv).toContain("Amount (PHP)");
        expect(csv).not.toContain(finance.id);
        expect(csv).not.toContain("created_by");
        expect(csv.split("\r\n").filter(Boolean)).toHaveLength(
          scope[actor][kind] + 1,
        );
      } else {
        await p
          .getByRole("button", {
            name: `Export ${kind} payments CSV`,
            exact: true,
          })
          .click();
        await expect(
          p.getByText("No records to export.", { exact: true }),
        ).toBeVisible();
      }
    }
    if (!scope[actor].raw)
      await expect(
        p.getByRole("region", { name: "Raw management", exact: true }),
      ).toHaveCount(0);
  }
});
