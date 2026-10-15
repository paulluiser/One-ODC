import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localDate } from "../../src/lib/monitoring";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
const actors = [
  "ADMIN",
  "BDM",
  "LEAD",
  "DESIGNER",
  "OPS",
  "OTHER_BDM",
  "UNASSIGNED",
] as const;
type Actor = (typeof actors)[number];
const clients = {} as Record<Actor, SupabaseClient>;
const ids = {} as Record<Actor, string>;
async function rpc(actor: Actor, name: string, args: Record<string, unknown>) {
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
    throw new Error("Refusing non-staging tests");
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
it("2D real JWT security matrix, cross-project bindings, duplicate prevention, active-session revocation and immutable history", async () => {
  const create = async (primary: string) => {
    const id = randomUUID();
    await rpc("BDM", "save_lead", {
      p_id: id,
      p_expected_version: 0,
      p_payload: {
        project_name: `2D acceptance ${id}`,
        address: `Synthetic security ${id}`,
        brand: "Stosa",
        cabinetry_count: 2,
        notes: "Synthetic acceptance fixture",
        date_needed: null,
        attachment_metadata: [],
      },
      p_submit: true,
      p_duplicate_reason: "",
    });
    const args = {
      p_id: id,
      p_expected_version: 1,
      p_decision: "Accepted",
      p_remarks: "",
      p_primary: primary,
      p_support: [ids.LEAD],
      p_ops: [ids.OPS],
      p_lead_designer: null,
    };
    const results = await Promise.all([
      clients.LEAD.rpc("review_lead", args),
      clients.LEAD.rpc("review_lead", args),
    ]);
    for (const r of results) expect(r.error).toBeNull();
    expect(results[0].data).toBe(results[1].data);
    return { project: results[0].data as string, lead: id, accept: args };
  };
  const a = await create(ids.DESIGNER),
    b = await create(ids.UNASSIGNED);
  const space = randomUUID(),
    otherSpace = randomUUID();
  const save = (project: string, id: string, primary: string) => ({
    p_id: id,
    p_project: project,
    p_expected_version: 0,
    p_name: "Acceptance room",
    p_deadline: null,
    p_primary: primary,
    p_support: [],
    p_reason: "Initial scope",
  });
  await rpc("LEAD", "save_space", save(a.project, space, ids.DESIGNER));
  await rpc("LEAD", "save_space", save(b.project, otherSpace, ids.UNASSIGNED));
  const noticeCount = async () => {
    const r = await clients.BDM.from("notifications")
      .select("id")
      .eq("project_id", a.project);
    expect(r.error).toBeNull();
    return r.data!.length;
  };
  const notices = await noticeCount();
  await rpc("LEAD", "review_lead", a.accept);
  expect(await noticeCount()).toBe(notices); // acceptance retries do not duplicate notices
  for (const actor of ["ADMIN", "LEAD", "DESIGNER", "BDM"] as Actor[]) {
    expect(
      (
        await clients[actor]
          .from("spaces")
          .select("id")
          .eq("project_id", a.project)
      ).data,
    ).toHaveLength(1);
    expect(
      await rpc(actor, "monitoring_summary", { p_projects: [a.project] }),
    ).toHaveLength(1);
  }
  for (const actor of ["OPS", "OTHER_BDM", "UNASSIGNED"] as Actor[]) {
    for (const table of [
      "spaces",
      "space_events",
      "project_monitoring",
      "project_activities",
      "project_activity_versions",
      "project_holds",
      "project_operational_cycles",
      "project_site_coordinators",
    ]) {
      const r = await clients[actor]
        .from(table)
        .select("*")
        .eq("project_id", a.project);
      expect(r.error).toBeNull();
      expect(r.data, `${actor} ${table}`).toEqual([]);
    }
    expect(
      (await clients[actor].rpc("project_timeline", { p_project: a.project }))
        .error?.message,
    ).toContain("ACCESS_DENIED");
  }
  const transition = (id = space) => ({
    p_id: id,
    p_expected_version: 1,
    p_status: "In Progress",
    p_reason: "Unauthorized regression",
  });
  for (const actor of ["BDM", "OPS", "OTHER_BDM", "UNASSIGNED"] as Actor[])
    expect(
      (await clients[actor].rpc("change_space_status", transition())).error
        ?.message,
    ).toContain("ACCESS_DENIED");
  expect(
    (await clients.DESIGNER.rpc("change_space_status", transition(otherSpace)))
      .error?.message,
  ).toContain("ACCESS_DENIED");
  // Supplied parent IDs cannot move a space or associate a foreign activity.
  expect(
    (
      await clients.LEAD.rpc("save_space", {
        ...save(b.project, space, ids.UNASSIGNED),
        p_expected_version: 1,
      })
    ).error?.message,
  ).toContain("ACCESS_DENIED");
  const activity = {
    p_id: randomUUID(),
    p_project: a.project,
    p_version: 0,
    p_space: space,
    p_category: "Design Work",
    p_date: localDate(new Date().toISOString()),
    p_description: "Concurrent activity acceptance",
    p_coordinator: null,
    p_attachments: [],
    p_reason: "Actual work recorded",
  };
  expect(
    (
      await clients.DESIGNER.rpc("save_project_activity", {
        ...activity,
        p_space: otherSpace,
      })
    ).error?.message,
  ).toContain("ACCESS_DENIED");
  const saves = await Promise.all([
    clients.DESIGNER.rpc("save_project_activity", activity),
    clients.DESIGNER.rpc("save_project_activity", activity),
  ]);
  expect(saves.filter((r) => !r.error)).toHaveLength(1);
  expect(
    saves.filter((r) => r.error?.message.includes("VERSION_CONFLICT")),
  ).toHaveLength(1);
  expect(
    (
      await clients.LEAD.from("project_activity_versions")
        .select("number")
        .eq("activity_id", activity.p_id)
    ).data,
  ).toHaveLength(1);
  const file = await rpc("BDM", "reserve_attachment", {
    p_attachment: null,
    p_lead: null,
    p_project: a.project,
    p_class: "general",
    p_name: "2d-private.txt",
    p_mime: "text/plain",
    p_size: 4,
  });
  expect(
    (
      await clients.BDM.storage
        .from(file.bucket)
        .upload(file.object_path, Buffer.from("test"), {
          contentType: "text/plain",
        })
    ).error,
  ).toBeNull();
  await rpc("BDM", "complete_attachment", { p_version: file.id });
  expect(
    (
      await clients.UNASSIGNED.storage
        .from(file.bucket)
        .createSignedUrl(file.object_path, 60)
    ).error,
  ).toBeTruthy();
  expect(
    (await clients.OPS.storage.from(file.bucket).download(file.object_path))
      .error,
  ).toBeTruthy();
  const access = async (active: boolean) =>
    rpc("ADMIN", "update_user_access", {
      p_user: ids.DESIGNER,
      p_role: "designer",
      p_active: active,
      p_name: "Staging DESIGNER",
      p_reason: "2D dedicated staging access revocation regression",
    });
  try {
    await access(false);
    for (const table of [
      "projects",
      "spaces",
      "space_events",
      "project_activities",
      "project_monitoring",
    ]) {
      const column = table === "projects" ? "id" : "project_id";
      expect(
        (await clients.DESIGNER.from(table).select("*").eq(column, a.project))
          .data,
      ).toEqual([]);
    }
    expect(
      (
        await clients.DESIGNER.rpc("monitoring_summary", {
          p_projects: [a.project],
        })
      ).error?.message,
    ).toContain("ACCESS_DENIED");
    expect(
      (await clients.DESIGNER.rpc("change_space_status", transition())).error
        ?.message,
    ).toContain("ACCESS_DENIED");
    expect(
      (
        await clients.DESIGNER.storage
          .from(file.bucket)
          .createSignedUrl(file.object_path, 60)
      ).error,
    ).toBeTruthy();
    expect(
      (
        await clients.DESIGNER.storage
          .from(file.bucket)
          .download(file.object_path)
      ).error,
    ).toBeTruthy();
  } finally {
    await access(true);
  }
  expect(
    (await clients.DESIGNER.from("spaces").select("id").eq("id", space)).data,
  ).toHaveLength(1);
  const counts = async () => {
    const tables = [
      "audit_events",
      "space_events",
      "project_activity_versions",
    ] as const;
    const result: number[] = [];
    for (const table of tables) {
      const r = await clients.ADMIN.from(table)
        .select("*", { count: "exact", head: true })
        .eq("project_id", a.project);
      expect(r.error).toBeNull();
      result.push(r.count!);
    }
    return result;
  };
  const before = await counts();
  for (const table of [
    "audit_events",
    "space_events",
    "project_activity_versions",
  ]) {
    expect(
      (
        await clients.ADMIN.from(table)
          .update({ actor_id: ids.BDM })
          .eq("project_id", a.project)
      ).error,
    ).toBeTruthy();
    expect(
      (await clients.ADMIN.from(table).delete().eq("project_id", a.project))
        .error,
    ).toBeTruthy();
  }
  expect(await counts()).toEqual(before);
  // No-op table updates cannot be used to bypass the transactional RPC boundary.
  for (const table of ["project_monitoring", "spaces", "project_activities"]) {
    const key = table === "project_monitoring" ? "project_id" : "id",
      target =
        table === "spaces"
          ? space
          : table === "project_activities"
            ? activity.p_id
            : a.project;
    expect(
      (await clients.ADMIN.from(table).update({ version: 999 }).eq(key, target))
        .error,
    ).toBeTruthy();
  }
  await rpc("LEAD", "control_project", {
    p_project: a.project,
    p_version: 1,
    p_action: "Cancel",
    p_reason: "Synthetic integrity cancellation",
  });
  expect(
    (
      await clients.LEAD.rpc("control_project", {
        p_project: a.project,
        p_version: 2,
        p_action: "Reopen",
        p_reason: "Cannot reopen cancelled work",
      })
    ).error?.message,
  ).toContain("PROJECT_CANCELLED");
  const cancelled = (
    await rpc("LEAD", "monitoring_summary", { p_projects: [a.project] })
  )[0];
  expect(cancelled.cycles).toHaveLength(1);
  expect(cancelled.cycles[0].outcome).toBe("Cancelled");
  expect(
    (await clients.BDM.storage.from(file.bucket).download(file.object_path))
      .error,
  ).toBeNull();
  const completed = JSON.parse(
    readFileSync(
      "artifacts/verification/monitoring-completed-fixture.json",
      "utf8",
    ),
  );
  const cycle = (
    await rpc("LEAD", "monitoring_summary", { p_projects: [completed.id] })
  )[0];
  if (cycle.cycles.some((c: { ended_at: string | null }) => !c.ended_at)) {
    expect(
      (
        await clients.LEAD.rpc("control_project", {
          p_project: completed.id,
          p_version: cycle.version,
          p_action: "Reopen",
          p_reason: "Repeated active reopen attempt",
        })
      ).error?.message,
    ).toContain("INVALID_TRANSITION");
    expect(
      (
        await rpc("LEAD", "monitoring_summary", { p_projects: [completed.id] })
      )[0].cycles,
    ).toEqual(cycle.cycles);
  }
});
