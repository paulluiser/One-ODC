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

it("4B staging: supplier duplicates/inactivity, acknowledged logistics, concurrency, role RLS, timeline and finance isolation", async () => {
  const lead = randomUUID(),
    supplier = randomUUID(),
    record = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      project_name: `4B live ${lead}`,
      address: `Synthetic ${lead}`,
      brand: "Stosa",
      cabinetry_count: 1,
      notes: "Synthetic logistics fixture",
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
  const master = (
    version: number,
    active = true,
    name = `Supplier ${supplier}`,
  ) =>
    clients.OPS.rpc("save_supplier", {
      p_id: supplier,
      p_version: version,
      p_data: {
        name,
        brand: "Stosa",
        contact_person: "Private supplier contact",
        contact_details: "Private synthetic contact",
        remarks: "Master only",
        active,
      },
      p_reason: "Verified supplier maintenance",
    });
  expect((await master(0)).error).toBeNull();
  expect(
    (
      await clients.LEAD.rpc("save_supplier", {
        p_id: randomUUID(),
        p_version: 0,
        p_data: {
          name: `  SUPPLIER   ${supplier.toUpperCase()}  `,
          brand: "",
          active: true,
        },
        p_reason: "Duplicate test",
      })
    ).error?.message,
  ).toContain("DUPLICATE_SUPPLIER");
  const save = (
    actor: string,
    version = 0,
    status = "RFP",
    reason = "Verified operation",
    override = false,
    id = record,
    parent = project,
  ) =>
    clients[actor].rpc("save_logistics", {
      p_id: id,
      p_project: parent,
      p_version: version,
      p_supplier: supplier,
      p_data: {
        status,
        brand: "Stosa",
        reference: "Order-4B",
        remarks: "Tracking only",
      },
      p_reason: reason,
      p_override: override,
    });
  expect((await save("OPS")).error?.message).toContain("ACCESS_DENIED");
  await rpc("BDM", "set_financial_value", {
    p_project: project,
    p_kind: "Sale",
    p_amount: "100.10",
    p_expected_version: 0,
    p_reason: "",
  });
  await rpc("BDM", "close_project_sale", {
    p_project: project,
    p_expected_stage: "For Quotation",
    p_sale_version: 1,
    p_primary_ops: ids.OPS,
    p_confirm: true,
    p_reason: "",
  });
  expect((await save("OPS")).error?.message).toContain("HANDOFF_REQUIRED");
  const h = await rpc("OPS", "get_commercial_handoff", { p_project: project });
  await rpc("OPS", "acknowledge_handoff", {
    p_project: project,
    p_handoff: h.current.id,
    p_version: 1,
    p_confirm: true,
  });
  const beforeFinance = await rpc("LEAD", "get_project_financials", {
    p_project: project,
  });
  expect((await save("OPS")).error).toBeNull();
  expect(
    (await save("OPS", 0, "RFP", "Second record", false, randomUUID())).error,
  ).toBeNull();
  expect(
    (await save("OPS", 1, "For Manufacturing", "")).error?.message,
  ).toContain("REASON_REQUIRED");
  const race = await Promise.all([
    save("OPS", 1, "Supplier Adjustments", ""),
    save("OPS", 1, "Supplier Adjustments", ""),
  ]);
  expect(race.filter((r) => !r.error)).toHaveLength(1);
  expect(race.find((r) => r.error)?.error?.message).toContain(
    "VERSION_CONFLICT",
  );
  expect(
    (
      await save(
        "OPS",
        2,
        "In Transit",
        "Confirmed skipped manufacturing milestone",
      )
    ).error,
  ).toBeNull();
  expect((await save("OPS", 3, "On Hold", "Carrier delay")).error).toBeNull();
  expect(
    (await save("OPS", 4, "In Transit", "Carrier resumed")).error,
  ).toBeNull();
  expect(
    (
      await save(
        "OPS",
        5,
        "Delivered",
        "Already landed and delivered externally",
      )
    ).error,
  ).toBeNull();
  expect(
    (await save("OPS", 6, "For Delivery", "Correction")).error?.message,
  ).toContain("MANAGER_OVERRIDE_REQUIRED");
  expect(
    (
      await save(
        "LEAD",
        6,
        "For Delivery",
        "Documented delivery correction",
        true,
      )
    ).error,
  ).toBeNull();
  expect((await master(1, false, `Renamed ${supplier}`)).error).toBeNull();
  expect(
    (await save("OPS", 0, "RFP", "Inactive selection", false, randomUUID()))
      .error?.message,
  ).toContain("INACTIVE_SUPPLIER");
  expect(
    (
      await clients.OPS.from("project_logistics")
        .select("supplier_name")
        .eq("id", record)
        .single()
    ).data?.supplier_name,
  ).toBe(`Supplier ${supplier}`);
  expect(
    await rpc("LEAD", "get_project_financials", { p_project: project }),
  ).toEqual(beforeFinance);
  for (const actor of ["BDM", "DESIGNER"]) {
    expect(
      (
        await clients[actor]
          .from("project_logistics")
          .select("id")
          .eq("project_id", project)
      ).data,
    ).toHaveLength(2);
    expect(
      (
        await clients[actor]
          .from("suppliers")
          .select("contact_details")
          .eq("id", supplier)
      ).data,
    ).toEqual([]);
    expect(
      (await save(actor, 7, "Delivered", "Read-only denial")).error?.message,
    ).toContain("ACCESS_DENIED");
    expect(
      JSON.stringify(
        await rpc(actor, "project_timeline", { p_project: project }),
      ),
    ).toContain("Logistics status_changed");
  }
  for (const actor of ["OTHER_BDM", "UNASSIGNED"])
    for (const table of ["project_logistics", "logistics_events"])
      expect(
        (
          await clients[actor]
            .from(table)
            .select("id")
            .eq("project_id", project)
        ).data,
      ).toEqual([]);
  expect(
    (
      await clients.ADMIN.from("logistics_events")
        .update({ reason: "Rewrite" })
        .eq("logistics_id", record)
    ).error,
  ).not.toBeNull();
  expect(
    (await clients.ADMIN.from("project_logistics").delete().eq("id", record))
      .error,
  ).not.toBeNull();
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: 1,
    p_action: "Hold",
    p_reason: "Project Hold restriction",
  });
  expect(
    (await save("OPS", 7, "Delivered", "Held change")).error?.message,
  ).toContain("PROJECT_HELD");
  expect(
    (await save("OPS", 7, "For Delivery", "Held metadata correction")).error,
  ).toBeNull();
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: 2,
    p_action: "Resume",
    p_reason: "Resume fixture",
  });
  expect(
    (await save("OPS", 8, "Cancelled", "Supplier order withdrawn")).error,
  ).toBeNull();
  expect(
    (await save("LEAD", 9, "RFP", "Documented order restart", true)).error,
  ).toBeNull();
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: 3,
    p_action: "Cancel",
    p_reason: "Project cancellation fixture",
  });
  expect(
    (await save("OPS", 10, "Supplier Adjustments", "")).error?.message,
  ).toContain("PROJECT_CANCELLED");
  expect(
    (
      await clients.LEAD.from("logistics_events")
        .select("version,administrative_override")
        .eq("logistics_id", record)
    ).data,
  ).toHaveLength(10);
});
