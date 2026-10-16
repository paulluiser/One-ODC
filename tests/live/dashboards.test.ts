import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
const clients = {} as Record<string, SupabaseClient>;
const ids = {} as Record<string, string>;
const actors = [
  "ADMIN",
  "BDM",
  "LEAD",
  "DESIGNER",
  "OPS",
  "OTHER_BDM",
  "UNASSIGNED",
];
async function rpc(actor: string, name: string, args: Record<string, unknown>) {
  const r = await clients[actor].rpc(name, args);
  if (r.error) throw new Error(`${name}: ${r.error.message}`);
  return r.data;
}
beforeAll(async () => {
  process.loadEnvFile(".env.verification");
  if (
    process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
    new URL(process.env.ONE_ODC_TEST_URL!).hostname !==
      "jlvlwkryasoducuucvxk.supabase.co"
  )
    throw new Error("Refusing non-staging writes");
  for (const actor of actors) {
    const c = createClient(
      process.env.ONE_ODC_TEST_URL!,
      process.env.ONE_ODC_TEST_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    clients[actor] = c;
    const login = await c.auth.signInWithPassword({
      email: process.env[`ONE_ODC_TEST_${actor}_EMAIL`]!,
      password: process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]!,
    });
    if (login.error) throw new Error("Staging sign-in failed");
    ids[actor] = login.data.user!.id;
  }
});
afterAll(async () => {
  for (const c of Object.values(clients))
    await c.auth.signOut({ scope: "local" });
});
import { dashboardSchema, dashboardMetrics } from "../../src/lib/dashboard";
import { localDate } from "../../src/lib/monitoring";
it("5A staging: accurate role KPIs, multi-assignment, cancelled/completed scope, decimal isolation and matching navigation", async () => {
  const get = async (actor: string, view = "", page = 1) =>
    dashboardSchema.parse(
      await rpc(actor, "role_dashboard", { p_view: view, p_page: page }),
    );
  const before = {
    BDM: await get("BDM"),
    LEAD: await get("LEAD"),
    DESIGNER: await get("DESIGNER"),
    OPS: await get("OPS"),
  };
  const count = (d: ReturnType<typeof dashboardSchema.parse>, key: string) =>
    d.metrics[key]?.count ?? 0;
  const lead = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    c = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      project_name: `5A dashboard ${lead}`,
      address: `5A synthetic ${lead}`,
      brand: "Stosa",
      cabinetry_count: 3,
      notes: "Authorized dashboard fixture",
      date_needed: null,
      attachment_metadata: [],
    },
    p_submit: true,
    p_duplicate_reason: "",
  });
  expect(count(await get("BDM"), "awaiting_leads")).toBe(
    count(before.BDM, "awaiting_leads") + 1,
  );
  const project = await rpc("LEAD", "review_lead", {
    p_id: lead,
    p_expected_version: 1,
    p_decision: "Accepted",
    p_remarks: "",
    p_primary: ids.DESIGNER,
    p_support: [ids.UNASSIGNED],
    p_ops: [ids.OPS],
    p_lead_designer: null,
  });
  const deadline = localDate(new Date(Date.now() + 3 * 86400000).toISOString());
  for (const [id, primary, support] of [
    [a, ids.DESIGNER, [ids.UNASSIGNED]],
    [b, ids.UNASSIGNED, [ids.DESIGNER]],
    [c, ids.DESIGNER, []],
  ] as [string, string, string[]][])
    await rpc("LEAD", "save_space", {
      p_id: id,
      p_project: project,
      p_expected_version: 0,
      p_name: `5A duplicate Room`,
      p_deadline: deadline,
      p_primary: primary,
      p_support: support,
      p_reason: "Dashboard assignment validation",
    });
  await rpc("LEAD", "cancel_space", {
    p_id: c,
    p_expected_version: 1,
    p_reason: "Removed dashboard scope",
  });
  const designer = await get("DESIGNER", "due_spaces");
  expect(count(designer, "assigned_spaces")).toBe(
    count(before.DESIGNER, "assigned_spaces") + 2,
  );
  expect(count(designer, "due_spaces")).toBe(
    count(before.DESIGNER, "due_spaces") + 2,
  );
  expect(new Set(designer.records.map((r) => r.id)).size).toBe(
    designer.records.length,
  );
  expect(
    designer.records.filter((r) => ([a, b] as string[]).includes(r.id)),
  ).toHaveLength(2);
  expect(designer.records.some((r) => r.id === c)).toBe(false);
  const manager = await get("LEAD");
  expect(count(manager, "active_projects")).toBe(
    count(before.LEAD, "active_projects") + 1,
  );
  expect(manager.workload.find((w) => w.id === ids.DESIGNER)?.count).toBe(
    (before.LEAD.workload.find((w) => w.id === ids.DESIGNER)?.count ?? 0) + 2,
  );
  expect(count(await get("OPS"), "operational_projects")).toBe(
    count(before.OPS, "operational_projects"),
  );
  await rpc("LEAD", "assign_project_personnel", {
    p_project: project,
    p_primary: ids.UNASSIGNED,
    p_support: [],
    p_ops: [ids.OPS],
    p_reason: "5A revoke previous Project membership",
  });
  expect(count(await get("DESIGNER"), "assigned_spaces")).toBe(
    count(before.DESIGNER, "assigned_spaces"),
  );
  expect(
    (await get("LEAD")).workload.find((w) => w.id === ids.DESIGNER)?.count ?? 0,
  ).toBe(before.LEAD.workload.find((w) => w.id === ids.DESIGNER)?.count ?? 0);
  await rpc("LEAD", "assign_project_personnel", {
    p_project: project,
    p_primary: ids.DESIGNER,
    p_support: [ids.UNASSIGNED],
    p_ops: [ids.OPS],
    p_reason: "Restore dedicated dashboard test Project assignments",
  });
  const draft = await rpc("DESIGNER", "create_quotation_draft", {
    p_project: project,
  });
  await rpc("DESIGNER", "save_quotation_space", {
    p_draft: draft,
    p_space: a,
    p_expected_version: 1,
    p_items: [
      {
        id: randomUUID(),
        description: "Dashboard quote",
        quantity: "1",
        unit_price: "1.10",
      },
    ],
    p_reason: "Dashboard exact quote",
  });
  await rpc("DESIGNER", "submit_quotation", {
    p_version: draft,
    p_expected_version: 2,
    p_remarks: "Dashboard review",
  });
  expect(
    (await get("LEAD", "quotation_reviews")).records.some(
      (r) => r.id === draft,
    ),
  ).toBe(true);
  await rpc("LEAD", "review_quotation", {
    p_version: draft,
    p_expected_version: 3,
    p_decision: "Approved",
    p_remarks: "Verified",
  });
  await rpc("BDM", "set_financial_value", {
    p_project: project,
    p_kind: "Sale",
    p_amount: "0",
    p_expected_version: 0,
    p_reason: "Zero recorded Sale",
  });
  await rpc("LEAD", "set_financial_value", {
    p_project: project,
    p_kind: "Raw",
    p_amount: "78234.51",
    p_expected_version: 0,
    p_reason: "Private Raw sentinel",
  });
  const sale = await get("BDM", "sale");
  expect(count(sale, "sale")).toBe(count(before.BDM, "sale") + 1);
  expect(
    sale.records.some((r) => r.id === project && r.detail?.includes("0.00")),
  ).toBe(true);
  expect(JSON.stringify(sale)).not.toContain("78234.51");
  await rpc("LEAD", "transition_commercial_stage", {
    p_project: project,
    p_expected_stage: "For Quotation",
    p_target: "Under Negotiation",
    p_reason: "Release to BDM",
    p_confirm: true,
  });
  await rpc("BDM", "close_project_sale", {
    p_project: project,
    p_expected_stage: "Under Negotiation",
    p_sale_version: 1,
    p_primary_ops: ids.OPS,
    p_confirm: true,
    p_reason: "Client confirmed the agreed price",
  });
  await rpc("LEAD", "handoff_closed_project", {
    p_project: project,
    p_primary_ops: ids.OPS,
    p_reason: "Lead-approved Operations handoff",
    p_confirm: true,
  });
  expect(count(await get("OPS"), "operational_projects")).toBe(
    count(before.OPS, "operational_projects") + 1,
  );
  expect(
    (await get("OPS", "handoffs")).records.some((r) =>
      r.href.includes(project),
    ),
  ).toBe(true);
  const h = await rpc("OPS", "get_commercial_handoff", { p_project: project });
  await rpc("OPS", "acknowledge_handoff", {
    p_project: project,
    p_handoff: h.current.id,
    p_version: 1,
    p_confirm: true,
  });
  expect(
    (await get("OPS", "handoffs")).records.some((r) =>
      r.href.includes(project),
    ),
  ).toBe(false);
  const supplier = randomUUID(),
    logistics = randomUUID();
  await rpc("OPS", "save_supplier", {
    p_id: supplier,
    p_version: 0,
    p_data: { name: `5A Supplier ${supplier}`, active: true },
    p_reason: "Dashboard supplier",
  });
  await rpc("OPS", "save_logistics", {
    p_id: logistics,
    p_project: project,
    p_version: 0,
    p_supplier: supplier,
    p_data: {
      status: "RFP",
      brand: "Stosa",
      reference: "Dashboard stage",
      remarks: "",
    },
    p_reason: "Dashboard logistics",
    p_override: false,
  });
  expect(
    (await get("OPS", "logistics:RFP")).records.some((r) => r.id === logistics),
  ).toBe(true);
  for (const actor of actors) {
    const d = await get(actor);
    const allowed = new Set(dashboardMetrics[d.role].map((m) => m.key));
    expect(Object.keys(d.metrics).every((k) => allowed.has(k))).toBe(true);
    expect(d.actions.length).toBeLessThanOrEqual(8);
    expect(d.recent.length).toBeLessThanOrEqual(8);
    expect(d.records.length).toBeLessThanOrEqual(25);
    expect(JSON.stringify(d)).not.toContain("78234.51");
    if (d.role !== "bdm") expect(d.metrics.sale).toBeUndefined();
  }
  const outsider = await get("OTHER_BDM", "closed_projects");
  expect(outsider.records.some((r) => r.id === project)).toBe(false);
  expect((await get("OPS", "sale")).records).toEqual([]);
  for (const [space, primary] of [
    [a, "DESIGNER"],
    [b, "UNASSIGNED"],
  ]) {
    for (const [version, status] of [
      [1, "In Progress"],
      [2, "Submitted"],
    ])
      await rpc(primary, "change_space_status", {
        p_id: space,
        p_expected_version: version,
        p_status: status,
        p_reason: "Dashboard progress",
      });
    await rpc("LEAD", "change_space_status", {
      p_id: space,
      p_expected_version: 3,
      p_status: "Completed",
      p_reason: "Dashboard design accepted",
      p_approval: "Client approval",
    });
    await rpc("OPS", "save_installation", {
      p_space: space,
      p_project: project,
      p_version: 0,
      p_status: "Not Applicable",
      p_date: null,
      p_reason: "No installation",
      p_override: false,
    });
  }
  await rpc("OPS", "save_logistics", {
    p_id: logistics,
    p_project: project,
    p_version: 1,
    p_supplier: supplier,
    p_data: {
      status: "Delivered",
      brand: "Stosa",
      reference: "Dashboard stage",
      remarks: "",
    },
    p_reason: "Forward delivery skip",
    p_override: false,
  });
  const readiness = await rpc("LEAD", "operational_readiness", {
    p_project: project,
  });
  await rpc("LEAD", "complete_operations", {
    p_project: project,
    p_version: readiness.version,
    p_cycle: readiness.cycle,
    p_confirm: true,
    p_reason: "Dashboard completion scope",
  });
  expect(count(await get("DESIGNER"), "assigned_spaces")).toBe(
    count(before.DESIGNER, "assigned_spaces"),
  );
  expect(count(await get("LEAD"), "active_projects")).toBe(
    count(before.LEAD, "active_projects"),
  );
  expect(
    (await get("LEAD", "recent_completed")).records.some(
      (r) => r.id === project,
    ),
  ).toBe(true);
  expect(
    (await get("OPS", "recent_delivered")).records.some(
      (r) => r.id === project,
    ),
  ).toBe(true);
  expect(
    (await get("BDM", "closed_projects")).records.some((r) => r.id === project),
  ).toBe(true);
  const finished = await rpc("LEAD", "operational_readiness", {
    p_project: project,
  });
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: finished.version,
    p_action: "Reopen",
    p_reason: "5A preserved historical completion statistics",
  });
  expect(
    (await get("LEAD", "recent_completed")).records.some(
      (r) => r.id === project,
    ),
  ).toBe(true);
  expect(count(await get("LEAD"), "active_projects")).toBe(
    count(before.LEAD, "active_projects") + 1,
  );
  const reopened = await rpc("LEAD", "operational_readiness", {
    p_project: project,
  });
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: reopened.version,
    p_action: "Cancel",
    p_reason: "Cancel synthetic additional dashboard work",
  });
  expect(
    (await get("LEAD", "recent_completed")).records.some(
      (r) => r.id === project && r.detail?.includes("Cancelled"),
    ),
  ).toBe(true);
}, 120000);
