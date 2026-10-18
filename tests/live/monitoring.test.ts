import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  localDate,
  projectMetrics,
  type Monitoring,
} from "../../src/lib/monitoring";
const clients = {} as Record<string, SupabaseClient>,
  ids = {} as Record<string, string>;
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
it("staging monitoring: progress/revisions, deadline history, concurrent hold/resume, activity corrections/files, timeline RLS and preserved cancellation", async () => {
  const lead = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      assigned_lead_designer_id: ids.LEAD,
      project_name: `Monitoring staging ${lead}`,
      address: `Synthetic monitoring ${lead}`,
      brand: "Stosa",
      cabinetry_count: 2,
      notes: "Authorized 2C fixture",
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
  const summary = async (actor = "LEAD") =>
    (await rpc(actor, "monitoring_summary", {
      p_projects: [project],
    })) as Monitoring[];
  expect(projectMetrics((await summary())[0]).progress).toBe("Not Available");
  const space = randomUUID(),
    second = randomUUID();
  const save = (id: string, version = 0, deadline = "2026-11-30") => ({
    p_id: id,
    p_project: project,
    p_expected_version: version,
    p_name: "Monitoring space",
    p_deadline: deadline,
    p_primary: ids.DESIGNER,
    p_support: [ids.UNASSIGNED],
    p_reason: "Staging scope",
  });
  await rpc("LEAD", "save_space", save(space));
  await rpc("LEAD", "save_space", save(second));
  const status = (version: number, value: string) => ({
    p_id: space,
    p_expected_version: version,
    p_status: value,
    p_reason: "Staging design cycle",
    p_approval: "External staging approval",
  });
  await rpc("DESIGNER", "change_space_status", status(1, "In Progress"));
  await rpc("DESIGNER", "change_space_status", status(2, "Submitted"));
  await rpc("LEAD", "change_space_status", status(3, "Completed"));
  expect(projectMetrics((await summary())[0]).progress).toBe("50.0%");
  await rpc("LEAD", "change_space_status", status(4, "For Revision"));
  expect(projectMetrics((await summary())[0]).progress).toBe("0.0%");
  const before = (
    await clients.LEAD.from("spaces")
      .select("work_started_at,cycle_started_at,first_completed_at")
      .eq("id", space)
      .single()
  ).data!;
  await rpc("LEAD", "save_space", save(space, 5, "2026-12-02"));
  const changed = (
    await clients.LEAD.from("spaces")
      .select(
        "original_deadline,work_started_at,cycle_started_at,first_completed_at",
      )
      .eq("id", space)
      .single()
  ).data!;
  expect(changed).toEqual({ ...before, original_deadline: "2026-11-30" });
  await rpc("LEAD", "revise_project_deadline", {
    p_project: project,
    p_version: 1,
    p_deadline: "2026-12-01",
    p_timezone: "Asia/Manila",
    p_reason: "Client target confirmed",
  });
  const held = await Promise.all([
    clients.LEAD.rpc("control_project", {
      p_project: project,
      p_version: 2,
      p_action: "Hold",
      p_reason: "Client pause",
    }),
    clients.ADMIN.rpc("control_project", {
      p_project: project,
      p_version: 2,
      p_action: "Hold",
      p_reason: "Concurrent pause",
    }),
  ]);
  expect(held.filter((r) => !r.error)).toHaveLength(1);
  expect(
    held.filter((r) => r.error?.message.includes("VERSION_CONFLICT")),
  ).toHaveLength(1);
  expect(
    (await clients.DESIGNER.rpc("change_space_status", status(6, "Submitted")))
      .error?.message,
  ).toContain("PROJECT_ON_HOLD");
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: 3,
    p_action: "Resume",
    p_reason: "Client resumes",
  });
  expect((await summary())[0].deadline).toBe("2026-12-01");
  const coordinator = await rpc("LEAD", "add_site_coordinator", {
    p_project: project,
    p_name: "Staging reference coordinator",
    p_reason: "Tagged site oversight",
  });
  const activityId = randomUUID();
  const activity = {
    p_id: activityId,
    p_project: project,
    p_version: 0,
    p_space: space,
    p_category: "Site Visit",
    p_date: localDate(new Date().toISOString()),
    p_description: "Synthetic site findings",
    p_coordinator: coordinator,
    p_attachments: [],
    p_reason: "Recorded actual visit",
  };
  await rpc("UNASSIGNED", "save_project_activity", activity);
  await rpc("UNASSIGNED", "save_project_activity", {
    ...activity,
    p_version: 1,
    p_description: "Corrected measurement",
    p_reason: "Measurement correction",
  });
  expect(
    (
      await clients.UNASSIGNED.rpc("save_project_activity", {
        ...activity,
        p_version: 1,
      })
    ).error?.message,
  ).toContain("VERSION_CONFLICT");
  const versions = await clients.LEAD.from("project_activity_versions")
    .select("number,snapshot")
    .eq("activity_id", activityId);
  expect(versions.data).toHaveLength(2);
  const timeline = await rpc("LEAD", "project_timeline", {
    p_project: project,
    p_category: "Site Visit",
    p_from: activity.p_date,
    p_to: activity.p_date,
    p_actor: ids.UNASSIGNED,
    p_space: space,
  });
  expect(timeline).toHaveLength(1);
  expect(timeline[0].description).toBe("Corrected measurement");
  expect(
    (await rpc("BDM", "project_timeline", { p_project: project })).some(
      (e: { category: string }) => e.category === "Site Visit",
    ),
  ).toBe(false);
  expect(
    (
      await clients.BDM.from("project_activity_versions")
        .select("activity_id")
        .eq("activity_id", activityId)
    ).data,
  ).toHaveLength(0);
  const content = Buffer.from("Authorized activity reference");
  const file = await rpc("BDM", "reserve_attachment", {
    p_attachment: null,
    p_lead: null,
    p_project: project,
    p_class: "general",
    p_name: "activity-staging.txt",
    p_mime: "text/plain",
    p_size: content.length,
  });
  const uploaded = await clients.BDM.storage
    .from(file.bucket)
    .upload(file.object_path, content, {
      contentType: "text/plain",
      upsert: false,
    });
  expect(uploaded.error).toBeNull();
  await rpc("BDM", "complete_attachment", { p_version: file.id });
  await rpc("DESIGNER", "save_project_activity", {
    ...activity,
    p_id: randomUUID(),
    p_space: null,
    p_category: "General Update",
    p_coordinator: null,
    p_attachments: [file.id],
    p_description: "Authorized project file reference",
  });
  const download = await clients.BDM.storage
    .from(file.bucket)
    .createSignedUrl(file.object_path, 60);
  expect(download.error).toBeNull();
  expect(
    (
      await clients.OTHER_BDM.storage
        .from(file.bucket)
        .createSignedUrl(file.object_path, 60)
    ).error,
  ).toBeTruthy();
  for (const actor of ["OPS", "OTHER_BDM"]) {
    expect(await summary(actor)).toHaveLength(0);
    expect(
      (await clients[actor].rpc("project_timeline", { p_project: project }))
        .error?.message,
    ).toContain("ACCESS_DENIED");
  }
  expect(
    (
      await clients.DESIGNER.rpc("control_project", {
        p_project: project,
        p_version: 4,
        p_action: "Cancel",
        p_reason: "Forbidden",
      })
    ).error?.message,
  ).toContain("ACCESS_DENIED");
  expect(
    (
      await clients.LEAD.from("project_monitoring")
        .update({ state: "Cancelled" })
        .eq("project_id", project)
    ).error,
  ).toBeTruthy();
  await rpc("LEAD", "cancel_space", {
    p_id: second,
    p_expected_version: 1,
    p_reason: "Scope removed",
  });
  expect((await summary())[0].active_spaces).toBe(1);
  await rpc("LEAD", "control_project", {
    p_project: project,
    p_version: 4,
    p_action: "Cancel",
    p_reason: "Synthetic project cancellation",
  });
  const final = (await summary())[0];
  expect(final.state).toBe("Cancelled");
  expect(final.cycles[0].outcome).toBe("Cancelled");
  expect(projectMetrics(final, "2030-01-01T00:00:00Z").age).toBe(
    projectMetrics(final).age,
  );
  expect(
    (
      await clients.LEAD.from("projects")
        .select("commercial_status,is_cancelled")
        .eq("id", project)
        .single()
    ).data,
  ).toEqual({ commercial_status: "For Quotation", is_cancelled: true });
  expect(
    (
      await clients.LEAD.from("project_activities")
        .select("id")
        .eq("project_id", project)
    ).data,
  ).toHaveLength(2);
  expect(
    (await clients.BDM.storage.from(file.bucket).download(file.object_path))
      .error,
  ).toBeNull();
  expect(
    (await clients.DESIGNER.rpc("change_space_status", status(6, "Submitted")))
      .error?.message,
  ).toContain("PROJECT_CANCELLED");
  const audit = await clients.ADMIN.from("audit_events")
    .select("action,previous_value,new_value")
    .eq("project_id", project);
  expect(audit.data!.some((e) => e.action === "project.cancel")).toBe(true);
  expect(
    audit.data!.some(
      (e) =>
        e.action === "project.deadline_revised" &&
        e.previous_value.deadline === null &&
        e.new_value.deadline === "2026-12-01",
    ),
  ).toBe(true);
});
it("staging seeded Closed fixture: Ops operational activity visibility excludes restricted manual categories and permits own corrections", async () => {
  const fixture = JSON.parse(
    readFileSync(
      "artifacts/verification/monitoring-closed-fixture.json",
      "utf8",
    ),
  );
  const project = fixture.id;
  const summaries = await rpc("OPS", "monitoring_summary", {
    p_projects: [project],
  });
  expect(summaries).toHaveLength(1);
  const opsSpace = randomUUID();
  await rpc("LEAD", "save_space", {
    p_id: opsSpace,
    p_project: project,
    p_expected_version: 0,
    p_name: "Closed operational reference",
    p_deadline: null,
    p_primary: ids.DESIGNER,
    p_support: [],
    p_reason: "Synthetic post-close reference",
  });
  expect(
    (await clients.OPS.from("spaces").select("id").eq("id", opsSpace)).data,
  ).toHaveLength(1);
  expect(
    (
      await clients.OPS.rpc("change_space_status", {
        p_id: opsSpace,
        p_expected_version: 1,
        p_status: "In Progress",
        p_reason: "Forbidden edit",
      })
    ).error?.message,
  ).toContain("ACCESS_DENIED");
  const activity = {
    p_id: randomUUID(),
    p_project: project,
    p_version: 0,
    p_space: null,
    p_category: "Supplier Update",
    p_date: localDate(new Date().toISOString()),
    p_description: "Synthetic supplier update",
    p_coordinator: null,
    p_attachments: [],
    p_reason: "Operational monitoring",
  };
  await rpc("OPS", "save_project_activity", activity);
  await rpc("OPS", "save_project_activity", {
    ...activity,
    p_version: 1,
    p_description: "Corrected supplier date",
  });
  expect(
    (
      await clients.OPS.rpc("save_project_activity", {
        ...activity,
        p_id: randomUUID(),
        p_category: "Design Work",
      })
    ).error?.message,
  ).toContain("ACCESS_DENIED");
  const timeline = await rpc("OPS", "project_timeline", { p_project: project });
  expect(
    timeline.some(
      (e: { category: string }) => e.category === "Supplier Update",
    ),
  ).toBe(true);
  expect(
    timeline.some((e: { description: string }) =>
      e.description.startsWith("space.created"),
    ),
  ).toBe(true);
});
