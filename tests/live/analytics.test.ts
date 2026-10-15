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
import { analyticsSchema } from "../../src/lib/analytics";
import { localDate } from "../../src/lib/monitoring";
import { moneyCentavos } from "../../src/lib/quotations";
it("5B staging analytics: real role isolation, cohorts, completion history, exact collection totals and chart drilldowns", async () => {
  const today = localDate(new Date().toISOString());
  const get = async (
    who: string,
    view = "",
    bucket = "",
    extra: Record<string, unknown> = {},
  ) =>
    analyticsSchema.parse(
      await rpc(who, "project_analytics", {
        p_from: today,
        p_to: today,
        p_view: view,
        p_bucket: bucket,
        ...extra,
      }),
    );
  const before = await get("LEAD");
  const beforeOps = await get("OPS");
  const lead = randomUUID(),
    space = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      project_name: `5B analytics ${lead.slice(0, 8)}`,
      address: `Authorized staging acceptance ${lead}`,
      brand: "Stosa",
      cabinetry_count: 1,
      notes: "Analytics test",
      date_needed: null,
      attachment_metadata: [],
      resource_links: [],
    },
    p_submit: true,
    p_duplicate_reason: "",
  });
  const project = await rpc("LEAD", "review_lead", {
    p_id: lead,
    p_expected_version: 1,
    p_decision: "Accepted",
    p_remarks: "",
    p_primary: ids.DESIGNER,
    p_support: [],
    p_ops: [ids.OPS],
    p_lead_designer: null,
  });
  await rpc("LEAD", "save_space", {
    p_id: space,
    p_project: project,
    p_expected_version: 0,
    p_name: "5B Room",
    p_deadline: today,
    p_primary: ids.DESIGNER,
    p_support: [],
    p_reason: "Analytics scope",
  });
  const leadData = await get("LEAD", "projects", "For Quotation");
  expect(leadData.metrics.active_projects.count).toBe(
    (before.metrics.active_projects?.count ?? 0) + 1,
  );
  expect(
    leadData.groups.find(
      (g) => g.key === "projects" && g.bucket === "For Quotation",
    )?.count,
  ).toBe(leadData.selected_count);
  expect(leadData.records.some((r) => r.id === project)).toBe(true);
  expect((await get("OPS")).metrics).toEqual(beforeOps.metrics);
  for (const who of ["OTHER_BDM", "UNASSIGNED"])
    expect(
      (await get(who, "projects")).records.some((r) => r.id === project),
    ).toBe(false);
  await rpc("BDM", "set_financial_value", {
    p_project: project,
    p_kind: "Sale",
    p_amount: "100.10",
    p_expected_version: 0,
    p_reason: "Analytics Sale",
  });
  await rpc("LEAD", "set_financial_value", {
    p_project: project,
    p_kind: "Raw",
    p_amount: "98765.43",
    p_expected_version: 0,
    p_reason: "Private Raw sentinel",
  });
  const collectionBefore = await get("BDM");
  const pay = randomUUID();
  await rpc("LEAD", "mutate_payment", {
    p_id: pay,
    p_project: project,
    p_kind: "client",
    p_expected_version: 0,
    p_intent: "save",
    p_data: {
      payment_date: today,
      amount: "25.01",
      method: "Bank",
      reference: "Staging",
      remarks: "Actual collection test",
    },
    p_reason: "Analytics collection",
  });
  const collectionAfter = await get("BDM");
  expect(
    moneyCentavos(collectionAfter.metrics.collections.amount!) -
      moneyCentavos(collectionBefore.metrics.collections.amount!),
  ).toBe(2501n);
  for (const who of ["ADMIN", "BDM", "LEAD", "DESIGNER", "OPS"]) {
    const a = await get(who, "sale");
    expect(JSON.stringify(a)).not.toContain("98765.43");
    if (["DESIGNER", "OPS"].includes(who)) {
      expect(a.metrics.sale).toBeUndefined();
      expect(a.records).toEqual([]);
    }
  }
  await rpc("BDM", "close_project_sale", {
    p_project: project,
    p_expected_stage: "For Quotation",
    p_sale_version: 1,
    p_primary_ops: ids.OPS,
    p_confirm: true,
    p_reason: "",
  });
  const ops = await get("OPS", "installations", "Not Scheduled");
  expect(ops.records.some((r) => r.id === space)).toBe(true);
  expect(ops.metrics.sale).toBeUndefined();
  const h = await rpc("OPS", "get_commercial_handoff", { p_project: project });
  await rpc("OPS", "acknowledge_handoff", {
    p_project: project,
    p_handoff: h.current.id,
    p_version: 1,
    p_confirm: true,
  });
  for (const [status, version] of [
    ["In Progress", 1],
    ["Submitted", 2],
    ["Completed", 3],
  ] as const)
    await rpc("LEAD", "change_space_status", {
      p_id: space,
      p_expected_version: version,
      p_status: status,
      p_reason: "Analytics design completion",
      p_approval: status === "Completed" ? "Staging approval" : "",
    });
  await rpc("LEAD", "save_installation", {
    p_space: space,
    p_project: project,
    p_version: 0,
    p_status: "Not Applicable",
    p_date: null,
    p_reason: "No installation required for staging",
    p_override: false,
  });
  const summary = await rpc("LEAD", "monitoring_summary", {
    p_projects: [project],
  });
  await rpc("LEAD", "revise_project_deadline", {
    p_project: project,
    p_version: summary[0].version,
    p_deadline: today,
    p_timezone: "Asia/Manila",
    p_reason: "Completion deadline",
  });
  let r = await rpc("LEAD", "operational_readiness", { p_project: project });
  await rpc("LEAD", "complete_operations", {
    p_project: project,
    p_version: r.version,
    p_cycle: r.cycle,
    p_confirm: true,
    p_reason: "Analytics completion verification",
  });
  const c = await get("LEAD", "completion_timing", "On time");
  expect(c.records.some((row) => row.id === project)).toBe(true);
  expect(
    (await get("LEAD", "completions", today.slice(0, 7))).selected_count,
  ).toBe(c.metrics.completions.count);
  r = await rpc("LEAD", "operational_readiness", { p_project: project });
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: r.version,
    p_action: "Reopen",
    p_reason: "Verify historical completion",
  });
  r = await rpc("LEAD", "operational_readiness", { p_project: project });
  await rpc("LEAD", "revise_project_deadline", {
    p_project: project,
    p_version: r.version,
    p_deadline: "2026-01-01",
    p_timezone: "UTC",
    p_reason: "Must preserve immutable completion target",
  });
  expect(
    (await get("LEAD", "completion_timing", "On time")).records.some(
      (row) => row.id === project,
    ),
  ).toBe(true);
  expect((await get("LEAD")).metrics.completions.count).toBe(
    c.metrics.completions.count,
  );
  expect(
    (
      await clients.OPS.rpc("project_analytics", {
        p_from: today,
        p_to: today,
        p_brand: "Stosa",
      })
    ).error?.message,
  ).toContain("VALIDATION_ERROR");
  expect(
    (
      await clients.BDM.rpc("project_analytics", {
        p_from: "2020-01-01",
        p_to: today,
      })
    ).error?.message,
  ).toContain("VALIDATION_ERROR");
});
