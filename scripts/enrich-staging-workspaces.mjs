// Staging-only, resumable enrichment of the named UAT walkthrough projects.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
process.loadEnvFile(".env.verification");
const env = process.env,
  stage = "jlvlwkryasoducuucvxk";
if (
  env.ONE_ODC_TEST_PROJECT_ID !== stage ||
  new URL(env.ONE_ODC_TEST_URL).hostname !== `${stage}.supabase.co`
)
  throw Error("Staging only");
const dir = "artifacts/verification/workspace-samples";
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const path = `${dir}/manifest.json`;
const state = fs.existsSync(path)
  ? JSON.parse(fs.readFileSync(path, "utf8"))
  : { ids: {}, steps: {}, projects: [], createdAt: new Date().toISOString() };
const save = () =>
  fs.writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 });
const id = (k) => {
  if (!state.ids[k]) {
    state.ids[k] = randomUUID();
    save();
  }
  return state.ids[k];
};
const c = {},
  u = {};
const reason =
  "Fictional UAT workspace enrichment authorized by the workspace owner";
async function rpc(actor, name, args, key) {
  if (key && Object.hasOwn(state.steps, key)) return state.steps[key];
  const r = await c[actor].rpc(name, args);
  if (r.error) throw Error(`${key || name}: ${r.error.message}`);
  if (key) {
    state.steps[key] = r.data;
    save();
  }
  return r.data;
}
async function read(query) {
  const r = await query;
  if (r.error) throw Error(r.error.message);
  return r.data;
}
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const day = (n) =>
  new Date(Date.parse(today + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
const names = [
  "The Acacia Residence",
  "Harbor View Condominium",
  "The Courtyard Townhouse",
  "Studio North Office",
  "Casa Solana",
  "Sierra Heights Residence",
  "The Linden Apartment",
  "Garden Pavilion",
  "Cypress House Interiors",
  "Maple Grove Residence",
];
try {
  for (const actor of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"]) {
    const client = createClient(
      env.ONE_ODC_TEST_URL,
      env.ONE_ODC_TEST_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const login = await client.auth.signInWithPassword({
      email: env[`ONE_ODC_TEST_${actor}_EMAIL`],
      password: env[`ONE_ODC_TEST_${actor}_PASSWORD`],
    });
    if (login.error) throw Error(`Staging sign-in failed: ${actor}`);
    c[actor] = client;
    u[actor] = login.data.user.id;
  }
  const projects = await read(
    c.ADMIN.from("projects")
      .select(
        "id,name,commercial_status,is_cancelled,is_operationally_completed,awaiting_handoff",
      )
      .in("name", names),
  );
  if (projects.length !== names.length)
    throw Error("UAT allowlist mismatch; no destructive fallback permitted");
  // Save a restricted pre-enrichment snapshot through the existing RLS-protected admin session.
  if (!fs.existsSync(`${dir}/before.json`)) {
    const tables = [
      "projects",
      "spaces",
      "quotation_versions",
      "project_financial_values",
      "project_payments",
      "project_logistics",
      "project_activities",
      "project_comments",
      "attachments",
    ];
    const before = { at: new Date().toISOString(), projects };
    for (const table of tables.slice(1))
      before[table] = await read(
        c.ADMIN.from(table)
          .select("*")
          .in(
            "project_id",
            projects.map((p) => p.id),
          ),
      );
    fs.writeFileSync(`${dir}/before.json`, JSON.stringify(before), {
      mode: 0o600,
    });
  }
  const suppliers = await read(
    c.OPS.from("suppliers").select("id,name").eq("active", true),
  );
  const supplier = suppliers.find((s) => s.name === "Forma Cabinetry Studio");
  if (!supplier) throw Error("Missing existing UAT supplier");
  for (const p of projects) {
    if (p.commercial_status === "Lost" || p.is_cancelled)
      throw Error("Refusing to alter a locked project");
    const key = p.id;
    let spaces = await read(
      c.LEAD.from("spaces")
        .select("id,name,status,version,cancelled_at")
        .eq("project_id", p.id)
        .order("created_at"),
    );
    const fill = ["Cypress House Interiors", "Maple Grove Residence"].includes(
      p.name,
    );
    if (fill) {
      const labels = p.name.startsWith("Cypress")
        ? ["Kitchen & island", "Master wardrobe", "Laundry cabinetry"]
        : ["Kitchen", "Entry storage", "Study cabinetry"];
      for (const [n, name] of labels.entries())
        if (!spaces.some((s) => s.name === name))
          await rpc(
            "LEAD",
            "save_space",
            {
              p_id: id(`${key}-space-${n}`),
              p_project: p.id,
              p_expected_version: 0,
              p_name: name,
              p_deadline: day(7 + n * 3),
              p_primary: u.DESIGNER,
              p_support: n === 0 ? [u.LEAD] : [],
              p_reason: reason,
            },
            `${key}-space-${n}`,
          );
      spaces = await read(
        c.LEAD.from("spaces")
          .select("id,name,status,version,cancelled_at")
          .eq("project_id", p.id)
          .order("created_at"),
      );
      for (const s of spaces) {
        let v = s.version;
        const statuses = p.name.startsWith("Cypress")
          ? ["In Progress", "Submitted", "Completed"]
          : ["In Progress"];
        for (const status of statuses) {
          const order = [
            "Not Started",
            "In Progress",
            "Submitted",
            "Completed",
          ];
          if (order.indexOf(s.status) >= order.indexOf(status)) continue;
          await rpc(
            status === "Completed" ? "LEAD" : "DESIGNER",
            "change_space_status",
            {
              p_id: s.id,
              p_expected_version: v,
              p_status: status,
              p_reason:
                status === "Completed"
                  ? "Fictional UAT design package approved for supplier coordination"
                  : "Developing the approved UAT cabinetry brief",
              p_approval:
                status === "Completed"
                  ? "UAT sample design sign-off; no real client approval"
                  : "",
            },
            `${key}-${s.id}-${status}`,
          );
          v++;
        }
      }
      const monitoring = await read(
        c.LEAD.from("project_monitoring")
          .select("version,deadline")
          .eq("project_id", p.id)
          .single(),
      );
      if (!monitoring.deadline)
        await rpc(
          "LEAD",
          "revise_project_deadline",
          {
            p_project: p.id,
            p_version: monitoring.version,
            p_deadline: day(p.name.startsWith("Cypress") ? 21 : 28),
            p_timezone: "Asia/Manila",
            p_reason: reason,
          },
          `${key}-deadline`,
        );
      const quotes = await read(
        c.LEAD.from("quotation_versions")
          .select("id,state,edit_version")
          .eq("project_id", p.id),
      );
      if (!quotes.length || state.steps[`${key}-draft`]) {
        const draft = await rpc(
          "DESIGNER",
          "create_quotation_draft",
          { p_project: p.id },
          `${key}-draft`,
        );
        const prices = p.name.startsWith("Cypress")
          ? ["390000.25", "285000.00", "175000.00"]
          : ["295000.50", "215000.00", "115000.00"];
        for (const [n, s] of spaces.entries())
          await rpc(
            "DESIGNER",
            "save_quotation_space",
            {
              p_draft: draft,
              p_space: s.id,
              p_expected_version: n + 1,
              p_items: [
                {
                  id: id(`${key}-item-${n}`),
                  description: `${s.name}: custom cabinetry, soft-close hardware, finishing and installation (fictional UAT scope)`,
                  quantity: "1",
                  unit_price: prices[n],
                },
              ],
              p_reason: reason,
            },
            `${key}-quote-${n}`,
          );
        await rpc(
          "DESIGNER",
          "submit_quotation",
          {
            p_version: draft,
            p_expected_version: spaces.length + 1,
            p_remarks:
              "Fictional UAT scope reconciled to the existing recorded Sale.",
          },
          `${key}-submit`,
        );
        await rpc(
          "LEAD",
          "review_quotation",
          {
            p_version: draft,
            p_expected_version: spaces.length + 2,
            p_decision: "Approved",
            p_remarks:
              "UAT-only itemized scope reviewed; no real supplier commitment.",
          },
          `${key}-approve`,
        );
      }
      const values = await read(
        c.LEAD.from("project_financial_values")
          .select("kind,amount,version")
          .eq("project_id", p.id),
      );
      if (!values.some((f) => f.kind === "Raw"))
        await rpc(
          "LEAD",
          "set_financial_value",
          {
            p_project: p.id,
            p_kind: "Raw",
            p_amount: p.name.startsWith("Cypress") ? "527000.16" : "387500.31",
            p_expected_version: 0,
            p_reason: reason,
          },
          `${key}-raw`,
        );
      const handoff = await rpc("OPS", "get_commercial_handoff", {
        p_project: p.id,
      });
      if (handoff.current?.status === "Acknowledged") {
        const records = await read(
          c.OPS.from("project_logistics").select("id").eq("project_id", p.id),
        );
        if (!records.length || state.steps[`${key}-logistics-0`])
          for (const [v, status] of [
            "RFP",
            "Supplier Adjustments",
            "For Manufacturing",
          ].entries())
            await rpc(
              "OPS",
              "save_logistics",
              {
                p_id: id(`${key}-logistics`),
                p_project: p.id,
                p_version: v,
                p_supplier: supplier.id,
                p_data: {
                  status,
                  brand: "Stosa",
                  reference: `UAT-CYPRESS-${today.replaceAll("-", "")}`,
                  remarks:
                    "Fictional production package: confirm oak finish sample and appliance cut-outs before dispatch.",
                },
                p_reason: reason,
                p_override: false,
              },
              `${key}-logistics-${v}`,
            );
        for (const s of spaces)
          await rpc(
            "DESIGNER",
            "save_installation",
            {
              p_space: s.id,
              p_project: p.id,
              p_version: 0,
              p_status: "Scheduled",
              p_date: day(14),
              p_reason:
                "UAT sample installation slot; site access and delivery must be reconfirmed",
              p_override: false,
            },
            `${key}-installation-${s.id}`,
          );
        const payments = await read(
          c.LEAD.from("project_payments").select("id").eq("project_id", p.id),
        );
        if (!payments.length)
          for (const [kind, amount] of [
            ["client", "255000.08"],
            ["supplier", "158100.05"],
          ])
            await rpc(
              "OPS",
              "mutate_payment",
              {
                p_id: id(`${key}-payment-${kind}`),
                p_project: p.id,
                p_kind: kind,
                p_expected_version: 0,
                p_intent: "save",
                p_data: {
                  payment_date: today,
                  amount,
                  method: "Bank transfer",
                  reference: `UAT-CYPRESS-${kind.toUpperCase()}`,
                  remarks: "Fictional UAT ledger entry. No actual transfer.",
                },
                p_reason: reason,
              },
              `${key}-payment-${kind}`,
            );
      }
    }
    const notes = await rpc("LEAD", "project_resources", { p_project: p.id });
    if (!state.steps[`${key}-resources`])
      await rpc(
        "LEAD",
        "update_project_resources",
        {
          p_project: p.id,
          p_version: notes.version,
          p_notes: `${notes.notes || ""}\n\nUAT workspace brief - ${p.name}\nFictional project data for interface review; no real client or payment.\nDesign: warm oak and matte neutral cabinetry, concealed lighting, soft-close hardware.\nSite coordination: verify finished floor levels, wall plumb, appliance ventilation and protected delivery access.\nQuality checks: inspect finish samples, installation clearances and final hardware alignment.\nCurrent commercial stage: ${p.commercial_status}. Existing approvals and handoff state are preserved.`,
          p_links: notes.resource_links,
          p_reason: reason,
        },
        `${key}-resources`,
      );
    const description = p.is_operationally_completed
      ? "UAT aftercare review: handover checklist completed; keep the maintenance guide with the approved finish schedule."
      : p.name === "Garden Pavilion"
        ? "UAT coordination note: project remains on hold pending final finish selections; deadlines and existing work history are preserved."
        : p.commercial_status === "Closed"
          ? "UAT coordination update: confirm the finish schedule, site measurements and delivery access against the approved scope. Existing Operations acknowledgment requirements remain in effect."
          : "UAT client coordination: review the proposed cabinetry layouts, appliance specifications and itemized quotation before commercial discussion.";
    await rpc(
      "LEAD",
      "save_project_activity",
      {
        p_id: id(`${key}-activity`),
        p_project: p.id,
        p_version: 0,
        p_space: null,
        p_category: "Client Coordination",
        p_date: today,
        p_description: description,
        p_coordinator: null,
        p_attachments: [],
        p_reason: reason,
      },
      `${key}-activity`,
    );
    await rpc(
      "LEAD",
      "save_project_comment",
      {
        p_id: id(`${key}-comment`),
        p_project: p.id,
        p_space: null,
        p_version: 0,
        p_body: `${description}\nPlease record any drawing or finish changes in the appropriate space before the next coordination meeting. (Fictional UAT discussion.)`,
        p_mentions: [u.DESIGNER],
        p_reason: "",
      },
      `${key}-comment`,
    );
    const slots = await rpc("DESIGNER", "get_attachment_slots", {
      p_project: p.id,
    });
    const filename = `${p.name.replaceAll(/[^A-Za-z0-9]+/g, "-")}-coordination-brief.txt`;
    const contents = Buffer.from(
      `ONE ODC - FICTIONAL UAT PROJECT BRIEF\n${p.name}\n\nSCOPE\n${spaces.map((s) => `- ${s.name}`).join("\n")}\n\nSPECIFICATION\nWarm oak and matte neutral cabinetry; soft-close hardware; concealed storage and task lighting.\nVerify appliance cut-outs and ventilation, finished-floor levels and wall alignment before fabrication.\n\nSITE COORDINATION\nConfirm delivery booking, lift protection, access clearances and clean installation areas.\nRecord snagging items with the assigned Designer before operational completion.\n\n${description}\n\nSample only. This is not a real client specification, purchase order, payment instruction or approval.\n`,
    );
    const existing = await read(
      c.DESIGNER.from("attachments")
        .select("id,attachment_versions(original_name,ready_at)")
        .eq("project_id", p.id)
        .is("archived_at", null),
    );
    const present = existing.some((a) =>
      a.attachment_versions.some(
        (v) => v.original_name === filename && v.ready_at,
      ),
    );
    if (!present && (!slots || Number(slots.uploaded) < 3)) {
      const reserved = await rpc(
        "DESIGNER",
        "reserve_attachment",
        {
          p_attachment: null,
          p_lead: null,
          p_project: p.id,
          p_class: "general",
          p_name: filename,
          p_mime: "text/plain",
          p_size: contents.length,
        },
        `${key}-file`,
      );
      if (!state.steps[`${key}-uploaded`]) {
        const upload = await c.DESIGNER.storage
          .from(reserved.bucket)
          .upload(reserved.object_path, contents, {
            contentType: "text/plain",
          });
        if (
          upload.error &&
          !/already exists|Duplicate/i.test(upload.error.message)
        )
          throw Error(`${p.name}: upload failed`);
        state.steps[`${key}-uploaded`] = true;
        save();
      }
      await rpc(
        "DESIGNER",
        "complete_attachment",
        { p_version: reserved.id },
        `${key}-file-ready`,
      );
      const download = await c.DESIGNER.storage
        .from(reserved.bucket)
        .download(reserved.object_path);
      if (
        download.error ||
        (await download.data.text()) !== contents.toString()
      )
        throw Error("UAT file round-trip failed");
    }
    if (!state.projects.some((r) => r.id === p.id)) {
      state.projects.push({ id: p.id, name: p.name });
      save();
    }
    console.log(`Enriched ${p.name}`);
  }
  console.log(
    JSON.stringify({
      staging: stage,
      projects: state.projects.length,
      manifest: path,
    }),
  );
} finally {
  for (const client of Object.values(c))
    await client.auth.signOut({ scope: "local" });
}
