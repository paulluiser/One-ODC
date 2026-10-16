// Read-only acceptance smoke for the refreshed fictional UAT dataset.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
process.loadEnvFile(".env.verification");
const env = process.env;
assert.equal(
  new URL(env.ONE_ODC_TEST_URL).hostname,
  "jlvlwkryasoducuucvxk.supabase.co",
);
const root = "artifacts/verification/staging-refresh";
const state = JSON.parse(readFileSync(`${root}/manifest.json`, "utf8"));
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const results = [];
try {
  for (const actor of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"]) {
    const client = createClient(
      env.ONE_ODC_TEST_URL,
      env.ONE_ODC_TEST_PUBLISHABLE_KEY,
      { auth: { persistSession: false } },
    );
    const r = await client.auth.signInWithPassword({
      email: env[`ONE_ODC_TEST_${actor}_EMAIL`],
      password: env[`ONE_ODC_TEST_${actor}_PASSWORD`],
    });
    assert.ifError(r.error);
    const calendar = await client
      .from("calendar_events")
      .select("id,owner_id,title");
    assert.ifError(calendar.error);
    assert.ok(calendar.data.every((e) => e.owner_id === r.data.user.id));
    assert.ok(
      calendar.data.some((e) => e.id === state.ids[`uat-calendar-${actor}`]),
    );
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const p = await context.newPage();
    await p.goto("http://localhost:3003/login");
    await p.getByLabel("Work email").fill(env[`ONE_ODC_TEST_${actor}_EMAIL`]);
    await p
      .getByLabel("Password", { exact: true })
      .fill(env[`ONE_ODC_TEST_${actor}_PASSWORD`]);
    await p.getByRole("button", { name: "Sign in to your workspace" }).click();
    await p.waitForURL(/\/dashboard$/, { timeout: 45000 });
    await p.goto("http://localhost:3003/dashboard/projects");
    await p
      .getByRole("main")
      .getByRole("heading", {
        name: actor === "OPS" ? "Project pipeline" : "Projects",
        exact: true,
      })
      .waitFor({ timeout: 30000 });
    const text = await p.locator("main").innerText();
    assert.ok(text.includes("The Acacia Residence"));
    assert.ok(!/UI-R[2345]|Microfeatures|verification [0-9a-f]/i.test(text));
    await p.screenshot({ path: `${root}/${actor.toLowerCase()}-projects.png` });
    if (actor === "LEAD") {
      await p.goto(
        `http://localhost:3003/dashboard/projects/${state.steps["sample0-accept"]}`,
      );
      await p
        .getByRole("main")
        .getByRole("heading", { name: "The Acacia Residence", exact: true })
        .waitFor({ timeout: 30000 });
      await p.screenshot({ path: `${root}/lead-project.png` });
    }
    results.push({
      role: actor,
      readableDirectory: true,
      privateCalendar: true,
    });
    await context.close();
    await client.auth.signOut({ scope: "local" });
    console.log(
      `${actor}: readable project directory and private calendar passed`,
    );
  }
  writeFileSync(`${root}/readability.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
