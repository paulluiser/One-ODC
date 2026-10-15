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
it("staging: spaces, duplicate names, assigned edits, atomic bulk, completion/revision/cancellation and real JWT isolation", async () => {
  const lead = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      project_name: `Space verification ${lead}`,
      address: `Synthetic staging ${lead}`,
      brand: "Stosa",
      cabinetry_count: 2,
      notes: "Authorized 2B fixture",
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
  const save = (
    id: string,
    version: number,
    primary = ids.DESIGNER,
    support = [ids.UNASSIGNED],
  ) => ({
    p_id: id,
    p_project: project,
    p_expected_version: version,
    p_name: "Kitchen",
    p_deadline: "2026-11-30",
    p_primary: primary,
    p_support: support,
    p_reason: "Staging scope",
  });
  await rpc("LEAD", "save_space", save(a, 0));
  await rpc("LEAD", "save_space", save(b, 0, ids.LEAD, []));
  const query = await clients.LEAD.from("spaces")
    .select("id")
    .eq("project_id", project)
    .eq("name", "Kitchen");
  expect(query.error).toBeNull();
  expect(query.data).toHaveLength(2);
  for (const actor of ["OPS", "OTHER_BDM"]) {
    for (const table of ["spaces", "space_events"]) {
      const r = await clients[actor]
        .from(table)
        .select("id")
        .eq("project_id", project);
      expect(r.error).toBeNull();
      expect(r.data).toHaveLength(0);
    }
  }
  expect(
    (await clients.BDM.from("spaces").select("id").eq("project_id", project))
      .data,
  ).toHaveLength(2);
  expect(
    (await clients.DESIGNER.rpc("save_space", save(b, 1))).error?.message,
  ).toContain("ACCESS_DENIED");
  expect(
    (await clients.BDM.rpc("save_space", save(a, 1))).error?.message,
  ).toContain("ACCESS_DENIED");
  expect(
    (
      await clients.DESIGNER.from("spaces")
        .update({ name: "Direct bypass" })
        .eq("id", a)
    ).error,
  ).toBeTruthy();
  await rpc("UNASSIGNED", "save_space", save(a, 1));
  const status = (
    id: string,
    version: number,
    value: string,
    approval = "",
  ) => ({
    p_id: id,
    p_expected_version: version,
    p_status: value,
    p_reason: "Staging design review",
    p_approval: approval,
  });
  await rpc("DESIGNER", "change_space_status", status(a, 2, "In Progress"));
  // Concurrent updates from actual JWT sessions: exactly one wins the same version.
  const concurrent = await Promise.all([
    clients.DESIGNER.rpc("change_space_status", status(a, 3, "Submitted")),
    clients.UNASSIGNED.rpc("change_space_status", status(a, 3, "On Hold")),
  ]);
  expect(concurrent.filter((r) => !r.error)).toHaveLength(1);
  expect(
    concurrent.filter((r) => r.error?.message.includes("VERSION_CONFLICT")),
  ).toHaveLength(1);
  let current = (
    await clients.LEAD.from("spaces").select("*").eq("id", a).single()
  ).data!;
  if (current.status === "On Hold") {
    await rpc("DESIGNER", "change_space_status", status(a, 4, "In Progress"));
    await rpc("DESIGNER", "change_space_status", status(a, 5, "Submitted"));
  }
  current = (await clients.LEAD.from("spaces").select("*").eq("id", a).single())
    .data!;
  expect(
    (
      await clients.DESIGNER.rpc(
        "change_space_status",
        status(a, current.version, "Completed", "Client approval"),
      )
    ).error?.message,
  ).toContain("ACCESS_DENIED");
  expect(
    (
      await clients.LEAD.rpc(
        "change_space_status",
        status(a, current.version, "Completed"),
      )
    ).error?.message,
  ).toContain("ACCESS_DENIED");
  await rpc(
    "LEAD",
    "change_space_status",
    status(a, current.version, "Completed", "Staging external approval 001"),
  );
  current = (await clients.LEAD.from("spaces").select("*").eq("id", a).single())
    .data!;
  const completion = current.first_completed_at;
  await rpc(
    "LEAD",
    "change_space_status",
    status(a, current.version, "For Revision"),
  );
  current = (await clients.LEAD.from("spaces").select("*").eq("id", a).single())
    .data!;
  expect(current.revision_number).toBe(1);
  expect(current.first_completed_at).toBe(completion);
  const bulk = {
    p_project: project,
    p_spaces: [
      { id: a, version: current.version },
      { id: b, version: 99 },
    ],
    p_primary: ids.UNASSIGNED,
    p_support: [ids.DESIGNER],
    p_reason: "Workload rebalance",
  };
  expect(
    (await clients.LEAD.rpc("bulk_reassign_spaces", bulk)).error?.message,
  ).toContain("VERSION_CONFLICT");
  expect(
    (await clients.LEAD.from("spaces").select("version").eq("id", a).single())
      .data?.version,
  ).toBe(current.version);
  bulk.p_spaces[1].version = 1;
  await rpc("LEAD", "bulk_reassign_spaces", bulk);
  expect(
    (await clients.DESIGNER.rpc("bulk_reassign_spaces", bulk)).error?.message,
  ).toContain("ACCESS_DENIED");
  await rpc("ADMIN", "change_space_status", status(b, 2, "Completed"));
  const event = await clients.LEAD.from("space_events")
    .select("new_value")
    .eq("space_id", b)
    .eq("action", "space.status_changed")
    .single();
  expect(event.data?.new_value.administrator_override).toBe(true);
  expect(
    (
      await clients.LEAD.rpc("cancel_space", {
        p_id: b,
        p_expected_version: 3,
        p_reason: "",
      })
    ).error?.message,
  ).toContain("VALIDATION_ERROR");
  await rpc("LEAD", "cancel_space", {
    p_id: b,
    p_expected_version: 3,
    p_reason: "Synthetic scope removed",
  });
  expect(
    (
      await clients.LEAD.from("spaces")
        .select("id")
        .eq("project_id", project)
        .is("cancelled_at", null)
    ).data,
  ).toHaveLength(1);
  expect(
    (
      await clients.LEAD.rpc(
        "change_space_status",
        status(b, 4, "For Revision"),
      )
    ).error?.message,
  ).toContain("SPACE_CANCELLED");
  const events = await clients.LEAD.from("space_events")
    .select("action,previous_value,new_value")
    .eq("project_id", project);
  expect(events.error).toBeNull();
  expect(events.data!.some((e) => e.action === "space.cancelled")).toBe(true);
  expect(
    events.data!.some(
      (e) =>
        e.previous_value?.primary_designer_id === ids.DESIGNER &&
        e.new_value.primary_designer_id === ids.UNASSIGNED,
    ),
  ).toBe(true);
  // Removing a Designer's project membership also removes their remaining space privileges.
  await rpc("LEAD", "assign_project_personnel", {
    p_project: project,
    p_primary: ids.UNASSIGNED,
    p_support: [],
    p_ops: [ids.OPS],
    p_reason: "Staging access regression",
  });
  expect(
    (
      await clients.DESIGNER.from("spaces")
        .select("id")
        .eq("project_id", project)
    ).data,
  ).toHaveLength(0);
  expect(
    (
      await clients.DESIGNER.rpc(
        "change_space_status",
        status(a, current.version + 1, "Submitted"),
      )
    ).error?.message,
  ).toContain("ACCESS_DENIED");
  const notices = await clients.UNASSIGNED.from("notifications")
    .select("id")
    .eq("project_id", project);
  expect(notices.error).toBeNull();
  expect(notices.data!.length).toBeGreaterThan(2);
});
