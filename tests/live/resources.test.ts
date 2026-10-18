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

it("3E staging: concurrent three-file cap, real inherited uploads/replacements, links/Notes and scoped edits", async () => {
  const lead = randomUUID();
  const links = [
    { id: randomUUID(), url: "https://example.com/plans" },
    { id: randomUUID(), url: "https://example.com/specifications" },
  ];
  const payload = {
    assigned_lead_designer_id: ids.LEAD,
    project_name: `3E staging ${lead}`,
    address: `Synthetic ${lead}`,
    brand: "Stosa",
    cabinetry_count: 1,
    notes: "<b>Plain Notes</b>\nSecond line",
    resource_links: links,
    date_needed: null,
    attachment_metadata: [],
  };
  const save = (version: number, submit: boolean) =>
    rpc("BDM", "save_lead", {
      p_id: lead,
      p_expected_version: version,
      p_payload: payload,
      p_submit: submit,
      p_duplicate_reason: "",
    });
  for (const link of [
    { id: randomUUID() },
    { id: randomUUID(), url: "https://example.com:99999/path" },
  ]) {
    const denied = await clients.BDM.rpc("save_lead", {
      p_id: lead,
      p_expected_version: 0,
      p_payload: { ...payload, resource_links: [link] },
      p_submit: false,
      p_duplicate_reason: "",
    });
    expect(denied.error?.message).toContain("INVALID_RESOURCE_LINKS");
  }
  await save(0, false);
  const reserve = (
    actor: string,
    project: string | null,
    replacement: string | null = null,
  ) =>
    clients[actor].rpc("reserve_attachment", {
      p_attachment: replacement,
      p_lead: project ? null : lead,
      p_project: project,
      p_class: "general",
      p_name: "test.txt",
      p_mime: "text/plain",
      p_size: 4,
    });
  const attempts = await Promise.all(
    Array.from({ length: 5 }, () => reserve("BDM", null)),
  );
  expect(attempts.filter((r) => !r.error)).toHaveLength(3);
  expect(
    attempts
      .filter((r) => r.error)
      .every((r) => r.error?.message.includes("ATTACHMENT_COUNT_LIMIT")),
  ).toBe(true);
  const reservations = attempts.filter((r) => !r.error).map((r) => r.data);
  for (const v of reservations) {
    const upload = await clients.BDM.storage
      .from("one-odc-attachments")
      .upload(v.object_path, new Blob(["test"], { type: "text/plain" }), {
        upsert: false,
        contentType: "text/plain",
      });
    expect(upload.error).toBeNull();
    await rpc("BDM", "complete_attachment", { p_version: v.id });
  }
  await save(1, true);
  await rpc("LEAD", "review_lead", {
    p_id: lead,
    p_expected_version: 2,
    p_decision: "Returned for Clarification",
    p_remarks: "Clarify Notes",
  });
  payload.notes = "Clarified Notes\nPreserved lines";
  await save(3, true);
  const project = await rpc("LEAD", "review_lead", {
    p_id: lead,
    p_expected_version: 4,
    p_decision: "Accepted",
    p_remarks: "",
    p_primary: ids.DESIGNER,
    p_support: [],
    p_ops: [ids.OPS],
    p_lead_designer: null,
  });
  expect(
    await rpc("LEAD", "get_attachment_slots", { p_project: project }),
  ).toEqual({ uploaded: 3, reserved: 0, remaining: 0 });
  expect((await reserve("DESIGNER", project)).error?.message).toContain(
    "ATTACHMENT_COUNT_LIMIT",
  );
  const inherited = reservations[0];
  const replacement = await reserve(
    "DESIGNER",
    project,
    inherited.attachment_id,
  );
  expect(replacement.error).toBeNull();
  expect(
    (
      await clients.DESIGNER.storage
        .from("one-odc-attachments")
        .upload(
          replacement.data.object_path,
          new Blob(["new!"], { type: "text/plain" }),
          { upsert: false, contentType: "text/plain" },
        )
    ).error,
  ).toBeNull();
  await rpc("DESIGNER", "complete_attachment", {
    p_version: replacement.data.id,
  });
  expect(
    (
      await clients.DESIGNER.from("attachment_versions")
        .select("id")
        .eq("attachment_id", inherited.attachment_id)
    ).data,
  ).toHaveLength(2);
  expect(
    (
      await clients.DESIGNER.storage
        .from("one-odc-attachments")
        .createSignedUrl(inherited.object_path, 60)
    ).error,
  ).toBeNull();
  await rpc("LEAD", "archive_attachment", {
    p_id: inherited.attachment_id,
    p_archive: true,
    p_reason: "Archive synthetic file",
  });
  expect(
    (await rpc("LEAD", "get_attachment_slots", { p_project: project }))
      .remaining,
  ).toBe(1);
  await rpc("LEAD", "archive_attachment", {
    p_id: inherited.attachment_id,
    p_archive: false,
    p_reason: "Restore synthetic file",
  });
  const resources = await rpc("DESIGNER", "project_resources", {
    p_project: project,
  });
  expect(resources).toMatchObject({
    notes: payload.notes,
    resource_links: links,
  });
  for (const actor of ["OPS", "OTHER_BDM", "UNASSIGNED"]) {
    expect(
      (await clients[actor].rpc("project_resources", { p_project: project }))
        .error?.message,
    ).toContain("ACCESS_DENIED");
    expect(
      (await clients[actor].rpc("get_attachment_slots", { p_project: project }))
        .error?.message,
    ).toContain("ACCESS_DENIED");
    expect(
      (
        await clients[actor].storage
          .from("one-odc-attachments")
          .createSignedUrl(inherited.object_path, 60)
      ).error,
    ).not.toBeNull();
  }
  expect(
    (
      await clients.DESIGNER.rpc("update_project_resources", {
        p_project: project,
        p_version: resources.version,
        p_notes: "Forbidden",
        p_links: [],
        p_reason: "Test",
      })
    ).error?.message,
  ).toContain("ACCESS_DENIED");
  await rpc("BDM", "update_project_resources", {
    p_project: project,
    p_version: resources.version,
    p_notes: "Authorized project Notes",
    p_links: [links[0]],
    p_reason: "Client clarification",
  });
  expect(
    (await rpc("LEAD", "project_resources", { p_project: project })).notes,
  ).toBe("Authorized project Notes");
  expect(
    (
      await clients.ADMIN.from("audit_events")
        .select("previous_value,new_value")
        .eq("project_id", project)
        .eq("action", "project.resources_changed")
    ).data,
  ).toHaveLength(1);
});
