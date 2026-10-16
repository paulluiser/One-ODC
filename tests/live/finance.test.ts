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
import type { Financials } from "../../src/lib/finance";
import {
  stagingProject,
  installationSetup,
  financeSupportFixture,
} from "../helpers/staging";
it("staging: independent exact finance, payment corrections/voids, concurrent requests, role redaction and RLS", async () => {
  const lead = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      project_name: `3C finance ${lead}`,
      address: `Synthetic ${lead}`,
      brand: "Stosa",
      cabinetry_count: 1,
      notes: "Authorized synthetic finance fixture",
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
  // Join actual Designer pricing/review to finance in this same staging Project.
  const space = randomUUID();
  await rpc("LEAD", "save_space", {
    p_id: space,
    p_project: project,
    p_expected_version: 0,
    p_name: "Original Kitchen",
    p_deadline: null,
    p_primary: ids.DESIGNER,
    p_support: [],
    p_reason: "3D acceptance scope",
  });
  const quotation = await rpc("DESIGNER", "create_quotation_draft", {
    p_project: project,
  });
  await rpc("DESIGNER", "save_quotation_space", {
    p_draft: quotation,
    p_space: space,
    p_expected_version: 1,
    p_items: [
      {
        id: randomUUID(),
        description: "Precision cabinet",
        quantity: "0.005",
        unit_price: "1.00",
      },
    ],
    p_reason: "3D precision pricing",
  });
  await rpc("DESIGNER", "submit_quotation", {
    p_version: quotation,
    p_expected_version: 2,
    p_remarks: "3D submission",
  });
  await rpc("LEAD", "review_quotation", {
    p_version: quotation,
    p_expected_version: 3,
    p_decision: "Approved",
    p_remarks: "3D reviewed",
  });
  const frozen = (
    await clients.LEAD.from("quotation_versions")
      .select("snapshot")
      .eq("id", quotation)
      .single()
  ).data!.snapshot;
  expect(
    (
      await rpc("BDM", "get_quotation_version", {
        p_project: project,
        p_version: quotation,
      })
    ).total,
  ).toBe("0.01");
  const get = (actor = "LEAD", p = project) =>
    rpc(actor, "get_project_financials", {
      p_project: p,
    }) as Promise<Financials>;
  const val = (
    actor: string,
    kind: string,
    amount: string,
    version: number,
    p = project,
    reason = "Staged finance adjustment",
  ) =>
    clients[actor].rpc("set_financial_value", {
      p_project: p,
      p_kind: kind,
      p_amount: amount,
      p_expected_version: version,
      p_reason: reason,
    });
  const data = (amount: string) => ({
    payment_date: "2026-01-01",
    amount,
    method: "Bank transfer",
    reference: "Staging receipt",
    remarks: "Actual synthetic payment",
  });
  const pay = (
    actor: string,
    id: string,
    kind: string,
    version: number,
    amount: string,
    intent = "save",
    p = project,
    reason = "Staged payment verification",
  ) =>
    clients[actor].rpc("mutate_payment", {
      p_id: id,
      p_project: p,
      p_kind: kind,
      p_expected_version: version,
      p_intent: intent,
      p_data: intent === "void" ? {} : data(amount),
      p_reason: reason,
    });
  expect((await get()).sale?.amount).toBeNull();
  expect((await get()).client_payments.outstanding).toBeNull();
  const race = await Promise.all([
    val("BDM", "Sale", "100.10", 0),
    val("BDM", "Sale", "100.10", 0),
  ]);
  expect(race.filter((r) => !r.error)).toHaveLength(1);
  expect(race.find((r) => r.error)?.error?.message).toContain(
    "VERSION_CONFLICT",
  );
  expect((await val("LEAD", "Raw", "40.05", 0)).error).toBeNull();
  expect((await get()).sale_minus_raw).toBe("60.05");
  expect((await get()).quotation_vs_sale).toBe("100.09");
  expect((await get()).sale?.history).toHaveLength(1);
  const rawRace = await Promise.all([
    val("LEAD", "Raw", "40.06", 1),
    val("LEAD", "Raw", "40.06", 1),
  ]);
  expect(rawRace.filter((r) => !r.error)).toHaveLength(1);
  expect(
    (await get()).raw?.history.map((e) => [e.previous_amount, e.new_amount]),
  ).toEqual([
    [null, "40.05"],
    ["40.05", "40.06"],
  ]);
  expect((await val("LEAD", "Sale", "99", 1)).error?.message).toContain(
    "ACCESS_DENIED",
  );
  expect((await val("BDM", "Sale", "100.001", 1)).error?.message).toContain(
    "INVALID_AMOUNT",
  );
  const a = randomUUID(),
    b = randomUUID(),
    supplier = randomUUID();
  const paymentRace = await Promise.all([
    pay("LEAD", a, "client", 0, "0.10"),
    pay("LEAD", a, "client", 0, "0.10"),
  ]);
  expect(paymentRace.filter((r) => !r.error)).toHaveLength(1);
  expect(paymentRace.find((r) => r.error)?.error?.message).toContain(
    "VERSION_CONFLICT",
  );
  expect((await pay("LEAD", b, "client", 0, "0.20")).error).toBeNull();
  expect(
    (await pay("LEAD", supplier, "supplier", 0, "40.15")).error,
  ).toBeNull();
  expect((await get()).client_payments.total).toBe("0.30");
  expect((await get()).client_payments.outstanding).toBe("99.80");
  expect((await get()).supplier_payments.outstanding).toBe("-0.09");
  const supplierB = randomUUID();
  expect(
    (await pay("LEAD", supplierB, "supplier", 0, "0.20")).error,
  ).toBeNull();
  expect((await get()).supplier_payments.total).toBe("40.35");
  expect((await get()).supplier_payments.outstanding).toBe("-0.29");
  const voidRace = await Promise.all([
    pay("LEAD", supplierB, "supplier", 1, "0", "void"),
    pay("LEAD", supplierB, "supplier", 1, "0", "void"),
  ]);
  expect(voidRace.filter((r) => !r.error)).toHaveLength(1);
  expect(
    (await get()).supplier_payments.records.find((p) => p.id === supplierB)
      ?.history,
  ).toHaveLength(2);
  for (const actor of ["BDM", "DESIGNER"]) {
    const f = await get(actor);
    expect(f).not.toHaveProperty("raw");
    expect(f).not.toHaveProperty("sale_minus_raw");
    expect(f.supplier_payments).not.toHaveProperty("outstanding");
    expect(f.sale?.amount).toBe("100.10");
    expect(f.supplier_payments.records).toHaveLength(2);
    expect((await val(actor, "Raw", "1", 1)).error?.message).toContain(
      "ACCESS_DENIED",
    );
    expect(
      (await pay(actor, randomUUID(), "client", 0, "1")).error?.message,
    ).toContain("ACCESS_DENIED");
    expect(
      (
        await clients[actor]
          .from("project_financial_values")
          .select("kind")
          .eq("project_id", project)
      ).data,
    ).toEqual([{ kind: "Sale" }]);
    expect(
      (
        await clients[actor]
          .from("financial_value_events")
          .select("kind")
          .eq("project_id", project)
      ).data?.every((e) => e.kind === "Sale"),
    ).toBe(true);
  }
  for (const actor of ["OPS", "OTHER_BDM", "UNASSIGNED"]) {
    expect(
      (
        await clients[actor].rpc("get_project_financials", {
          p_project: project,
        })
      ).error?.message,
    ).toContain("ACCESS_DENIED");
    for (const table of [
      "project_financial_values",
      "financial_value_events",
      "project_payments",
      "payment_events",
    ])
      expect(
        (
          await clients[actor]
            .from(table)
            .select("project_id")
            .eq("project_id", project)
        ).data,
      ).toEqual([]);
  }
  expect(
    (await pay("LEAD", a, "client", 1, "100.20", "save", project, "")).error
      ?.message,
  ).toContain("REASON_REQUIRED");
  expect((await pay("LEAD", a, "client", 1, "100.20")).error).toBeNull();
  expect((await get()).client_payments.outstanding).toBe("-0.30");
  expect((await pay("LEAD", a, "client", 1, "1")).error?.message).toContain(
    "VERSION_CONFLICT",
  );
  expect((await pay("LEAD", a, "supplier", 2, "1")).error?.message).toContain(
    "ACCESS_DENIED",
  );
  expect((await pay("LEAD", a, "client", 2, "0", "void")).error).toBeNull();
  expect((await get()).client_payments.outstanding).toBe("99.90");
  expect(
    (await get()).client_payments.records
      .find((p) => p.id === a)
      ?.history.map((h) => h.action),
  ).toEqual(["created", "corrected", "voided"]);
  expect((await pay("LEAD", a, "client", 3, "1")).error?.message).toContain(
    "PAYMENT_VOIDED",
  );
  expect(
    (await clients.ADMIN.from("project_payments").delete().eq("id", a)).error,
  ).not.toBeNull();
  expect(
    (
      await clients.ADMIN.from("payment_events")
        .update({ reason: "Rewrite" })
        .eq("payment_id", a)
    ).error,
  ).not.toBeNull();
  expect(
    (await val("ADMIN", "Sale", "100.20", 1, project, "")).error?.message,
  ).toContain("REASON_REQUIRED");
  expect((await val("ADMIN", "Sale", "100.20", 1)).error).toBeNull();
  const closedFixture = await stagingProject(
    "UI-R3 finance API",
    ids.DESIGNER,
    ids.OPS,
  );
  await installationSetup(closedFixture.id, ids.DESIGNER, ids.OPS);
  await financeSupportFixture(closedFixture.id);
  const closed = closedFixture.id;
  const ops = await get("OPS", closed);
  expect(ops).not.toHaveProperty("sale");
  expect(ops).not.toHaveProperty("approved_quotation");
  expect(ops.client_payments).not.toHaveProperty("outstanding");
  expect(
    (await val("OPS", "Raw", "0", ops.raw?.version ?? 0, closed)).error,
  ).toBeNull();
  expect(
    (await pay("OPS", randomUUID(), "supplier", 0, "0.01", "save", closed))
      .error,
  ).toBeNull();
  expect((await val("OPS", "Sale", "1", 0, closed)).error?.message).toContain(
    "ACCESS_DENIED",
  );
  expect(
    (await pay("LEAD", a, "client", 3, "1", "save", closed)).error?.message,
  ).toContain("ACCESS_DENIED");
  const support = await get("OTHER_BDM", closed);
  expect(support.sale?.editable).toBe(false);
  expect(support).not.toHaveProperty("raw");
  expect(
    (await val("OTHER_BDM", "Sale", "1", support.sale?.version ?? 0, closed))
      .error?.message,
  ).toContain("ACCESS_DENIED");
  await rpc("LEAD", "save_space", {
    p_id: space,
    p_project: project,
    p_expected_version: 1,
    p_name: "Renamed Kitchen",
    p_deadline: null,
    p_primary: ids.DESIGNER,
    p_support: [],
    p_reason: "Historical name preservation",
  });
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: 1,
    p_action: "Cancel",
    p_reason: "3D historical acceptance",
  });
  const final = await get();
  expect(final.cancelled).toBe(true);
  expect(
    final.sale?.history.map((e) => [e.previous_amount, e.new_amount]),
  ).toEqual([
    [null, "100.10"],
    ["100.10", "100.20"],
  ]);
  for (const event of [
    ...final.sale!.history,
    ...final.raw!.history,
    ...final.client_payments.records.flatMap((p) => p.history),
  ]) {
    expect(event.actor_id).toBeTruthy();
    expect(Number.isFinite(Date.parse(event.occurred_at))).toBe(true);
    expect(event.reason).toBeTruthy();
  }
  expect(
    (
      await clients.LEAD.from("quotation_versions")
        .select("snapshot")
        .eq("id", quotation)
        .single()
    ).data!.snapshot,
  ).toEqual(frozen);
  expect((await get("BDM")).sale?.amount).toBe("100.20");
  expect(
    (await pay("LEAD", randomUUID(), "client", 0, "1")).error?.message,
  ).toContain("PROJECT_CANCELLED");
  expect((await pay("LEAD", b, "client", 1, "0.30")).error).toBeNull();
  expect((await get()).client_payments.outstanding).toBe("99.90");
  const timeline = await rpc("BDM", "project_timeline", { p_project: project });
  expect(JSON.stringify(timeline)).toContain(
    "project.cancel: 3D historical acceptance",
  );
  expect(JSON.stringify(timeline)).not.toContain("finance.");
  expect(JSON.stringify(timeline)).not.toContain("Staged finance adjustment");
  const audit = await clients.ADMIN.from("audit_events")
    .select("new_value")
    .eq("project_id", project)
    .eq("action", "finance.value_changed");
  expect(audit.error).toBeNull();
  expect(
    audit.data!.some((e) => e.new_value.administrative_override === true),
  ).toBe(true);
  const anonymous = createClient(
    process.env.ONE_ODC_TEST_URL!,
    process.env.ONE_ODC_TEST_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  expect(
    (await anonymous.rpc("get_project_financials", { p_project: project }))
      .error,
  ).not.toBeNull();
  expect(
    (
      await clients.LEAD.from("project_financial_values").insert({
        project_id: project,
        kind: "Raw",
        amount: "999",
        updated_by: ids.LEAD,
      })
    ).error,
  ).not.toBeNull();
  const stage = await clients.LEAD.from("projects")
    .select("commercial_status")
    .eq("id", project)
    .single();
  expect(stage.data?.commercial_status).toBe("For Quotation");
});
