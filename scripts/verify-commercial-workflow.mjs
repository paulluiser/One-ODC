import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
process.loadEnvFile(".env.verification");
const env = process.env;
assert.equal(
  new URL(env.ONE_ODC_TEST_URL).hostname,
  "jlvlwkryasoducuucvxk.supabase.co",
);
const root = "artifacts/verification/commercial-workflow";
mkdirSync(root, { recursive: true });
const path = `${root}/fixture.json`;
const state = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : { ids: {}, steps: {} };
const save = () => writeFileSync(path, JSON.stringify(state, null, 2));
const id = (k) => {
  if (!state.ids[k]) {
    state.ids[k] = randomUUID();
    save();
  }
  return state.ids[k];
};
const clients = {},
  users = {};
let browser;
const rpc = async (who, name, args, key) => {
  if (key && Object.hasOwn(state.steps, key)) return state.steps[key];
  const r = await clients[who].rpc(name, args);
  if (r.error) throw Error(`${name}: ${r.error.message}`);
  if (key) {
    state.steps[key] = r.data;
    save();
  }
  return r.data;
};
const read = (r) => {
  assert.ifError(r.error);
  return r.data;
};
const project = (k) => state.steps[`${k}-accepted`];
async function create(k, name) {
  await rpc(
    "BDM",
    "save_lead",
    {
      p_id: id(k),
      p_expected_version: 0,
      p_payload: {
        project_name: name,
        address: `${name} · Fictional address, Metro Manila`,
        brand: "Stosa",
        cabinetry_count: 2,
        date_needed: null,
        notes:
          "Fictional UAT scenario for the revised commercial workflow. No real client or payment.",
        attachment_metadata: [],
        resource_links: [],
      },
      p_submit: true,
      p_duplicate_reason:
        "Separate fictional UAT scenario for commercial workflow acceptance",
    },
    `${k}-lead`,
  );
  await rpc(
    "LEAD",
    "review_lead",
    {
      p_id: id(k),
      p_expected_version: 1,
      p_decision: "Accepted",
      p_remarks: "Accepted design scope for commercial workflow UAT",
      p_primary: users.DESIGNER,
      p_support: [users.LEAD],
      p_ops: [users.OPS],
      p_lead_designer: null,
    },
    `${k}-accepted`,
  );
}
try {
  for (const who of [
    "ADMIN",
    "LEAD",
    "DESIGNER",
    "BDM",
    "OPS",
    "OTHER_BDM",
    "UNASSIGNED",
  ]) {
    const c = createClient(
      env.ONE_ODC_TEST_URL,
      env.ONE_ODC_TEST_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const r = await c.auth.signInWithPassword({
      email: env[`ONE_ODC_TEST_${who}_EMAIL`],
      password: env[`ONE_ODC_TEST_${who}_PASSWORD`],
    });
    if (r.error) throw Error("Staging sign-in failed");
    clients[who] = c;
    users[who] = r.data.user.id;
  }
  await create("handoff", "Cypress House Interiors");
  await create("pending", "Maple Grove Residence");
  await create("lost", "Marina Loft Renovation");
  const args = {
    p_project: project("handoff"),
    p_expected_stage: "For Quotation",
    p_target: "Under Negotiation",
    p_reason: "Design package released for BDM client presentation",
    p_confirm: true,
  };
  for (const who of [
    "ADMIN",
    "DESIGNER",
    "BDM",
    "OPS",
    "OTHER_BDM",
    "UNASSIGNED",
  ])
    assert.ok(
      (await clients[who].rpc("transition_commercial_stage", args)).error,
    );
  if (!state.steps.negotiated) {
    const r = await Promise.all([
      clients.LEAD.rpc("transition_commercial_stage", args),
      clients.LEAD.rpc("transition_commercial_stage", args),
    ]);
    assert.equal(r.filter((r) => !r.error).length, 1);
    state.steps.negotiated = true;
    save();
  }
  if (!state.steps.closed) {
    const d = {
      p_project: project("handoff"),
      p_expected_stage: "Under Negotiation",
      p_price: "850000.25",
      p_sale_version: 0,
      p_reason: "Client confirmed the cabinetry scope and closure price",
      p_confirm: true,
    };
    assert.ok((await clients.LEAD.rpc("close_project_deal", d)).error);
    const r = await Promise.all([
      clients.BDM.rpc("close_project_deal", d),
      clients.BDM.rpc("close_project_deal", d),
    ]);
    assert.equal(r.filter((r) => !r.error).length, 1);
    state.steps.closed = true;
    save();
  }
  if (!state.steps.handed) {
    const h = await rpc("BDM", "get_commercial_handoff", {
      p_project: project("handoff"),
    });
    assert.equal(h.status, "Awaiting Handoff");
    assert.equal(h.closure.sale_amount, "850000.25");
    assert.equal(h.current, null);
    assert.equal(
      read(
        await clients.OPS.from("projects")
          .select("id")
          .eq("id", project("handoff")),
      ).length,
      0,
    );
    const d = {
      p_project: project("handoff"),
      p_primary_ops: users.OPS,
      p_reason: "Lead-approved Operations assignment for supplier coordination",
      p_confirm: true,
    };
    for (const who of ["ADMIN", "BDM", "DESIGNER", "OPS"])
      assert.ok((await clients[who].rpc("handoff_closed_project", d)).error);
    const r = await Promise.all([
      clients.LEAD.rpc("handoff_closed_project", d),
      clients.LEAD.rpc("handoff_closed_project", d),
    ]);
    assert.equal(r.filter((r) => !r.error).length, 1);
    state.steps.handed = true;
    save();
  }
  const h = await rpc("OPS", "get_commercial_handoff", {
    p_project: project("handoff"),
  });
  assert.equal(h.history.length, 1);
  await rpc(
    "OPS",
    "acknowledge_handoff",
    {
      p_project: project("handoff"),
      p_handoff: h.current.id,
      p_version: 1,
      p_confirm: true,
    },
    "acknowledged",
  );
  await rpc(
    "LEAD",
    "save_space",
    {
      p_id: id("space"),
      p_project: project("lost"),
      p_expected_version: 0,
      p_name: "Kitchen",
      p_deadline: null,
      p_primary: users.DESIGNER,
      p_support: [],
      p_reason: "Initial kitchen scope",
    },
    "space",
  );
  await rpc(
    "DESIGNER",
    "change_space_status",
    {
      p_id: id("space"),
      p_expected_version: 1,
      p_status: "In Progress",
      p_reason: "Layout development started",
      p_approval: "",
    },
    "space-started",
  );
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV7sAAAAASUVORK5CYII=",
    "base64",
  );
  const file = await rpc(
    "DESIGNER",
    "reserve_attachment",
    {
      p_attachment: null,
      p_lead: null,
      p_project: project("lost"),
      p_class: "design",
      p_name: "Concept reference.png",
      p_mime: "image/png",
      p_size: bytes.length,
    },
    "file",
  );
  if (!state.steps.uploaded) {
    read(
      await clients.DESIGNER.storage
        .from(file.bucket)
        .upload(file.object_path, bytes, { contentType: "image/png" }),
    );
    state.steps.uploaded = true;
    save();
  }
  await rpc(
    "DESIGNER",
    "complete_attachment",
    { p_version: file.id },
    "file-ready",
  );
  const pending = await rpc(
    "DESIGNER",
    "reserve_attachment",
    {
      p_attachment: file.attachment_id,
      p_lead: null,
      p_project: project("lost"),
      p_class: "design",
      p_name: "Concept reference revised.png",
      p_mime: "image/png",
      p_size: bytes.length,
    },
    "pending-file",
  );
  if (!state.steps.lost) {
    const d = {
      p_project: project("lost"),
      p_expected_stage: "For Quotation",
      p_target: "Lost",
      p_reason:
        "Client deferred renovation after revising the household budget",
      p_confirm: true,
    };
    assert.ok(
      (await clients.OTHER_BDM.rpc("transition_commercial_stage", d)).error,
    );
    const r = await Promise.all([
      clients.BDM.rpc("transition_commercial_stage", d),
      clients.BDM.rpc("transition_commercial_stage", d),
    ]);
    assert.equal(r.filter((r) => !r.error).length, 1);
    state.steps.lost = true;
    save();
  }
  assert.ok(
    (
      await clients.DESIGNER.storage
        .from(pending.bucket)
        .upload(pending.object_path, bytes, { contentType: "image/png" })
    ).error,
  );
  const downloaded = read(
    await clients.DESIGNER.storage.from(file.bucket).download(file.object_path),
  );
  assert.equal(
    Buffer.compare(Buffer.from(await downloaded.arrayBuffer()), bytes),
    0,
  );
  assert.ok(
    (
      await clients.DESIGNER.rpc("change_space_status", {
        p_id: id("space"),
        p_expected_version: 2,
        p_status: "Submitted",
        p_reason: "Attempt after loss",
        p_approval: "",
      })
    ).error,
  );
  for (const who of ["OTHER_BDM", "UNASSIGNED"])
    assert.equal(
      read(
        await clients[who]
          .from("projects")
          .select("id")
          .eq("id", project("lost")),
      ).length,
      0,
    );
  console.log(
    "API: seven actors, concurrent transitions/closure/handoff, exact price, Lead notification, Ops isolation, Lost edit/storage denial and authorized reads passed",
  );
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const p = await context.newPage();
  async function login(who) {
    await context.clearCookies();
    await p.goto("http://localhost:3003/login");
    await p.getByLabel("Work email").fill(env[`ONE_ODC_TEST_${who}_EMAIL`]);
    await p
      .getByLabel("Password", { exact: true })
      .fill(env[`ONE_ODC_TEST_${who}_PASSWORD`]);
    await p.getByRole("button", { name: "Sign in to your workspace" }).click();
    await p.waitForURL(/\/dashboard$/, { timeout: 45000 });
  }
  async function open(k, tab = "") {
    await p.goto(
      `http://localhost:3003/dashboard/projects/${project(k)}${tab}`,
    );
    await p
      .getByRole("region", { name: "Project commercial workflow" })
      .waitFor({ timeout: 30000 });
  }
  async function submit(label, reason) {
    await p.getByRole("button", { name: label, exact: true }).click();
    const dialog = p.getByRole("dialog", { name: label, exact: true });
    await dialog.getByLabel("Remarks", { exact: true }).fill(reason);
    await dialog.getByRole("checkbox").check();
    return dialog;
  }
  if (!state.steps.browserNegotiated) {
    await login("LEAD");
    await open("pending");
    const d = await submit(
      "Send to BDM",
      "Approved for client presentation and BDM follow-up",
    );
    await d.getByRole("button", { name: "Send to BDM", exact: true }).click();
    await p
      .getByRole("heading", {
        name: "Commercial status: Under Negotiation",
        exact: true,
      })
      .waitFor({ timeout: 30000 });
    state.steps.browserNegotiated = true;
    save();
  }
  if (!state.steps.browserClosed) {
    await login("BDM");
    await open("pending");
    const d = await submit(
      "Close deal",
      "Client signed off the final package and agreed price",
    );
    await d.getByLabel("Closure price (PHP)").fill("625000.50");
    await d.getByRole("button", { name: "Close deal", exact: true }).click();
    await p
      .getByRole("heading", {
        name: "Commercial status: Closed · Awaiting Handoff",
        exact: true,
      })
      .waitFor({ timeout: 30000 });
    state.steps.browserClosed = true;
    save();
  }
  for (const who of ["ADMIN", "LEAD", "DESIGNER", "BDM"]) {
    await login(who);
    await open("lost");
    await p.getByText("This project is read-only.", { exact: false }).waitFor();
    assert.equal(
      await p.getByRole("button", { name: "Mark Lost", exact: true }).count(),
      0,
    );
    assert.equal(
      await p.getByText("Manage project assignments", { exact: true }).count(),
      0,
    );
    await p.screenshot({ path: `${root}/${who.toLowerCase()}-lost.png` });
  }
  await login("LEAD");
  await open("pending");
  await p
    .getByRole("button", { name: "Assign Operations & hand off", exact: true })
    .waitFor();
  await p.screenshot({ path: `${root}/closed-awaiting-handoff.png` });
  await p.getByRole("link", { name: /Notifications/ }).click();
  await p
    .getByRole("region", { name: "Notification inbox" })
    .getByText(
      "Maple Grove Residence is Closed and awaiting your Operations Admin assignment and handoff.",
      { exact: true },
    )
    .waitFor();
  await login("OPS");
  await p.goto(
    `http://localhost:3003/dashboard/projects/${project("pending")}`,
  );
  assert.equal(
    await p
      .getByRole("heading", { name: "Maple Grove Residence", exact: true })
      .count(),
    0,
  );
  await p.goto(
    `http://localhost:3003/dashboard/projects/${project("handoff")}`,
  );
  await p
    .getByRole("heading", { name: "Cypress House Interiors", exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  writeFileSync(
    `${root}/results.json`,
    JSON.stringify(
      {
        api: "passed",
        browser: "passed",
        actors: 7,
        concurrency: ["send", "close", "handoff", "lost"],
        money: ["850000.25", "625000.50"],
        production: "untouched",
      },
      null,
      2,
    ),
  );
  console.log(
    "Browser: Lead send, BDM price/closure, Lead alert/handoff action, all-role Lost read-only and Ops release passed",
  );
} finally {
  if (browser) await browser.close();
  for (const c of Object.values(clients))
    await c.auth.signOut({ scope: "local" });
}
