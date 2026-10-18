import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
const stage = "jlvlwkryasoducuucvxk";
const clients: Record<string, SupabaseClient> = {};
const ids: Record<string, string> = {};
const lead = randomUUID();
let attachment: { id: string; object_path: string };
let project: string;
const accounts = ["ADMIN", "BDM", "LEAD", "DESIGNER", "OPS", "OTHER_BDM"];
function fresh() {
  return createClient(
    process.env.ONE_ODC_TEST_URL!,
    process.env.ONE_ODC_TEST_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
async function rpc(actor: string, name: string, args: Record<string, unknown>) {
  const r = await clients[actor].rpc(name, args);
  if (r.error) throw new Error(`${name}: ${r.error.code} ${r.error.message}`);
  return r.data;
}
const payload = () => ({
  assigned_lead_designer_id: ids.LEAD,
  project_name: `Lead routing staging ${lead}`,
  address: `Synthetic staging brief ${lead}`,
  brand: "Stosa",
  cabinetry_count: 2,
  notes: "Authorized routing verification",
  resource_links: [{ id: lead, url: "https://example.com/quotation-brief" }],
  date_needed: null,
  attachment_metadata: [],
});
beforeAll(async () => {
  process.loadEnvFile(".env.verification");
  if (
    process.env.ONE_ODC_TEST_PROJECT_ID !== stage ||
    new URL(process.env.ONE_ODC_TEST_URL!).hostname !== `${stage}.supabase.co`
  )
    throw new Error("Refusing non-staging verification");
  for (const actor of accounts) {
    clients[actor] = fresh();
    const login = await clients[actor].auth.signInWithPassword({
      email: process.env[`ONE_ODC_TEST_${actor}_EMAIL`]!,
      password: process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]!,
    });
    if (login.error) throw new Error(`Staging sign-in failed: ${actor}`);
    ids[actor] = login.data.user!.id;
  }
  const path = "artifacts/verification/routing-second-lead.json";
  let account: { email: string; password: string; id: string };
  if (existsSync(path)) account = JSON.parse(readFileSync(path, "utf8"));
  else {
    const admin = createClient(
      process.env.ONE_ODC_TEST_URL!,
      process.env.ONE_ODC_TEST_SECRET_KEY!,
      { auth: { persistSession: false } },
    );
    const email = `oneodc.routing.${randomUUID()}@example.test`,
      password = randomBytes(24).toString("base64url");
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "One ODC staging second Lead Designer" },
    });
    if (created.error)
      throw new Error("Could not create dedicated staging Lead Designer");
    account = { email, password, id: created.data.user.id };
    writeFileSync(path, JSON.stringify(account), { mode: 0o600 });
  }
  await rpc("ADMIN", "update_user_access", {
    p_user: account.id,
    p_role: "lead_designer",
    p_active: true,
    p_name: "One ODC staging second Lead Designer",
    p_reason: "Authorized multi-Lead Designer staging verification",
  });
  clients.SECOND = fresh();
  const login = await clients.SECOND.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (login.error) throw new Error("Second Lead Designer sign-in failed");
  ids.SECOND = account.id;
}, 60000);
afterAll(async () => {
  for (const client of Object.values(clients))
    await client.auth.signOut({ scope: "local" });
});
it("staging: requires a recipient, restricts the directory, and saves a routed draft", async () => {
  const missing = await clients.BDM.rpc("save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: { ...payload(), assigned_lead_designer_id: null },
    p_submit: true,
  });
  expect(missing.error?.message).toContain("INVALID_LEAD_DESIGNER");
  expect(
    (await clients.BDM.from("leads").select("id").eq("id", lead)).data,
  ).toHaveLength(0);
  expect(
    (await clients.OPS.rpc("list_lead_designers")).error?.message,
  ).toContain("ACCESS_DENIED");
  const directory = await rpc("BDM", "list_lead_designers", {});
  expect(directory.some((p: { id: string }) => p.id === ids.SECOND)).toBe(true);
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: payload(),
    p_submit: false,
  });
  expect(
    (await clients.LEAD.from("leads").select("id").eq("id", lead)).data,
  ).toHaveLength(0);
});
it("staging: links-only uploads blocked, legacy files retained, submission and Storage isolation", async () => {
  // Setup historical records only with the staging server secret. All policy
  // assertions and workflow writes below use real user JWTs, never this client.
  const setup = createClient(
    process.env.ONE_ODC_TEST_URL!,
    process.env.ONE_ODC_TEST_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
  async function historicalFile(ready: boolean) {
    const a = await setup
      .from("attachments")
      .insert({ lead_id: lead, classification: "general", created_by: ids.BDM })
      .select("id")
      .single();
    if (a.error) throw new Error("Legacy attachment fixture setup failed");
    const id = randomUUID(),
      path = `leads/${lead}/attachments/${a.data.id}/versions/${id}`;
    const v = await setup.from("attachment_versions").insert({
      id,
      attachment_id: a.data.id,
      object_path: path,
      original_name: "legacy-brief.txt",
      mime_type: "text/plain",
      expected_size: 10,
      created_by: ids.BDM,
      ready_at: ready ? new Date().toISOString() : null,
      actual_size: ready ? 10 : null,
    });
    if (v.error) throw new Error("Legacy version fixture setup failed");
    if (ready) {
      const object = await setup.storage
        .from("one-odc-attachments")
        .upload(path, new Uint8Array(10), { contentType: "text/plain" });
      if (object.error) throw new Error("Legacy object fixture setup failed");
    }
    return { id, object_path: path, attachment_id: a.data.id };
  }
  attachment = await historicalFile(true);
  const pending = await historicalFile(false);
  const reservation = {
    p_attachment: null,
    p_lead: lead,
    p_project: null,
    p_class: "general",
    p_name: "new.txt",
    p_mime: "text/plain",
    p_size: 10,
  };
  expect(
    (await clients.BDM.rpc("reserve_attachment", reservation)).error?.message,
  ).toContain("LEAD_LINKS_ONLY");
  expect(
    (
      await clients.BDM.rpc("reserve_attachment", {
        ...reservation,
        p_attachment: (attachment as { attachment_id?: string }).attachment_id,
        p_lead: null,
      })
    ).error?.message,
  ).toContain("LEAD_LINKS_ONLY");
  expect(
    (
      await clients.BDM.storage
        .from("one-odc-attachments")
        .upload(pending.object_path, new Uint8Array(10), {
          contentType: "text/plain",
        })
    ).error,
  ).not.toBeNull();
  await rpc("BDM", "archive_attachment", {
    p_id: pending.attachment_id,
    p_archive: true,
    p_reason: "Archive unfinished historical request upload; links only",
  });
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 1,
    p_payload: payload(),
    p_submit: true,
  });
  expect(
    (await clients.LEAD.from("notifications").select("id").eq("lead_id", lead))
      .data,
  ).toHaveLength(1);
  expect(
    (
      await clients.SECOND.from("notifications")
        .select("id")
        .eq("lead_id", lead)
    ).data,
  ).toHaveLength(0);
  for (const actor of ["SECOND", "OPS", "DESIGNER", "OTHER_BDM"]) {
    for (const table of ["leads", "lead_submissions", "lead_reviews"]) {
      const r = await clients[actor]
        .from(table)
        .select("id")
        .eq(table === "leads" ? "id" : "lead_id", lead);
      expect(r.error).toBeNull();
      expect(r.data).toHaveLength(0);
    }
    expect(
      (
        await clients[actor]
          .from("attachment_versions")
          .select("id")
          .eq("id", attachment.id)
      ).data,
    ).toHaveLength(0);
    expect(
      (
        await clients[actor].storage
          .from("one-odc-attachments")
          .download(attachment.object_path)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await clients[actor].storage
          .from("one-odc-attachments")
          .createSignedUrl(attachment.object_path, 30)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await clients[actor].rpc("record_attachment_download", {
          p_version: attachment.id,
        })
      ).error?.message,
    ).toContain("ACCESS_DENIED");
  }
  expect(
    (
      await clients.LEAD.storage
        .from("one-odc-attachments")
        .createSignedUrl(attachment.object_path, 30)
    ).error,
  ).toBeNull();
  expect(
    (
      await clients.SECOND.rpc("review_lead", {
        p_id: lead,
        p_expected_version: 2,
        p_decision: "Rejected",
        p_remarks: "Unauthorized",
      })
    ).error?.message,
  ).toContain("ACCESS_DENIED");
});
it("staging: clarification, resubmission and concurrent acceptance preserve one project and the selected Lead Designer", async () => {
  await rpc("LEAD", "review_lead", {
    p_id: lead,
    p_expected_version: 2,
    p_decision: "Returned for Clarification",
    p_remarks: "Confirm brief",
  });
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 3,
    p_payload: payload(),
    p_submit: true,
  });
  const args = {
    p_id: lead,
    p_expected_version: 4,
    p_decision: "Accepted",
    p_primary: ids.DESIGNER,
    p_ops: [ids.OPS],
    p_lead_designer: ids.LEAD,
  };
  const result = await Promise.all([
    clients.LEAD.rpc("review_lead", args),
    clients.LEAD.rpc("review_lead", args),
  ]);
  expect(result.every((r) => !r.error)).toBe(true);
  expect(result[0].data).toBe(result[1].data);
  project = result[0].data;
  expect(
    (
      await clients.ADMIN.from("project_origins")
        .select("project_id")
        .eq("lead_id", lead)
    ).data,
  ).toHaveLength(1);
  expect(
    (
      await clients.ADMIN.from("projects")
        .select("lead_designer_id")
        .eq("id", project)
        .single()
    ).data?.lead_designer_id,
  ).toBe(ids.LEAD);
});
it("staging: atomic transfer changes oversight, retains history and denies stale concurrent transfer", async () => {
  const args = {
    p_project: project,
    p_expected_designer: ids.LEAD,
    p_designer: ids.SECOND,
    p_reason: "Multi-Lead Designer staging transfer",
  };
  expect(
    (await clients.BDM.rpc("assign_project_lead_designer", args)).error
      ?.message,
  ).toContain("ACCESS_DENIED");
  const result = await Promise.all([
    clients.ADMIN.rpc("assign_project_lead_designer", args),
    clients.ADMIN.rpc("assign_project_lead_designer", args),
  ]);
  expect(result.filter((r) => !r.error)).toHaveLength(1);
  expect(result.find((r) => r.error)?.error?.message).toContain(
    "STALE_VERSION",
  );
  expect(
    (await clients.LEAD.from("projects").select("id").eq("id", project)).data,
  ).toHaveLength(0);
  expect(
    (await clients.LEAD.from("leads").select("id").eq("id", lead)).data,
  ).toHaveLength(0);
  expect(
    (await clients.SECOND.from("projects").select("id").eq("id", project)).data,
  ).toHaveLength(1);
  expect(
    (await clients.SECOND.from("leads").select("id").eq("id", lead)).data,
  ).toHaveLength(1);
  expect(
    (
      await clients.ADMIN.from("project_memberships")
        .select("user_id")
        .eq("project_id", project)
        .eq("membership_role", "lead_designer")
    ).data,
  ).toEqual([{ user_id: ids.SECOND }]);
  expect(
    (
      await clients.ADMIN.from("audit_events")
        .select("id")
        .eq("entity_id", project)
        .eq("action", "project.lead_designer_changed")
    ).data,
  ).toHaveLength(1);
  expect(
    (await clients.OPS.from("projects").select("id").eq("id", project)).data,
  ).toHaveLength(1);
  expect(
    (
      await clients.OPS.storage
        .from("one-odc-attachments")
        .createSignedUrl(attachment.object_path, 30)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await clients.LEAD.storage
        .from("one-odc-attachments")
        .createSignedUrl(attachment.object_path, 30)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await clients.SECOND.storage
        .from("one-odc-attachments")
        .createSignedUrl(attachment.object_path, 30)
    ).error,
  ).toBeNull();
  for (const actor of ["BDM", "DESIGNER"])
    expect(
      (await clients[actor].from("projects").select("id").eq("id", project))
        .data,
    ).toHaveLength(1);
  expect(
    (await clients.OPS.from("leads").select("id").eq("id", lead)).data,
  ).toHaveLength(0);
});
