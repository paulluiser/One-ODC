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
import type { Quotation } from "../../src/lib/quotations";
it("staging: exact draft pricing, atomic concurrent saves, scoped JWT/RLS, lifecycle and immutable history", async () => {
  const lead = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      project_name: `3A quotation verification ${lead}`,
      address: `Synthetic ${lead}`,
      brand: "Stosa",
      cabinetry_count: 2,
      notes: "Authorized staging only",
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
    p_support: [ids.UNASSIGNED],
    p_ops: [ids.OPS],
    p_lead_designer: null,
  });
  const a = randomUUID(),
    b = randomUUID();
  for (const [space, primary] of [
    [a, ids.DESIGNER],
    [b, ids.LEAD],
  ])
    await rpc("LEAD", "save_space", {
      p_id: space,
      p_project: project,
      p_expected_version: 0,
      p_name: "Duplicate kitchen",
      p_deadline: null,
      p_primary: primary,
      p_support: [],
      p_reason: "Quotation scope",
    });
  const versions = await Promise.all([
    rpc("DESIGNER", "create_quotation_draft", { p_project: project }),
    rpc("LEAD", "create_quotation_draft", { p_project: project }),
  ]);
  expect(versions[0]).toBe(versions[1]);
  const draft = versions[0];
  const get = () =>
    rpc("LEAD", "get_project_quotation", {
      p_project: project,
    }) as Promise<Quotation>;
  const item = (id = randomUUID(), quantity = "1", unit_price = "0.10") => ({
    id,
    description: "Staging cabinet",
    quantity,
    unit_price,
  });
  const one = item(),
    two = item(undefined, "0.005", "1.00"),
    third = item(undefined, "1", "0.20");
  const save = (
    actor: string,
    space: string,
    items: unknown[],
    version: number,
  ) =>
    clients[actor].rpc("save_quotation_space", {
      p_draft: draft,
      p_space: space,
      p_expected_version: version,
      p_items: items,
      p_reason: "Authorized staging price test",
    });
  expect((await get()).total).toBe("0");
  expect(
    (await save("DESIGNER", a, [{ ...one, line_amount: "900" }, two], 1)).error,
  ).toBeNull();
  expect((await get()).total).toBe("0.11");
  expect((await save("DESIGNER", b, [third], 2)).error?.message).toContain(
    "ACCESS_DENIED",
  );
  const race = await Promise.all([
    save("DESIGNER", a, [two, one], 2),
    save("LEAD", b, [third], 2),
  ]);
  expect(race.filter((r) => !r.error)).toHaveLength(1);
  expect(race.find((r) => r.error)?.error?.message).toContain(
    "VERSION_CONFLICT",
  );
  let current = await get();
  if (!current.spaces.find((s) => s.id === b)?.items.length) {
    expect(
      (await save("LEAD", b, [third], current.edit_version)).error,
    ).toBeNull();
    current = await get();
  }
  expect(current.total).toBe("0.31");
  for (const actor of ["BDM", "OTHER_BDM", "OPS"]) {
    for (const table of [
      "quotations",
      "quotation_versions",
      "quotation_items",
      "quotation_draft_events",
    ]) {
      const r = await clients[actor]
        .from(table)
        .select("id")
        .eq("project_id", project);
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
    expect(
      (await save(actor, a, [], current.edit_version)).error,
    ).not.toBeNull();
  }
  expect(
    await rpc("BDM", "get_project_quotation", { p_project: project }),
  ).toBeNull();
  expect(
    (await clients.OPS.rpc("get_project_quotation", { p_project: project }))
      .error?.message,
  ).toContain("ACCESS_DENIED");
  // A Project member with no Space assignment may read, but cannot modify this Space.
  expect(
    (await rpc("UNASSIGNED", "get_project_quotation", { p_project: project }))
      .total,
  ).toBe("0.31");
  expect(
    (await save("UNASSIGNED", a, [], current.edit_version)).error?.message,
  ).toContain("ACCESS_DENIED");
  expect(
    (await save("LEAD", b, [one], current.edit_version)).error?.message,
  ).toContain("INVALID_ITEMS");
  expect(
    (
      await save(
        "LEAD",
        a,
        [{ ...one, unit_price: "-1" }],
        current.edit_version,
      )
    ).error?.message,
  ).toContain("INVALID_ITEMS");
  expect(
    (
      await save(
        "LEAD",
        a,
        [{ ...one, unit_price: "1.001" }],
        current.edit_version,
      )
    ).error?.message,
  ).toContain("INVALID_ITEMS");
  expect(
    (
      await clients.DESIGNER.from("quotation_items")
        .update({ unit_price: "999" })
        .eq("id", one.id)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await clients.LEAD.from("quotation_draft_events")
        .delete()
        .eq("project_id", project)
    ).error,
  ).not.toBeNull();
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: 1,
    p_action: "Hold",
    p_reason: "Pricing while held",
  });
  expect(
    (
      await save(
        "LEAD",
        a,
        [{ ...one, description: "Updated price", quantity: "2" }],
        current.edit_version,
      )
    ).error,
  ).toBeNull();
  current = await get();
  expect(current.total).toBe("0.40");
  const removed = await clients.LEAD.from("quotation_items")
    .select("id,removed_at")
    .eq("id", two.id)
    .single();
  expect(removed.data?.removed_at).toBeTruthy();
  await rpc("LEAD", "cancel_space", {
    p_id: a,
    p_expected_version: 1,
    p_reason: "Scope cancelled",
  });
  current = await get();
  expect(current.total).toBe("0.20");
  expect(current.spaces.find((s) => s.id === a)?.items[0].line_amount).toBe(
    "0.20",
  );
  expect(
    (await save("LEAD", a, [], current.edit_version)).error?.message,
  ).toContain("ACCESS_DENIED");
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: 2,
    p_action: "Cancel",
    p_reason: "End staging test",
  });
  expect(
    (await save("LEAD", b, [], current.edit_version)).error?.message,
  ).toContain("PROJECT_CANCELLED");
  expect(
    (await clients.ADMIN.rpc("create_quotation_draft", { p_project: project }))
      .error?.message,
  ).toContain("PROJECT_CANCELLED");
  const events = await clients.ADMIN.from("audit_events")
    .select("action")
    .eq("project_id", project)
    .eq("entity_type", "quotation");
  expect(events.data?.filter((e) => e.action === "draft_created")).toHaveLength(
    1,
  );
  expect(
    events.data?.filter((e) => e.action === "draft_space_saved").length,
  ).toBeGreaterThanOrEqual(3);
});
