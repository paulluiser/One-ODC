import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
const root = "artifacts/verification/ui-r2";
mkdirSync(root, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const requestedScreens = process.argv
  .find((a) => a.startsWith("--screens="))
  ?.slice(10)
  .split(",");
const manifest =
  requestedScreens && existsSync(`${root}/manifest.json`)
    ? JSON.parse(readFileSync(`${root}/manifest.json`, "utf8"))
    : [];
try {
  for (const actor of process.argv.slice(2).filter((a) => !a.startsWith("--"))
    .length
    ? process.argv.slice(2).filter((a) => !a.startsWith("--"))
    : ["LEAD", "BDM", "DESIGNER", "OPS", "ADMIN"]) {
    if (!["LEAD", "BDM", "DESIGNER", "OPS", "ADMIN"].includes(actor))
      throw Error("Unknown actor");
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const login = await ctx.newPage();
    await login.goto("http://localhost:3003/login");
    await login
      .getByLabel("Work email")
      .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]);
    await login
      .getByLabel("Password", { exact: true })
      .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]);
    await login
      .getByRole("button", { name: "Sign in to your workspace" })
      .click();
    await login.waitForURL("**/dashboard");
    await login.goto("http://localhost:3003/dashboard/projects");
    await login.locator("[data-ui-r2]:visible").first().waitFor();
    const project = await login
      .locator('[data-ui-r2] a[href^="/dashboard/projects/"]')
      .first()
      .getAttribute("href");
    const screens = [["projects", "/dashboard/projects"]];
    if (project) {
      screens.push(["workspace", project]);
      if (actor === "LEAD")
        screens.push(
          ["spaces", `${project}#project-spaces`],
          ["activities", `${project}#project-activities`],
        );
    }
    if (["LEAD", "BDM", "ADMIN"].includes(actor)) {
      screens.push(["leads", "/dashboard/leads?status=All"]);
      await login.goto("http://localhost:3003/dashboard/leads?status=All");
      await login.locator("[data-ui-r2]:visible").first().waitFor();
      const lead = await login
        .locator(
          '[data-ui-r2] a[href^="/dashboard/leads/"]:not([href$="/new"])',
        )
        .first()
        .getAttribute("href");
      if (lead) screens.push(["lead-detail", lead]);
    }
    if (actor === "BDM") screens.push(["lead-form", "/dashboard/leads/new"]);
    if (
      actor === "LEAD" &&
      (!requestedScreens ||
        requestedScreens.some((s) => s.startsWith("lead-review")))
    ) {
      await login.goto(
        "http://localhost:3003/dashboard/leads?status=Submitted",
      );
      await login.locator("[data-ui-r2]:visible").first().waitFor();
      const pending = login
        .locator(
          '[data-ui-r2] a[href^="/dashboard/leads/"]:not([href$="/new"])',
        )
        .first();
      if (await pending.count()) {
        const href = await pending.getAttribute("href");
        screens.push(["lead-review", href], ["lead-review-accept", href]);
      }
    }
    for (const [screen, path] of screens.filter(
      ([screen]) => !requestedScreens || requestedScreens.includes(screen),
    ))
      for (const theme of ["light", "dark"])
        for (const [size, width, height] of [
          ["desktop", 1440, 900],
          ["laptop", 1280, 800],
          ["mobile", 390, 844],
        ]) {
          const p = await ctx.newPage();
          p.setDefaultTimeout(90000);
          await p.setViewportSize({ width, height });
          await p.goto(`http://localhost:3003${path}`);
          await p
            .locator("[data-ui-r2]:visible, .workspace-error:visible")
            .first()
            .waitFor();
          let retried = false;
          if (await p.locator(".workspace-error:visible").count()) {
            retried = true;
            console.log(
              `${actor} ${screen} ${theme} ${size}: authorized workspace retry`,
            );
            await p
              .getByRole("button", { name: "Retry workspace", exact: true })
              .click();
            await p.locator("[data-ui-r2]:visible").first().waitFor();
          }
          await p.waitForFunction(
            () =>
              ![...document.querySelectorAll(".section-skeleton")].some(
                (el) => el.getBoundingClientRect().height > 0,
              ),
            undefined,
            { timeout: 90000 },
          );
          if (await p.locator(".workspace-error:visible").count())
            throw Error(`${actor} ${screen}: data did not load`);
          await p
            .getByRole("button", { name: "Choose appearance", exact: true })
            .click();
          await p
            .getByRole("button", {
              name: theme === "light" ? "Light" : "Dark",
              exact: true,
            })
            .click();
          if (screen === "lead-review-accept") {
            await p
              .getByRole("combobox", { name: "Review decision", exact: true })
              .selectOption("Accepted");
          }
          if (screen === "spaces") {
            const row = p.locator("details[id^=space-]").first();
            if (await row.count()) {
              await row.locator(":scope > summary").click();
              const status = row
                .locator("summary")
                .filter({ hasText: /^Change design status$/ });
              if (await status.count()) await status.click();
              await row.evaluate((el) => el.scrollIntoView({ block: "start" }));
            }
          }
          if (screen === "activities")
            await p.locator("#project-activities").scrollIntoViewIfNeeded();
          await p.evaluate(
            () =>
              new Promise((r) =>
                requestAnimationFrame(() => requestAnimationFrame(r)),
              ),
          );
          const overflow = await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          );
          const file = `${actor.toLowerCase()}-${screen}-${theme}-${size}.png`;
          await p.screenshot({
            path: `${root}/${file}`,
            animations: "disabled",
            fullPage: screen.startsWith("lead-review"),
          });
          const previous = manifest.findIndex((item) => item.file === file);
          if (previous >= 0) manifest.splice(previous, 1);
          manifest.push({
            actor,
            screen,
            theme,
            size,
            file,
            overflow,
            retried,
          });
          if (overflow)
            console.log(`${actor} ${screen} ${theme} ${size}: OVERFLOW`);
          await p.close();
        }
    await ctx.close();
    console.log(`${actor}: captures saved`);
  }
} finally {
  writeFileSync(`${root}/manifest.json`, JSON.stringify(manifest, null, 2));
  await browser.close();
}
