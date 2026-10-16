import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.verification");
const url = process.env.ONE_ODC_TEST_URL;
assert.equal(new URL(url).hostname, "jlvlwkryasoducuucvxk.supabase.co");
const root = "artifacts/verification/notifications";
mkdirSync(root, { recursive: true });
const key = process.env.ONE_ODC_TEST_PUBLISHABLE_KEY;
const service = createClient(url, process.env.ONE_ODC_TEST_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actors = ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"];
const clients = {},
  users = {},
  noticeIds = [];
const run = randomUUID().slice(0, 8);
const check = (r) => {
  if (r.error) throw Error(`Database verification failed (${r.error.code})`);
  return r.data;
};
let browser;
try {
  for (const who of actors) {
    const c = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await c.auth.signInWithPassword({
      email: process.env[`ONE_ODC_TEST_${who}_EMAIL`],
      password: process.env[`ONE_ODC_TEST_${who}_PASSWORD`],
    });
    if (login.error) throw Error("Staging sign-in failed");
    clients[who] = c;
    users[who] = login.data.user.id;
  }
  for (const who of actors) {
    const rows = [0, 1].map((n) => ({
      id: randomUUID(),
      recipient_id: users[who],
      message: `Notification verification ${run} ${who} ${n}`,
    }));
    noticeIds.push(...rows.map((n) => n.id));
    check(await service.from("notifications").insert(rows));
  }
  const other = noticeIds[2];
  const denied = await clients.ADMIN.rpc("mark_notification_read", {
    p_id: other,
  });
  assert.ok(denied.error);
  assert.equal(
    check(
      await clients.ADMIN.from("notifications").select("id").eq("id", other),
    ).length,
    0,
  );
  const anon = createClient(url, key, { auth: { persistSession: false } });
  assert.ok((await anon.rpc("mark_all_notifications_read")).error);
  for (const who of actors) {
    const before = await clients[who]
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    assert.ifError(before.error);
    const result = check(await clients[who].rpc("mark_all_notifications_read"));
    assert.equal(result, before.count);
    assert.equal(
      check(await clients[who].rpc("mark_all_notifications_read")),
      0,
    );
    // The next recipient's fixtures remain unread until that account acts.
    const next = actors[actors.indexOf(who) + 1];
    if (next)
      assert.equal(
        check(
          await service
            .from("notifications")
            .select("id")
            .eq("recipient_id", users[next])
            .in("id", noticeIds)
            .is("read_at", null),
        ).length,
        2,
      );
  }
  // Re-seed only the new verification notices for deterministic browser checks.
  check(
    await service
      .from("notifications")
      .update({ read_at: null })
      .in("id", noticeIds),
  );
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const p = await context.newPage();
  for (const who of actors) {
    await context.clearCookies();
    await p.goto("http://localhost:3003/login");
    await p
      .getByLabel("Work email")
      .fill(process.env[`ONE_ODC_TEST_${who}_EMAIL`]);
    await p
      .getByLabel("Password", { exact: true })
      .fill(process.env[`ONE_ODC_TEST_${who}_PASSWORD`]);
    await p.getByRole("button", { name: "Sign in to your workspace" }).click();
    await p.waitForURL(/\/dashboard$/, { timeout: 45000 });
    const bell = p.getByRole("link", {
      name: "Notifications, 2 unread",
      exact: true,
    });
    await bell.waitFor({ timeout: 30000 });
    await bell.click();
    const inbox = p.getByRole("region", { name: "Notification inbox" });
    await inbox.waitFor();
    assert.equal(await inbox.locator("li").count(), 2);
    await inbox
      .getByRole("button", { name: "Mark read", exact: true })
      .first()
      .click();
    await p
      .getByRole("link", { name: "Notifications, 1 unread", exact: true })
      .waitFor({ timeout: 30000 });
    assert.equal(await inbox.locator("li").count(), 1);
    await inbox
      .getByRole("link", { name: "All notifications", exact: true })
      .click();
    await p.waitForURL(/view=all/);
    await p
      .getByRole("link", { name: "All notifications", exact: true })
      .waitFor();
    assert.ok(
      (await inbox
        .locator("li")
        .filter({ hasText: `Notification verification ${run} ${who}` })
        .count()) === 2,
    );
    await inbox
      .getByRole("button", { name: "Mark all as read", exact: true })
      .click();
    await p
      .getByRole("link", { name: "Notifications", exact: true })
      .waitFor({ timeout: 30000 });
    await inbox
      .getByRole("button", { name: "Mark all as read", exact: true })
      .isDisabled()
      .then((v) => assert.ok(v));
    await inbox.getByRole("link", { name: /^Unread 0$/ }).click();
    await p.getByRole("heading", { name: "You’re all caught up" }).waitFor();
    await p.reload();
    await p.getByRole("heading", { name: "You’re all caught up" }).waitFor();
    console.log(
      `${who}: recipient isolation, badge, individual/bulk read, history and refresh passed`,
    );
  }
  // Theme/mobile checks against actual saved history, with fixture-only screenshots.
  await p.goto("http://localhost:3003/dashboard/notifications?view=all");
  await p.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["Light", "Dark"]) {
    await p.getByRole("button", { name: "Choose appearance" }).click();
    await p.getByRole("button", { name: theme, exact: true }).click();
    await p.waitForTimeout(350);
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({ path: `${root}/${theme.toLowerCase()}-mobile.png` });
  }
  writeFileSync(
    `${root}/results.json`,
    JSON.stringify(
      {
        roles: actors,
        api: "passed",
        browser: "passed",
        mobileThemes: ["Light", "Dark"],
        production: "untouched",
      },
      null,
      2,
    ),
  );
} finally {
  if (browser) await browser.close();
  // Remove only this run's synthetic fixtures; preserve all existing notifications.
  if (noticeIds.length)
    check(await service.from("notifications").delete().in("id", noticeIds));
  for (const c of Object.values(clients))
    await c.auth.signOut({ scope: "local" });
}
