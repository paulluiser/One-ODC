import { chromium, firefox, webkit, expect } from "@playwright/test";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk")
  throw Error("Staging only");
const results = [],
  base = "http://localhost:3003",
  button = (p, name) => p.getByRole("button", { name, exact: true });
for (const [engineName, engine] of [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
]) {
  const b = await engine.launch(
      engineName === "chromium"
        ? {
            executablePath:
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          }
        : {},
    ),
    ctx = await b.newContext(),
    p = await ctx.newPage();
  const r = { browser: engineName };
  try {
    await p.goto(base + "/login");
    await expect(button(p, "Choose appearance")).toBeEnabled();
    await button(p, "Choose appearance").click();
    await expect(p.getByRole("dialog")).toHaveCount(1);
    await p.keyboard.press("Escape");
    await expect(button(p, "Choose appearance")).toBeFocused();
    for (const theme of ["Light", "Dark", "System"]) {
      await button(p, "Choose appearance").click();
      await button(p, theme).click();
      if (theme === "System") {
        await p.emulateMedia({ colorScheme: "dark" });
        await expect(p.locator("html")).toHaveClass(/dark/);
      } else
        await expect(p.locator("html")).toHaveClass(
          theme === "Dark" ? /dark/ : /light/,
        );
    }
    await p.reload();
    expect(await p.evaluate(() => localStorage.getItem("theme"))).toBe(
      "system",
    );
    await p.setViewportSize({ width: 390, height: 844 });
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    r.status = "passed";
    r.checks = [
      "single login menu",
      "Light/Dark/System selection",
      "Escape trigger focus",
      "persisted System preference",
      "mobile bounds",
    ];
  } catch (e) {
    r.status = "failed";
    r.reason = e.message.split("\n")[0];
  }
  results.push(r);
  await b.close();
}
writeFileSync(
  "artifacts/verification/ui-r5/entry-checks.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
// Record genuine streaming states without delaying requests or inventing a splash.
const b = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  }),
  ctx = await b.newContext(),
  auth = await ctx.newPage();
const loading = [];
try {
  await auth.goto(base + "/login");
  await auth
    .getByLabel("Work email")
    .fill(process.env.ONE_ODC_TEST_ADMIN_EMAIL);
  await auth
    .getByLabel("Password", { exact: true })
    .fill(process.env.ONE_ODC_TEST_ADMIN_PASSWORD);
  await button(auth, "Sign in to your workspace").click();
  await expect(auth).toHaveURL(/\/dashboard$/);
  await expect(button(auth, "Choose appearance")).toBeEnabled();
  for (const theme of ["Light", "Dark"]) {
    await button(auth, "Choose appearance").click();
    await button(auth, theme).click();
    for (const [viewport, width, height] of [
      ["desktop", 1440, 900],
      ["laptop", 1280, 800],
      ["mobile", 390, 844],
    ]) {
      const p = await ctx.newPage();
      await p.setViewportSize({ width, height });
      await p.goto(base + "/dashboard/analytics", { waitUntil: "commit" });
      const busy = p.locator('section[aria-busy="true"]').first();
      const result = { theme, viewport, status: "not-observed" };
      try {
        await busy.waitFor({ state: "visible", timeout: 1200 });
        const file = `screenshots/admin-genuine-loading-${theme.toLowerCase()}-${viewport}.png`;
        await p.screenshot({
          path: `ui-review/${file}`,
          animations: "disabled",
        });
        if (await busy.isVisible()) {
          result.status = "captured";
          const manifest = JSON.parse(
            readFileSync("ui-review/manifest.json", "utf8"),
          );
          manifest.push({
            role: "ADMIN",
            screen: "genuine-loading",
            theme,
            viewport,
            width,
            height,
            file,
            status: "captured",
            capturedAt: new Date().toISOString(),
            transient: true,
          });
          writeFileSync(
            "ui-review/manifest.json",
            JSON.stringify(manifest, null, 2),
          );
        } else unlinkSync(`ui-review/${file}`);
      } catch {
        result.reason =
          "Real loading settled before an accepted screenshot; no forced delay";
      }
      loading.push(result);
      await p.close();
    }
  }
} finally {
  await b.close();
}
writeFileSync(
  "artifacts/verification/ui-r5/genuine-loading.json",
  JSON.stringify(loading, null, 2),
);
console.log(JSON.stringify({ loading }));
