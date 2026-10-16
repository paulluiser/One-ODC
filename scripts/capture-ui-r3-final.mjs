import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
const root = "artifacts/verification/ui-r3",
  fixture = JSON.parse(readFileSync(`${root}/quotation-fixture.json`, "utf8"));
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const ctx = await browser.newContext({ reducedMotion: "reduce" }),
  auth = await ctx.newPage(),
  base = "http://localhost:3003",
  url = `/dashboard/projects/${fixture.id}?tab=quotation`,
  manifest = [];
try {
  await auth.goto(`${base}/login`);
  await auth.getByLabel("Work email").fill(process.env.ONE_ODC_TEST_LEAD_EMAIL);
  await auth
    .getByLabel("Password", { exact: true })
    .fill(process.env.ONE_ODC_TEST_LEAD_PASSWORD);
  await auth.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(auth).toHaveURL(/\/dashboard$/);
  await auth.goto(base + url);
  await expect(
    auth.getByRole("button", { name: "Choose appearance", exact: true }),
  ).toBeEnabled();
  const edit = await auth
    .getByRole("link", { name: "Edit items for Kitchen", exact: true })
    .first()
    .getAttribute("href");
  const versions = await auth
    .locator('select[name="version"] option')
    .evaluateAll((opts) =>
      opts.map((o) => ({ id: o.value, text: o.textContent })),
    );
  const approved = versions.find((v) => v.text.includes("Approved")).id,
    returned = versions.find((v) => v.text.includes("Returned")).id;
  for (const theme of ["Light", "Dark"]) {
    await auth
      .getByRole("button", { name: "Choose appearance", exact: true })
      .click();
    await auth.getByRole("button", { name: theme, exact: true }).click();
    for (const [size, width, height] of [
      ["desktop", 1440, 900],
      ["laptop", 1280, 800],
      ["mobile", 390, 844],
    ]) {
      for (const [screen, destination] of [
        ["quotation", `${url}&version=${approved}`],
        ["quotation-editor", edit],
        [
          "quotation-comparison",
          `${url}&version=${approved}&compare=${returned}`,
        ],
        ["quotation-review", url],
      ]) {
        const p = await ctx.newPage();
        await p.setViewportSize({ width, height });
        await p.goto(base + destination);
        await expect(
          p.getByLabel("Quotation summary", { exact: true }),
        ).toBeVisible();
        await expect(
          p.getByRole("button", { name: "Choose appearance", exact: true }),
        ).toBeEnabled();
        await expect(p.locator("html")).toHaveClass(
          theme === "Dark" ? /dark/ : /light/,
        );
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (screen === "quotation-editor") {
          const fieldset = p
            .getByRole("form", { name: "Edit quotation: Kitchen", exact: true })
            .locator("fieldset");
          expect(
            await fieldset.evaluate((e) => getComputedStyle(e).rowGap),
          ).toBe("16px");
        }
        if (screen === "quotation-comparison") {
          const closed = p.locator("details").filter({
            has: p
              .locator("summary")
              .filter({ hasText: /^Submission and review activity$/ }),
          });
          expect((await closed.boundingBox()).height).toBeLessThan(90);
        }
        if (screen === "quotation-review") {
          await p
            .getByRole("button", { name: "Submit for Review", exact: true })
            .click();
          await expect(
            p.getByRole("dialog", { name: "Submit for Review", exact: true }),
          ).toBeVisible();
          await expect(
            p
              .getByRole("form", { name: "Submit for Review", exact: true })
              .getByRole("textbox"),
          ).toBeFocused();
        }
        const path = `${root}/${screen}-${theme.toLowerCase()}-${size}.png`;
        await p.screenshot({ path, fullPage: screen !== "quotation-review" });
        manifest.push({ screen, theme, size, path, overflow: false });
        await p.close();
      }
    }
  }
  writeFileSync(
    `${root}/final-quotation-captures.json`,
    JSON.stringify(manifest, null, 2),
  );
  console.log(
    JSON.stringify({
      captures: manifest.length,
      overflow: 0,
      editorGap: 16,
      closedHistoryStretch: false,
    }),
  );
} finally {
  await ctx.close();
  await browser.close();
}
