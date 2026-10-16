import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
process.loadEnvFile(".env.verification");
if (
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
  "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
const clients = {},
  ids = {},
  checks = [];
const actors = [
  "ADMIN",
  "LEAD",
  "DESIGNER",
  "BDM",
  "OPS",
  "OTHER_BDM",
  "UNASSIGNED",
];
for (const actor of actors) {
  const c = createClient(
    process.env.ONE_ODC_TEST_URL,
    process.env.ONE_ODC_TEST_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const login = await c.auth.signInWithPassword({
    email: process.env[`ONE_ODC_TEST_${actor}_EMAIL`],
    password: process.env[`ONE_ODC_TEST_${actor}_PASSWORD`],
  });
  if (login.error) throw Error("Staging account sign-in failed");
  clients[actor] = c;
  ids[actor] = login.data.user.id;
}
const rpc = async (actor, name, args) => {
  const r = await clients[actor].rpc(name, args);
  if (r.error) throw Error(`Staging ${name}: ${r.error.code}`);
  return r.data;
};
const project = (prefix) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        "scripts/staging-project-fixture.mjs",
        "create",
        prefix,
        ids.DESIGNER,
        ids.OPS,
      ],
      { encoding: "utf8", timeout: 60000 },
    ),
  );
const source = project("Microfeatures source"),
  target = project("Microfeatures target");
for (const name of ["Kitchen", "Dining"])
  await rpc("LEAD", "save_space", {
    p_id: randomUUID(),
    p_project: source.id,
    p_expected_version: 0,
    p_name: name,
    p_deadline: "2026-12-01",
    p_primary: ids.DESIGNER,
    p_support: [],
    p_reason: "Synthetic microfeature scope",
  });
const template = randomUUID(),
  operation = randomUUID();
await rpc("LEAD", "save_space_template", {
  p_id: template,
  p_source: source.id,
  p_name: "Microfeatures residential structure",
});
const applied = await Promise.all(
  Array.from({ length: 3 }, () =>
    rpc("LEAD", "apply_space_template", {
      p_operation: operation,
      p_template: template,
      p_project: target.id,
      p_primary: ids.DESIGNER,
      p_confirm: true,
    }),
  ),
);
assert(applied.every((x) => x === 2));
const spaces = await clients.DESIGNER.from("spaces")
  .select("id,name,status,deadline")
  .eq("project_id", target.id);
assert.equal(spaces.data.length, 2);
assert(
  spaces.data.every((s) => s.status === "Not Started" && s.deadline === null),
);
checks.push(
  "Real concurrent template application exactly once; fresh Space IDs/status/deadlines",
);
await rpc("DESIGNER", "remember_project", {
  p_project: target.id,
  p_favorite: true,
});
await rpc("DESIGNER", "remember_project", {
  p_project: target.id,
  p_favorite: null,
});
const favorites = await clients.DESIGNER.from("project_shortcuts")
  .select("project_id,favorite")
  .eq("project_id", target.id);
assert.equal(favorites.data.length, 1);
assert(favorites.data[0].favorite);
for (const actor of ["OTHER_BDM", "UNASSIGNED"]) {
  assert.equal(
    (
      await clients[actor]
        .from("project_shortcuts")
        .select("*")
        .eq("project_id", target.id)
    ).data.length,
    0,
  );
  assert(
    (
      await clients[actor].rpc("remember_project", {
        p_project: target.id,
        p_favorite: true,
      })
    ).error,
  );
  assert(
    (
      await clients[actor].rpc("apply_space_template", {
        p_operation: randomUUID(),
        p_template: template,
        p_project: target.id,
        p_primary: ids.DESIGNER,
        p_confirm: true,
      })
    ).error,
  );
}
checks.push("Personal favorites and cross-project template/shortcut RLS");
const comment = randomUUID(),
  args = {
    p_id: comment,
    p_project: target.id,
    p_space: spaces.data[0].id,
    p_version: 0,
    p_body: "Synthetic <script>plain text</script> discussion",
    p_mentions: [ids.LEAD],
    p_reason: "",
  };
