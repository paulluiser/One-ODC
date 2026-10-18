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

it("4A staging: real closure, concurrent transitions, Ops redaction/activation, immutable handoffs and primary reassignment", async () => {
  const lead = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      assigned_lead_designer_id: ids.LEAD,
      project_name: `4A closure ${lead}`,
      address: `Synthetic ${lead}`,
      brand: "Stosa",
      cabinetry_count: 1,
      notes: "Authorized closure fixture",
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
    p_ops: [],
    p_lead_designer: null,
  });
  const close = (
    actor = "BDM",
    version = 1,
    reason = "Client agreed price",
    confirm = true,
  ) =>
    clients[actor].rpc("close_project_sale", {
      p_project: project,
      p_expected_stage: "Under Negotiation",
      p_sale_version: version,
      p_primary_ops: ids.OPS,
      p_confirm: confirm,
      p_reason: reason,
    });
  const get = (actor = "LEAD") =>
    rpc(actor, "get_commercial_handoff", { p_project: project });
  expect((await close()).error?.message).toContain("SALE_REQUIRED");
  await rpc("BDM", "set_financial_value", {
    p_project: project,
    p_kind: "Sale",
    p_amount: "100.10",
    p_expected_version: 0,
    p_reason: "",
  });
  expect((await close()).error?.message).toContain(
    "INVALID_COMMERCIAL_TRANSITION",
  );
  const assignments = (ops: string[]) =>
    rpc("LEAD", "assign_project_personnel", {
      p_project: project,
      p_primary: ids.DESIGNER,
      p_support: [],
      p_ops: ops,
      p_reason: "Verified Operations assignment",
    });
  await assignments([ids.OPS]);
  await rpc("LEAD", "save_space", {
    p_id: randomUUID(),
    p_project: project,
    p_expected_version: 0,
    p_name: "Incomplete Kitchen",
    p_deadline: null,
    p_primary: ids.DESIGNER,
    p_support: [],
    p_reason: "Incomplete design acceptance",
  });
  await rpc("LEAD", "set_financial_value", {
    p_project: project,
    p_kind: "Raw",
    p_amount: "40.05",
    p_expected_version: 0,
    p_reason: "Initial consolidated cost",
  });
  expect(
    (await clients.OPS.rpc("get_commercial_handoff", { p_project: project }))
      .error?.message,
  ).toContain("ACCESS_DENIED");
  expect(
    (await clients.OPS.rpc("get_project_financials", { p_project: project }))
      .error?.message,
  ).toContain("ACCESS_DENIED");
  await rpc("LEAD", "transition_commercial_stage", {
    p_project: project,
    p_expected_stage: "For Quotation",
    p_target: "Under Negotiation",
    p_reason: "Release to BDM",
    p_confirm: true,
  });
  for (const actor of [
    "DESIGNER",
    "OPS",
    "OTHER_BDM",
    "UNASSIGNED",
    "LEAD",
    "ADMIN",
  ])
    expect((await close(actor)).error?.message).toContain("ACCESS_DENIED");
  expect((await close("BDM", 1, "", false)).error?.message).toContain(
    "CONFIRMATION_REQUIRED",
  );
  expect((await close("BDM", 0)).error?.message).toContain(
    "STALE_CLOSURE_CONTEXT",
  );
  const race = await Promise.all([close(), close()]);
  expect(race.filter((r) => !r.error)).toHaveLength(1);
  expect(race.find((r) => r.error)?.error?.message).toContain(
    "SALE_ALREADY_CLOSED",
  );
  expect((await get()).status).toBe("Awaiting Handoff");
  expect(
    (await clients.OPS.rpc("get_commercial_handoff", { p_project: project }))
      .error?.message,
  ).toContain("ACCESS_DENIED");
  await rpc("LEAD", "handoff_closed_project", {
    p_project: project,
    p_primary_ops: ids.OPS,
    p_reason: "Lead Operations assignment",
    p_confirm: true,
  });
  const initial = await get();
  expect(initial.status).toBe("Pending Acknowledgment");
  expect(initial.age_days).toBe(0);
  expect(initial.closure.sale_amount).toBe("100.10");
  expect(
    (
      await clients.ADMIN.from("commercial_closures")
        .select("id")
        .eq("project_id", project)
    ).data,
  ).toHaveLength(1);
  const notices = (actor: string) =>
    clients[actor]
      .from("notifications")
      .select("id")
      .eq("project_id", project)
      .like("message", "Operational handoff #%pending your acknowledgment.");
  expect((await notices("OPS")).data).toHaveLength(1);
  const ops = await get("OPS");
  for (const key of ["sale", "closure", "can_close", "administrative"])
    expect(ops).not.toHaveProperty(key);
  expect(JSON.stringify(ops)).not.toContain("100.10");
  expect(
    (
      await clients.OPS.from("commercial_closures")
        .select("*")
        .eq("project_id", project)
    ).data,
  ).toEqual([]);
  const money = await rpc("OPS", "get_project_financials", {
    p_project: project,
  });
  expect(money.raw.amount).toBe("40.05");
  expect(money).not.toHaveProperty("sale");
  expect(money).not.toHaveProperty("approved_quotation");
  await rpc("OPS", "set_financial_value", {
    p_project: project,
    p_kind: "Raw",
    p_amount: "42.00",
    p_expected_version: 1,
    p_reason: "Post-close operational adjustment",
  });
  await rpc("OPS", "mutate_payment", {
    p_id: randomUUID(),
    p_project: project,
    p_kind: "client",
    p_expected_version: 0,
    p_intent: "save",
    p_data: { payment_date: "2026-01-01", amount: "0.10", method: "Cash" },
    p_reason: "Actual post-close receipt",
  });
  const ack = (actor: string, id = initial.current.id) =>
    clients[actor].rpc("acknowledge_handoff", {
      p_project: project,
      p_handoff: id,
      p_version: 1,
      p_confirm: true,
    });
  const acknowledgments = await Promise.all([ack("OPS"), ack("OPS")]);
  expect(acknowledgments.filter((r) => !r.error)).toHaveLength(1);
  expect(acknowledgments.find((r) => r.error)?.error?.message).toContain(
    "HANDOFF_ALREADY_ACKNOWLEDGED",
  );
  expect((await get("OPS")).status).toBe("Acknowledged");
  await rpc("BDM", "set_financial_value", {
    p_project: project,
    p_kind: "Sale",
    p_amount: "105.10",
    p_expected_version: 1,
    p_reason: "Post-close agreed Sale revision",
  });
  expect((await get()).closure.sale_amount).toBe("100.10");
  const before = await clients.UNASSIGNED.from("profiles")
    .select("display_name,role,active")
    .eq("id", ids.UNASSIGNED)
    .single();
  if (before.error)
    throw new Error("Could not read dedicated staging fixture profile");
  try {
    await rpc("ADMIN", "update_user_access", {
      p_user: ids.UNASSIGNED,
      p_role: "operations_admin",
      p_active: true,
      p_name: before.data.display_name,
      p_reason: "Temporary dedicated staging handoff reassignment test",
    });
    await assignments([ids.OPS, ids.UNASSIGNED]);
    expect((await get()).history).toHaveLength(1);
    expect((await ack("UNASSIGNED")).error?.message).toContain("ACCESS_DENIED");
    await assignments([ids.UNASSIGNED, ids.OPS]);
    const changed = await get();
    expect(changed.history).toHaveLength(2);
    expect(changed.history[0].acknowledged_at).toBeTruthy();
    expect(changed.history[0].superseded_at).toBeTruthy();
    expect(changed.status).toBe("Pending Acknowledgment");
    expect(changed.closed_at).toBe(initial.closed_at);
    expect((await ack("OPS", changed.current.id)).error?.message).toContain(
      "ACCESS_DENIED",
    );
    expect((await ack("UNASSIGNED", changed.current.id)).error).toBeNull();
    expect((await notices("UNASSIGNED")).data).toHaveLength(1);
    expect(
      (await get()).events.map((e: { action: string }) => e.action).sort(),
    ).toEqual(["acknowledged", "acknowledged", "created", "reassigned"]);
  } finally {
    await rpc("ADMIN", "update_user_access", {
      p_user: ids.UNASSIGNED,
      p_role: before.data.role,
      p_active: before.data.active,
      p_name: before.data.display_name,
      p_reason: "Restore dedicated staging profile after handoff verification",
    });
  }
  for (const actor of ["OTHER_BDM", "UNASSIGNED"])
    expect(
      (
        await clients[actor].rpc("get_commercial_handoff", {
          p_project: project,
        })
      ).error?.message,
    ).toContain("ACCESS_DENIED");
  expect(
    (
      await clients.ADMIN.from("projects")
        .update({ commercial_status: "For Quotation" })
        .eq("id", project)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await clients.ADMIN.from("handoff_events")
        .delete()
        .eq("project_id", project)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await clients.ADMIN.from("commercial_closures")
        .update({ sale_amount: "999" })
        .eq("project_id", project)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await clients.DESIGNER.from("spaces")
        .select("status")
        .eq("project_id", project)
    ).data,
  ).toEqual([{ status: "Not Started" }]);
});
it("4A staging: System Administrator cannot close deals; BDM closure has no administrative override", async () => {
  const lead = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      assigned_lead_designer_id: ids.LEAD,
      project_name: `4A admin ${lead}`,
      address: `Synthetic ${lead}`,
      brand: "Stosa",
      cabinetry_count: 1,
      notes: "Administrative closure fixture",
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
  await rpc("BDM", "set_financial_value", {
    p_project: project,
    p_kind: "Sale",
    p_amount: "0",
    p_expected_version: 0,
    p_reason: "",
  });
  const args = {
    p_project: project,
    p_expected_stage: "Under Negotiation",
    p_sale_version: 1,
    p_primary_ops: ids.OPS,
    p_confirm: true,
    p_reason: "",
  };
  expect(
    (await clients.ADMIN.rpc("close_project_sale", args)).error?.message,
  ).toContain("ACCESS_DENIED");
  await rpc("LEAD", "transition_commercial_stage", {
    p_project: project,
    p_expected_stage: "For Quotation",
    p_target: "Under Negotiation",
    p_reason: "Release to BDM",
    p_confirm: true,
  });
  await rpc("BDM", "close_project_sale", {
    ...args,
    p_reason: "Client confirmed the agreed price",
  });
  const h = await rpc("ADMIN", "get_commercial_handoff", {
    p_project: project,
  });
  expect(h.closure.administrative_override).toBe(false);
  expect(h.closure.sale_amount).toBe("0.00");
  expect(
    (
      await clients.ADMIN.from("audit_events")
        .select("new_value")
        .eq("project_id", project)
        .eq("action", "commercial.closed")
    ).data?.[0].new_value.administrative_override,
  ).toBe(false);
});
