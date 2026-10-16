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
const root = "artifacts/verification/commercial-workflow";
const f = JSON.parse(readFileSync(`${root}/fixture.json`, "utf8"));
const project = f.steps["pending-accepted"];
const c = createClient(env.ONE_ODC_TEST_URL, env.ONE_ODC_TEST_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const login = await c.auth.signInWithPassword({
  email: env.ONE_ODC_TEST_LEAD_EMAIL,
  password: env.ONE_ODC_TEST_LEAD_PASSWORD,
});
assert.ifError(login.error);
const members = await c.rpc("project_team", { p_project: project });
assert.ifError(members.error);
const team = members.data;
const primary = team.find(
  (p) => p.membership_role === "designer" && p.is_primary,
).user_id;
const ops = team.find(
  (p) => p.membership_role === "operations_admin" && p.is_primary,
).user_id;
let h = await c.rpc("get_commercial_handoff", { p_project: project });
assert.ifError(h.error);
const pending = h.data.status === "Awaiting Handoff";
if (pending) {
  const assign = await c.rpc("assign_project_personnel", {
    p_project: project,
    p_primary: primary,
    p_support: team
      .filter((p) => p.membership_role === "designer" && !p.is_primary)
      .map((p) => p.user_id),
    p_ops: [ops],
    p_reason: "Team reviewed; awaiting explicit operational release",
  });
  assert.ifError(assign.error);
  h = await c.rpc("get_commercial_handoff", { p_project: project });
  assert.equal(h.data.status, "Awaiting Handoff");
}
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto("http://localhost:3003/login");
  await p.getByLabel("Work email").fill(env.ONE_ODC_TEST_LEAD_EMAIL);
  await p
    .getByLabel("Password", { exact: true })
    .fill(env.ONE_ODC_TEST_LEAD_PASSWORD);
  await p.getByRole("button", { name: "Sign in to your workspace" }).click();
  await p.waitForURL(/\/dashboard$/, { timeout: 45000 });
  await p.goto(`http://localhost:3003/dashboard/projects/${project}`);
  if (pending) {
    await p
      .getByRole("button", {
        name: "Assign Operations & hand off",
        exact: true,
      })
      .click();
    const d = p.getByRole("dialog", {
      name: "Assign Operations & hand off",
      exact: true,
    });
    await d.getByLabel("Primary Operations Admin").selectOption(ops);
    await d
      .getByLabel("Remarks", { exact: true })
      .fill(
        "Lead approved the delivery coordination team and released the project to Operations",
      );
    await d.getByRole("checkbox").check();
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({ path: `${root}/handoff-dialog-mobile-light.png` });
    await d
      .getByRole("button", {
        name: "Assign Operations & hand off",
        exact: true,
      })
      .click();
    await p
      .getByRole("heading", { name: "Commercial status: Closed", exact: true })
      .waitFor({ timeout: 30000 });
  }
  const check = await c.rpc("get_commercial_handoff", { p_project: project });
  assert.ifError(check.error);
  assert.equal(check.data.current.status, "Pending Acknowledgment");
  assert.equal(check.data.history.length, 1);
  await p.getByRole("button", { name: "Choose appearance" }).click();
  await p.getByRole("button", { name: "Dark", exact: true }).click();
  await p.waitForTimeout(300);
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.screenshot({ path: `${root}/handoff-complete-mobile-dark.png` });
  writeFileSync(
    `${root}/explicit-handoff.json`,
    JSON.stringify({
      teamEditDoesNotRelease: true,
      explicitLeadHandoffUI: true,
      mobileOverflow: false,
      pendingAcknowledgment: true,
    }),
  );
  console.log(
    "Explicit initial handoff API/UI and mobile Light/Dark checks passed",
  );
} finally {
  await browser.close();
  await c.auth.signOut({ scope: "local" });
}