assert(
  (
    await clients.DESIGNER.rpc("save_project_comment", {
      ...args,
      p_mentions: [ids.UNASSIGNED],
    })
  ).error,
);
await rpc("DESIGNER", "save_project_comment", args);
assert((await clients.DESIGNER.rpc("save_project_comment", args)).error);
await rpc("DESIGNER", "save_project_comment", {
  ...args,
  p_version: 1,
  p_body: "Corrected synthetic discussion",
  p_reason: "Correct wording",
});
for (const actor of ["OPS", "OTHER_BDM", "UNASSIGNED"]) {
  assert.equal(
    (
      await clients[actor]
        .from("project_comments")
        .select("*")
        .eq("project_id", target.id)
    ).data.length,
    0,
  );
  assert(
    (
      await clients[actor].rpc("save_project_comment", {
        ...args,
        p_id: randomUUID(),
      })
    ).error,
  );
}
assert.equal(
  (
    await clients.BDM.from("project_comments")
      .select("body,version")
      .eq("id", comment)
  ).data[0].version,
  2,
);
const notifications = await clients.LEAD.from("notifications")
  .select("id")
  .eq("project_id", target.id)
  .eq("message", "You were mentioned in a project discussion.");
assert.equal(notifications.data.length, 1);
const audit = await clients.ADMIN.from("audit_events")
  .select("action")
  .eq("project_id", target.id)
  .in("action", ["comment.created", "comment.corrected", "template.applied"]);
assert.equal(audit.data.length, 3);
checks.push(
  "Comments, corrections, mentions, deduplicated notifications and admin audits; Ops preview denied",
);
// Real direct Storage uploads: no serverless file bodies or external preview services.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64",
);
const stream =
  "BT /F1 16 Tf 30 100 Td (One ODC synthetic preview fixture) Tj ET";
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 180] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
];
let pdf = "%PDF-1.4\n",
  offsets = [0];
for (const [i, o] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((n) => String(n).padStart(10, "0") + " 00000 n ")
  .join(
    "\n",
  )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const files = [];
for (const [name, mime, bytes] of [
  ["micro-preview.png", "image/png", png],
  ["micro-preview.pdf", "application/pdf", Buffer.from(pdf)],
]) {
  const v = await rpc("LEAD", "reserve_attachment", {
    p_attachment: null,
    p_lead: null,
    p_project: target.id,
    p_class: "general",
    p_name: name,
    p_mime: mime,
    p_size: bytes.length,
  });
  const upload = await clients.LEAD.storage
    .from(v.bucket)
    .upload(v.object_path, bytes, { contentType: mime, upsert: false });
  assert(!upload.error);
  await rpc("LEAD", "complete_attachment", { p_version: v.id });
  await rpc("DESIGNER", "record_attachment_download", { p_version: v.id });
  const signed = await clients.DESIGNER.storage
    .from(v.bucket)
    .createSignedUrl(v.object_path, 60);
  assert(!signed.error);
  const fetchFile = await fetch(signed.data.signedUrl);
  assert(fetchFile.ok);
  assert(fetchFile.headers.get("content-type").includes(mime));
  assert(
    !/attachment/i.test(fetchFile.headers.get("content-disposition") ?? ""),
  );
  assert.deepEqual(Buffer.from(await fetchFile.arrayBuffer()), bytes);
  for (const actor of ["OPS", "OTHER_BDM", "UNASSIGNED"]) {
    assert(
      (
        await clients[actor].rpc("record_attachment_download", {
          p_version: v.id,
        })
      ).error,
    );
    assert(
      (
        await clients[actor].storage
          .from(v.bucket)
          .createSignedUrl(v.object_path, 60)
      ).error,
    );
  }
  files.push({ id: v.id, name, mime });
}
checks.push(
  "Private real PNG/PDF upload, inline signed access bytes/MIME; unauthorized direct signing denied",
);
writeFileSync(
  "artifacts/verification/microfeatures/fixture.json",
  JSON.stringify(
    { source, target, template, operation, space: spaces.data[0].id, files },
    null,
    2,
  ),
);
writeFileSync(
  "artifacts/verification/microfeatures/staging.json",
  JSON.stringify(
    { passed: checks.length, actors: actors.length, checks },
    null,
    2,
  ),
);
console.log(
  `${checks.length} focused staging checks passed across ${actors.length} real accounts.`,
);
