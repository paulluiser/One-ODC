import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw new Error("Refusing non-staging fixture.");
const sessions = [];
async function actor(name) {
  const client = createClient(
    process.env.ONE_ODC_TEST_URL,
    process.env.ONE_ODC_TEST_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const login = await client.auth.signInWithPassword({
    email: process.env[`ONE_ODC_TEST_${name}_EMAIL`],
    password: process.env[`ONE_ODC_TEST_${name}_PASSWORD`],
  });
  if (login.error) throw new Error("Staging actor authentication failed");
  sessions.push(client);
  return client;
}
try {
  const action = process.argv[2];
  if (action === "create") {
    const [prefix, primary, ops] = process.argv.slice(3);
    const bdm = await actor("BDM");
    const lead = await actor("LEAD");
    const id = randomUUID();
    const name = `${prefix} ${id}`;
    const saved = await bdm.rpc("save_lead", {
      p_id: id,
      p_expected_version: 0,
      p_payload: {
        project_name: name,
        address: name,
        brand: "Stosa",
        cabinetry_count: 2,
        notes: "Authorized synthetic staging fixture",
        date_needed: null,
        attachment_metadata: [],
      },
      p_submit: true,
      p_duplicate_reason: "",
    });
    if (saved.error) throw new Error("Staging fixture submission failed");
    const accepted = await lead.rpc("review_lead", {
      p_id: id,
      p_expected_version: 1,
      p_decision: "Accepted",
      p_remarks: "",
      p_primary: primary,
      p_support: [],
      p_ops: [ops],
      p_lead_designer: null,
    });
    if (accepted.error) throw new Error("Staging fixture acceptance failed");
    console.log(JSON.stringify({ id: accepted.data, name, leadId: id }));
  } else if (action === "installation-setup") {
    const [project, primary, opsId] = process.argv.slice(3);
    const lead = await actor("LEAD"),
      bdm = await actor("BDM"),
      ops = await actor("OPS");
    async function call(client, name, args) {
      const r = await client.rpc(name, args);
      if (r.error)
        throw new Error(`Installation fixture: ${name}: ${r.error.message}`);
      return r.data;
    }
    const spaces = [randomUUID(), randomUUID()];
    for (const [index, space] of spaces.entries()) {
      await call(lead, "save_space", {
        p_id: space,
        p_project: project,
        p_expected_version: 0,
        p_name: `Installation ${index + 1}`,
        p_deadline: null,
        p_primary:
          index === 0 ? primary : (await lead.auth.getUser()).data.user.id,
        p_support: [],
        p_reason: "Synthetic installation scope",
      });
      for (const [version, status] of [
        [1, "In Progress"],
        [2, "Submitted"],
        [3, "Completed"],
      ])
        await call(lead, "change_space_status", {
          p_id: space,
          p_expected_version: version,
          p_status: status,
          p_reason: "Design acceptance",
          p_approval: "Approved client reference",
        });
    }
    await call(bdm, "set_financial_value", {
      p_project: project,
      p_kind: "Sale",
      p_amount: "100.10",
      p_expected_version: 0,
      p_reason: "",
    });
    await call(lead, "transition_commercial_stage", {
      p_project: project,
      p_expected_stage: "For Quotation",
      p_target: "Under Negotiation",
      p_reason: "Release to BDM",
      p_confirm: true,
    });
    await call(bdm, "close_project_sale", {
      p_project: project,
      p_expected_stage: "Under Negotiation",
      p_sale_version: 1,
      p_primary_ops: opsId,
      p_confirm: true,
      p_reason: "Client confirmed the agreed price",
    });
    await call(lead, "handoff_closed_project", {
      p_project: project,
      p_primary_ops: opsId,
      p_reason: "Lead-approved Operations handoff",
      p_confirm: true,
    });
    const h = await call(ops, "get_commercial_handoff", { p_project: project });
    await call(ops, "acknowledge_handoff", {
      p_project: project,
      p_handoff: h.current.id,
      p_version: 1,
      p_confirm: true,
    });
    console.log(JSON.stringify({ spaces }));
  } else if (action === "finance-quotation") {
    const [project, primary] = process.argv.slice(3);
    const lead = await actor("LEAD");
    async function call(name, args) {
      const r = await lead.rpc(name, args);
      if (r.error) throw new Error(`Finance quotation fixture failed: ${name}`);
      return r.data;
    }
    const space = randomUUID();
    await call("save_space", {
      p_id: space,
      p_project: project,
      p_expected_version: 0,
      p_name: "Finance fixture Space",
      p_deadline: null,
      p_primary: primary,
      p_support: [],
      p_reason: "Synthetic finance quotation",
    });
    const draft = await call("create_quotation_draft", { p_project: project });
    await call("save_quotation_space", {
      p_draft: draft,
      p_space: space,
      p_expected_version: 1,
      p_items: [
        {
          id: randomUUID(),
          description: "Approved finance baseline",
          quantity: "1",
          unit_price: "0.10",
        },
      ],
      p_reason: "Synthetic financial baseline",
    });
    await call("submit_quotation", {
      p_version: draft,
      p_expected_version: 2,
      p_remarks: "Baseline submitted",
    });
    await call("review_quotation", {
      p_version: draft,
      p_expected_version: 3,
      p_decision: "Approved",
      p_remarks: "Baseline approved",
    });
    const pending = await call("create_quotation_draft", {
      p_project: project,
    });
    const pendingQuote = await call("get_project_quotation", {
      p_project: project,
    });
    await call("save_quotation_space", {
      p_draft: pending,
      p_space: space,
      p_expected_version: 1,
      p_items: pendingQuote.spaces
        .find((s) => s.id === space)
        .items.map((i) => ({ ...i, unit_price: "99.99" })),
      p_reason: "Unapproved pricing must not affect finance",
    });
    console.log(JSON.stringify({ quotation: draft }));
  } else if (action === "quotation-touch") {
    const [project, space] = process.argv.slice(3);
    const lead = await actor("LEAD");
    const draft = await lead.rpc("get_project_quotation", {
      p_project: project,
    });
    if (draft.error || !draft.data) throw new Error("Draft fixture missing");
    const saved = await lead.rpc("save_quotation_space", {
      p_draft: draft.data.id,
      p_space: space,
      p_expected_version: draft.data.edit_version,
      p_items: [],
      p_reason: "Concurrent browser test edit",
    });
    if (saved.error) throw new Error("Concurrent draft fixture save failed");
    console.log(JSON.stringify({ saved: true }));
  } else if (action === "quotation-spaces") {
    const [project, primary] = process.argv.slice(3);
    const lead = await actor("LEAD");
    const user = await lead.auth.getUser();
    const spaces = [];
    for (const designer of [primary, user.data.user.id]) {
      const id = randomUUID();
      const r = await lead.rpc("save_space", {
        p_id: id,
        p_project: project,
        p_expected_version: 0,
        p_name: "Kitchen",
        p_deadline: null,
        p_primary: designer,
        p_support: [],
        p_reason: "Synthetic quotation browser scope",
      });
      if (r.error) throw new Error("Quotation fixture space failed");
      spaces.push(id);
    }
    console.log(JSON.stringify(spaces));
  } else if (action === "finance-support-fixture") {
    // Seed only a dedicated synthetic fixture. Business assertions use real JWT/RLS.
    const project = process.argv[3];
    const key = process.env.ONE_ODC_TEST_SECRET_KEY;
    if (!key) throw new Error("Staging fixture secret is not configured");
    const setup = createClient(process.env.ONE_ODC_TEST_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const row = await setup
      .from("projects")
      .select("name")
      .eq("id", project)
      .single();
    if (row.error || !row.data.name.startsWith("UI-R3 finance API "))
      throw new Error("Dedicated finance fixture required");
    const other = await actor("OTHER_BDM");
    const user = (await other.auth.getUser()).data.user;
    const added = await setup.from("project_memberships").insert({
      project_id: project,
      user_id: user.id,
      membership_role: "bdm",
      is_primary: false,
    });
    if (added.error) throw new Error("Staging support fixture setup failed");
    console.log(JSON.stringify({ configured: true }));
  } else if (action === "verify") {
    const project = process.argv[3];
    const lead = await actor("LEAD");
    const history = await lead
      .from("project_assignment_events")
      .select("id")
      .eq("project_id", project);
    if (history.error) throw new Error("Staging history query failed");
    const result = { history: history.data.length };
    for (const name of ["DESIGNER", "OTHER_BDM", "UNASSIGNED"]) {
      const client = await actor(name);
      const rows = await client.from("projects").select("id").eq("id", project);
      if (rows.error) throw new Error("Staging membership query failed");
      result[name] = rows.data.length;
    }
    console.log(JSON.stringify(result));
  } else throw new Error("Unknown staging fixture action");
} finally {
  for (const client of sessions) await client.auth.signOut({ scope: "local" });
}
