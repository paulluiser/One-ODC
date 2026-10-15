import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Upload } from "tus-js-client";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resumableEndpoint } from "../../src/lib/storage/provider";

const STAGING = "jlvlwkryasoducuucvxk";
const roles = {
  ADMIN: "system_administrator",
  BDM: "bdm",
  LEAD: "lead_designer",
  DESIGNER: "designer",
  OPS: "operations_admin",
  OTHER_BDM: "bdm",
  UNASSIGNED: "designer",
} as const;
type Actor = keyof typeof roles;
const clients = {} as Record<Actor, SupabaseClient>;
const identities = {} as Record<Actor, string>;
const run = randomUUID();
const result: {
  run: string;
  project: string;
  passed: string[];
  records: Record<string, string>;
} = { run, project: STAGING, passed: [], records: {} };
let url: string, key: string;
const payload = {
  project_name: `One ODC STAGING verification ${run}`,
  address: `Synthetic staging test address ${run}`,
  brand: "Stosa",
  cabinetry_count: 2,
  notes: `Verification fixture ${run}; no real client data. Retain audit/history.`,
  date_needed: null,
  attachment_metadata: [],
};
async function rpc(actor: Actor, name: string, args: Record<string, unknown>) {
  const r = await clients[actor].rpc(name, args);
  if (r.error) throw new Error(`${name}: ${r.error.code} ${r.error.message}`);
  return r.data;
}
async function save(id: string, version: number, submit: boolean, suffix = "") {
  return rpc("BDM", "save_lead", {
    p_id: id,
    p_expected_version: version,
    p_payload: {
      ...payload,
      project_name: payload.project_name + suffix,
      address: payload.address + suffix,
    },
    p_submit: submit,
    p_duplicate_reason: "",
  });
}
async function review(id: string, version: number, decision: string) {
  return rpc("LEAD", "review_lead", {
    p_id: id,
    p_expected_version: version,
    p_decision: decision,
    p_remarks: decision === "Accepted" ? "" : "Staging review reason",
    p_primary: identities.DESIGNER,
    p_support: [],
    p_ops: [identities.OPS],
    p_lead_designer: null,
  });
}
beforeAll(async () => {
  process.loadEnvFile(".env.verification");
  url = process.env.ONE_ODC_TEST_URL ?? "";
  key = process.env.ONE_ODC_TEST_PUBLISHABLE_KEY ?? "";
  if (
    process.env.ONE_ODC_TEST_PROJECT_ID !== STAGING ||
    new URL(url).hostname !== `${STAGING}.supabase.co`
  )
    throw new Error("Refusing live writes outside authorized staging.");
  for (const actor of Object.keys(roles) as Actor[]) {
    const email = process.env[`ONE_ODC_TEST_${actor}_EMAIL`];
    const password = process.env[`ONE_ODC_TEST_${actor}_PASSWORD`];
    if (!email || !password)
      throw new Error(
        `Missing local credentials for ${actor}; no password printed.`,
      );
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.user)
      throw new Error(
        `Real staging sign-in failed for ${actor}; check local credentials.`,
      );
    const user = await client.auth.getUser();
    expect(user.error).toBeNull();
    const profile = await client
      .from("profiles")
      .select("role,active")
      .eq("id", user.data.user!.id)
      .single();
    expect(profile.error).toBeNull();
    expect(profile.data).toEqual({ role: roles[actor], active: true });
    clients[actor] = client;
    identities[actor] = user.data.user!.id;
  }
  result.passed.push(
    "Real password sign-in and active role resolution across seven dedicated staging accounts",
  );
}, 30000);
afterAll(async () => {
  for (const client of Object.values(clients))
    await client.auth.signOut({ scope: "local" });
  mkdirSync("artifacts/verification", { recursive: true });
  writeFileSync(
    "artifacts/verification/live-phase1.json",
    JSON.stringify(result, null, 2) + "\n",
  );
});
describe("authorized live One ODC staging", () => {
  it("keeps public signup disabled", async () => {
    const r = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
    });
    expect(r.ok).toBe(true);
    expect((await r.json()).disable_signup).toBe(true);
    result.passed.push("Public signup disabled");
  });
  it("persists BDM drafts/submissions and rejects cross-role and other-BDM access", async () => {
    const id = randomUUID();
    result.records.acceptLead = id;
    await save(id, 0, false);
    const own = await clients.BDM.from("leads")
      .select("id,status,bdm_id")
      .eq("id", id)
      .single();
    expect(own.data).toMatchObject({
      id,
      status: "Draft",
      bdm_id: identities.BDM,
    });
    for (const actor of ["OTHER_BDM", "DESIGNER", "OPS"] as Actor[]) {
      const r = await clients[actor].from("leads").select("id").eq("id", id);
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
    const denied = await clients.OPS.rpc("save_lead", {
      p_id: id,
      p_expected_version: 1,
      p_payload: payload,
      p_submit: true,
      p_duplicate_reason: "",
    });
    expect(denied.error).not.toBeNull();
    await save(id, 1, true);
    const snapshot = await clients.BDM.from("lead_submissions")
      .select("number,snapshot")
      .eq("lead_id", id);
    expect(snapshot.data).toHaveLength(1);
    expect(snapshot.data![0].snapshot.project_name).toBe(payload.project_name);
    result.passed.push(
      "BDM persistence, immutable submission snapshot, other-BDM/Designer/Ops lead denial",
    );
  });
  it("returns, resubmits and rejects with persisted remarks/history", async () => {
    const id = randomUUID();
    result.records.returnLead = id;
    await save(id, 0, true, " return");
    await review(id, 1, "Returned for Clarification");
    await save(id, 2, true, " return revised");
    await review(id, 3, "Rejected");
    const r = await clients.BDM.from("lead_reviews")
      .select("decision,remarks")
      .eq("lead_id", id)
      .order("reviewed_at");
    expect(r.data?.map((x) => x.decision)).toEqual([
      "Returned for Clarification",
      "Rejected",
    ]);
    expect(r.data?.every((x) => x.remarks === "Staging review reason")).toBe(
      true,
    );
    expect(
      (
        await clients.BDM.from("lead_submissions")
          .select("id")
          .eq("lead_id", id)
      ).data,
    ).toHaveLength(2);
    result.passed.push(
      "Return/resubmit/reject with PostgreSQL reviews and snapshots",
    );
  });
  it("concurrent/repeated acceptance creates exactly one Project with assignments and BDM monitoring", async () => {
    const id = result.records.acceptLead;
    const converted = await Promise.all(
      Array.from({ length: 4 }, () => review(id, 2, "Accepted")),
    );
    expect(new Set(converted).size).toBe(1);
    const project = converted[0] as string;
    result.records.project = project;
    expect(await review(id, 2, "Accepted")).toBe(project);
    const origin = await clients.ADMIN.from("project_origins")
      .select("project_id")
      .eq("lead_id", id);
    expect(origin.data).toHaveLength(1);
    for (const actor of ["BDM", "LEAD", "DESIGNER"] as Actor[]) {
      const r = await clients[actor]
        .from("projects")
        .select("id")
        .eq("id", project);
      expect(r.error).toBeNull();
      expect(r.data).toHaveLength(1);
    }
    for (const actor of ["OTHER_BDM", "UNASSIGNED"] as Actor[])
      expect(
        (await clients[actor].from("projects").select("id").eq("id", project))
          .data,
      ).toEqual([]);
    expect(
      (await clients.OPS.from("projects").select("id").eq("id", project)).data,
    ).toHaveLength(1);
    expect(
      (
        await clients.OPS.from("project_origins")
          .select("lead_id")
          .eq("project_id", project)
      ).data,
    ).toEqual([]);
    expect(
      (await clients.OPS.rpc("project_team", { p_project: project })).error,
    ).not.toBeNull();
    await rpc("LEAD", "assign_project_personnel", {
      p_project: project,
      p_primary: identities.DESIGNER,
      p_support: [identities.LEAD],
      p_ops: [identities.OPS],
      p_reason: "Staging support assignment verification",
    });
    const history = await clients.LEAD.from("project_assignment_events")
      .select("id")
      .eq("project_id", project);
    expect(history.data).toHaveLength(2);
    result.passed.push(
      "Concurrent/repeated exactly-once acceptance, real assignments/history, BDM monitoring and Ops restricted detail denial",
    );
  });
  it("verifies a small authenticated upload, authorized signed download and archive/restore", async () => {
    const id = randomUUID();
    result.records.storageLead = id;
    await save(id, 0, false, " storage");
    const bytes = Buffer.from(`One ODC staging file ${run}`);
    const v = await rpc("BDM", "reserve_attachment", {
      p_attachment: null,
      p_lead: id,
      p_project: null,
      p_class: "general",
      p_name: "staging.txt",
      p_mime: "text/plain",
      p_size: bytes.length,
    });
    result.records.attachment = v.attachment_id;
    result.records.version = v.id;
    const upload = await clients.BDM.storage
      .from(v.bucket)
      .upload(v.object_path, bytes, {
        contentType: "text/plain",
        upsert: false,
      });
    expect(upload.error).toBeNull();
    await rpc("BDM", "complete_attachment", { p_version: v.id });
    for (const actor of ["OTHER_BDM", "OPS", "UNASSIGNED"] as Actor[]) {
      expect(
        (await clients[actor].storage.from(v.bucket).download(v.object_path))
          .error,
      ).not.toBeNull();
      expect(
        (
          await clients[actor].storage
            .from(v.bucket)
            .createSignedUrl(v.object_path, 60)
        ).error,
      ).not.toBeNull();
    }
    await rpc("BDM", "record_attachment_download", { p_version: v.id });
    const signed = await clients.BDM.storage
      .from(v.bucket)
      .createSignedUrl(v.object_path, 60, { download: true });
    expect(signed.error).toBeNull();
    const download = await fetch(signed.data!.signedUrl);
    expect(download.ok).toBe(true);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
    await rpc("BDM", "archive_attachment", {
      p_id: v.attachment_id,
      p_archive: true,
      p_reason: "Staging archive check",
    });
    expect(
      (
        await clients.BDM.storage
          .from(v.bucket)
          .createSignedUrl(v.object_path, 60)
      ).error,
    ).not.toBeNull();
    await rpc("BDM", "archive_attachment", {
      p_id: v.attachment_id,
      p_archive: false,
      p_reason: "Staging restoration check",
    });
    const restored = await clients.BDM.storage
      .from(v.bucket)
      .download(v.object_path);
    expect(restored.error).toBeNull();
    expect(Buffer.from(await restored.data!.arrayBuffer())).toEqual(bytes);
    result.passed.push(
      "Small real Storage upload, actual-size completion, signed download bytes, existing-object unauthorized denial, archive and restored bytes",
    );
  });
  it("uploads a larger file via authenticated direct TUS and verifies the bytes", async () => {
    const bytes = Buffer.alloc(13 * 1024 * 1024, 0x42);
    const id = result.records.storageLead;
    const v = await rpc("BDM", "reserve_attachment", {
      p_attachment: null,
      p_lead: id,
      p_project: null,
      p_class: "general",
      p_name: "staging-resumable.bin",
      p_mime: "application/octet-stream",
      p_size: bytes.length,
    });
    let progress = 0;
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(bytes, {
        endpoint: resumableEndpoint(url),
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 3000, 5000],
        uploadDataDuringCreation: true,
        headers: { apikey: key },
        metadata: {
          bucketName: v.bucket,
          objectName: v.object_path,
          contentType: "application/octet-stream",
          cacheControl: "0",
        },
        onBeforeRequest: async (request) => {
          const { data } = await clients.BDM.auth.getSession();
          request.setHeader(
            "Authorization",
            `Bearer ${data.session!.access_token}`,
          );
        },
        onProgress: (sent) => {
          progress = sent;
        },
        onError: () =>
          reject(
            new Error(
              "Authenticated TUS upload failed; no credentials printed.",
            ),
          ),
        onSuccess: () => resolve(),
      });
      upload.start();
    });
    expect(progress).toBe(bytes.length);
    await rpc("BDM", "complete_attachment", { p_version: v.id });
    const downloaded = await clients.BDM.storage
      .from(v.bucket)
      .download(v.object_path);
    expect(downloaded.error).toBeNull();
    expect(
      createHash("sha256")
        .update(Buffer.from(await downloaded.data!.arrayBuffer()))
        .digest("hex"),
    ).toBe(createHash("sha256").update(bytes).digest("hex"));
    await rpc("BDM", "archive_attachment", {
      p_id: v.attachment_id,
      p_archive: true,
      p_reason: "Retain staging fixture archived after verification",
    });
    result.passed.push(
      "13 MiB authenticated direct TUS upload and SHA-256 download verification (no interruption claim)",
    );
  });
  it("deactivation and role changes deny an existing JWT without refreshing it", async () => {
    const id = randomUUID();
    await rpc("OTHER_BDM", "save_lead", {
      p_id: id,
      p_expected_version: 0,
      p_payload: {
        ...payload,
        project_name: payload.project_name + " other BDM access",
        address: "Other BDM staging address",
      },
      p_submit: false,
      p_duplicate_reason: "",
    });
    expect(
      (await clients.OTHER_BDM.from("leads").select("id").eq("id", id)).data,
    ).toHaveLength(1);
    async function access(role: string, active: boolean) {
      await rpc("ADMIN", "update_user_access", {
        p_user: identities.OTHER_BDM,
        p_role: role,
        p_active: active,
        p_name: "Staging OTHER_BDM",
        p_reason: "Dedicated staging authorization verification",
      });
    }
    try {
      await access("bdm", false);
      expect(
        (await clients.OTHER_BDM.from("leads").select("id").eq("id", id)).data,
      ).toEqual([]);
      expect(
        (
          await clients.OTHER_BDM.rpc("save_lead", {
            p_id: id,
            p_expected_version: 1,
            p_payload: payload,
            p_submit: false,
            p_duplicate_reason: "",
          })
        ).error,
      ).not.toBeNull();
      await access("designer", true);
      expect(
        (await clients.OTHER_BDM.from("leads").select("id").eq("id", id)).data,
      ).toEqual([]);
    } finally {
      await access("bdm", true);
    }
    result.passed.push(
      "Existing JWT loses business access immediately on deactivation/role change; dedicated fixture restored",
    );
  });
  it("submission blocks pending uploads and preserves verified attachment version IDs", async () => {
    const id = result.records.storageLead;
    const pending = await rpc("BDM", "reserve_attachment", {
      p_attachment: null,
      p_lead: id,
      p_project: null,
      p_class: "general",
      p_name: "not-uploaded.txt",
      p_mime: "text/plain",
      p_size: 1,
    });
    const args = {
      p_id: id,
      p_expected_version: 1,
      p_payload: {
        ...payload,
        project_name: payload.project_name + " storage",
        address: payload.address + " storage",
      },
      p_submit: true,
      p_duplicate_reason: "",
    };
    const denied = await clients.BDM.rpc("save_lead", args);
    expect(denied.error?.message).toContain("UPLOADS_PENDING");
    await rpc("BDM", "archive_attachment", {
      p_id: pending.attachment_id,
      p_archive: true,
      p_reason: "Unfinished verification reservation",
    });
    await rpc("BDM", "save_lead", args);
    const snapshot = await clients.BDM.from("lead_submissions")
      .select("snapshot")
      .eq("lead_id", id)
      .single();
    expect(snapshot.error).toBeNull();
    expect(snapshot.data!.snapshot.uploaded_attachments).toHaveLength(1);
    expect(snapshot.data!.snapshot.uploaded_attachments[0].version_id).toBe(
      result.records.version,
    );
    result.passed.push(
      "Pending-upload submission guard and immutable verified attachment version snapshot",
    );
  });
});
