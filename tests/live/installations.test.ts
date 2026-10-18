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
it("4C real JWT: installation, prerequisites, concurrent completion, immutable cycles, RLS and reopening", async () => {
  const lead = randomUUID(),
    space = randomUUID(),
    other = randomUUID(),
    supplier = randomUUID(),
    logistic = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      assigned_lead_designer_id: ids.LEAD,
      project_name: `4C live ${lead}`,
      address: `Synthetic ${lead}`,
      brand: "Stosa",
      cabinetry_count: 2,
      notes: "Synthetic operational acceptance",
      date_needed: null,
      attachment_metadata: [],
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
  for (const [id, primary] of [
    [space, ids.DESIGNER],
    [other, ids.LEAD],
  ])
    await rpc("LEAD", "save_space", {
      p_id: id,
      p_project: project,
      p_expected_version: 0,
      p_name: "Installation Space",
      p_deadline: null,
      p_primary: primary,
      p_support: [],
      p_reason: "Synthetic scope",
    });
  const save = (
    actor: string,
    version = 0,
    status = "Not Applicable",
    reason = "No install required",
    target = space,
    date: string | null = null,
  ) =>
    clients[actor].rpc("save_installation", {
      p_space: target,
      p_project: project,
      p_version: version,
      p_status: status,
      p_date: date,
      p_reason: reason,
      p_override: false,
    });
  expect(
    (await clients.OPS.rpc("operational_readiness", { p_project: project }))
      .error?.message,
  ).toContain("ACCESS_DENIED");
  expect((await save("DESIGNER")).error?.message).toContain("ACCESS_DENIED");
  await rpc("BDM", "set_financial_value", {
    p_project: project,
    p_kind: "Sale",
    p_amount: "100.10",
    p_expected_version: 0,
    p_reason: "",
  });
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
  expect((await save("OPS")).error?.message).toContain("HANDOFF_REQUIRED");
  const h = await rpc("OPS", "get_commercial_handoff", { p_project: project });
  await rpc("OPS", "acknowledge_handoff", {
    p_project: project,
    p_handoff: h.current.id,
    p_version: 1,
    p_confirm: true,
  });
  expect(
    (await save("DESIGNER", 0, "Not Applicable", "", space)).error?.message,
  ).toContain("REASON_REQUIRED");
  expect(
    (await save("DESIGNER", 0, "Scheduled", "Reason", other, "2026-10-20"))
      .error?.message,
  ).toContain("ACCESS_DENIED");
  expect(
    (await save("DESIGNER", 0, "Scheduled", "Schedule", space, "2026-10-20"))
      .error,
  ).toBeNull();
  expect(
    (await save("DESIGNER", 1, "Scheduled", "", space, "2026-10-21")).error
      ?.message,
  ).toContain("REASON_REQUIRED");
  expect(
    (await save("DESIGNER", 1, "In Progress", "Started", space, "2026-10-20"))
      .error,
  ).toBeNull();
  expect(
    (await save("DESIGNER", 2, "Completed", "", space, "2026-10-20")).error,
  ).toBeNull();
  expect(
    (await save("LEAD", 0, "Not Applicable", "No installation", other)).error,
  ).toBeNull();
  expect(
    (await rpc("LEAD", "operational_readiness", { p_project: project })).ready,
  ).toBe(false);
  for (const id of [space, other])
    for (const [version, status] of [
      [1, "In Progress"],
      [2, "Submitted"],
      [3, "Completed"],
    ])
      await rpc("LEAD", "change_space_status", {
        p_id: id,
        p_expected_version: version,
        p_status: status,
        p_reason: "Design reviewed",
        p_approval: "Customer approval",
      });
  await rpc("OPS", "save_supplier", {
    p_id: supplier,
    p_version: 0,
    p_data: { name: `4C supplier ${supplier}`, active: true },
    p_reason: "Synthetic supplier",
  });
  const logistics = (version: number, status: string) =>
    rpc("OPS", "save_logistics", {
      p_id: logistic,
      p_project: project,
      p_version: version,
      p_supplier: supplier,
      p_data: {
        status,
        brand: "Stosa",
        reference: "4C",
        remarks: "Monitoring",
      },
      p_reason: "Verified forward transition",
      p_override: false,
    });
  await logistics(0, "RFP");
  expect(
    (
      await rpc("LEAD", "operational_readiness", { p_project: project })
    ).blockers.some((b: { kind: string }) => b.kind === "logistics"),
  ).toBe(true);
  await logistics(1, "Delivered");
  const r = await rpc("LEAD", "operational_readiness", { p_project: project });
  expect(r.ready).toBe(true);
  const args = {
    p_project: project,
    p_version: r.version,
    p_cycle: r.cycle,
    p_confirm: true,
    p_reason: "Operational checklist verified",
  };
  expect(
    (await clients.DESIGNER.rpc("complete_operations", args)).error?.message,
  ).toContain("ACCESS_DENIED");
  const concurrent = await Promise.all([
    clients.LEAD.rpc("complete_operations", args),
    clients.LEAD.rpc("complete_operations", args),
  ]);
  expect(concurrent.filter((v) => !v.error)).toHaveLength(1);
  expect(concurrent.filter((v) => v.error)).toHaveLength(1);
  const completed = await rpc("BDM", "operational_readiness", {
    p_project: project,
  });
  expect(completed.completed).toBe(true);
  expect(completed.history).toHaveLength(1);
  expect(
    (await save("OPS", 3, "In Progress", "Correction", space, "2026-10-20"))
      .error?.message,
  ).toContain("PROJECT_COMPLETED_REOPEN_REQUIRED");
  for (const actor of ["OTHER_BDM", "UNASSIGNED"]) {
    expect(
      (
        await clients[actor]
          .from("space_installations")
          .select("*")
          .eq("project_id", project)
      ).data,
    ).toEqual([]);
    expect(
      (
        await clients[actor]
          .from("operational_completions")
          .select("*")
          .eq("project_id", project)
      ).data,
    ).toEqual([]);
    expect(
      (
        await clients[actor].rpc("operational_readiness", {
          p_project: project,
        })
      ).error?.message,
    ).toContain("ACCESS_DENIED");
  }
  expect(
    (
      await clients.OPS.from("space_installations")
        .update({ status: "Not Scheduled" })
        .eq("space_id", space)
    ).error,
  ).not.toBeNull();
  await rpc("BDM", "set_financial_value", {
    p_project: project,
    p_kind: "Sale",
    p_amount: "200.10",
    p_expected_version: 1,
    p_reason: "Post-completion authorized correction",
  });
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: completed.version,
    p_action: "Reopen",
    p_reason: "Additional operational work",
  });
  expect(
    (
      await save(
        "DESIGNER",
        3,
        "In Progress",
        "Reopened installation",
        space,
        "2026-10-20",
      )
    ).error,
  ).toBeNull();
  expect(
    (await rpc("LEAD", "operational_readiness", { p_project: project })).ready,
  ).toBe(false);
  expect(
    (await save("DESIGNER", 4, "Completed", "", space, "2026-10-20")).error,
  ).toBeNull();
  const second = await rpc("LEAD", "operational_readiness", {
    p_project: project,
  });
  await rpc("ADMIN", "complete_operations", {
    ...args,
    p_version: second.version,
    p_cycle: second.cycle,
    p_reason: "Administrative verified completion",
  });
  const final = await rpc("LEAD", "operational_readiness", {
    p_project: project,
  });
  expect(final.history).toHaveLength(2);
  expect(final.history[1].administrative_override).toBe(true);
  const timeline = await rpc("BDM", "project_timeline", { p_project: project });
  expect(JSON.stringify(timeline)).toContain("Installation");
}, 120000);
