// Fictional One ODC walkthrough data. Staging only; reruns resume from an ignored manifest.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
process.loadEnvFile(".env.verification");
const env = process.env;
if (
  env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(env.ONE_ODC_TEST_URL).hostname !== "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging target required");
const path = "artifacts/verification/staging-refresh/manifest.json";
mkdirSync("artifacts/verification/staging-refresh", { recursive: true });
const state = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : { createdAt: new Date().toISOString(), steps: {}, ids: {}, records: [] };
const save = () => writeFileSync(path, JSON.stringify(state, null, 2));
const id = (key) => {
  if (!state.ids[key]) {
    state.ids[key] = randomUUID();
    save();
  }
  return state.ids[key];
};
const clients = {},
  actors = {};
async function rpc(actor, name, args, key) {
  if (key && Object.hasOwn(state.steps, key)) return state.steps[key];
  const r = await clients[actor].rpc(name, args);
  if (r.error) throw Error(`${key || name}: ${r.error.message}`);
  if (key) {
    state.steps[key] = r.data;
    save();
  }
  return r.data;
}
// Relative dates keep the UAT calendar readable on each fresh reset.
const seedDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const day = (offset) =>
  new Date(Date.parse(`${seedDate}T12:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const reason = "Fictional staging walkthrough data approved by workspace owner";
const samples = [
  [
    "The Acacia Residence",
    "Makati · San Lorenzo Village",
    "Stosa",
    ["Kitchen", "Walk-in Wardrobe", "Utility Room"],
    "design",
    false,
  ],
  [
    "Harbor View Condominium",
    "Pasay · Bay District",
    "SFY",
    ["Kitchen", "Master Wardrobe"],
    "review",
    false,
  ],
  [
    "The Courtyard Townhouse",
    "Quezon City · New Manila",
    "Both",
    ["Kitchen", "Living Room Storage", "Study"],
    "quotation",
    false,
  ],
  [
    "Studio North Office",
    "Taguig · Bonifacio Global City",
    "SFY",
    ["Reception", "Pantry", "Meeting Room Storage"],
    "handoff",
    false,
  ],
  [
    "Casa Solana",
    "Alabang · Residential District",
    "Stosa",
    ["Kitchen", "Island", "Laundry Room"],
    "manufacturing",
    false,
  ],
  [
    "Sierra Heights Residence",
    "Antipolo · Hillside District",
    "Both",
    ["Kitchen", "Dressing Room"],
    "installation",
    false,
  ],
  [
    "The Linden Apartment",
    "Mandaluyong · Greenfield District",
    "SFY",
    ["Kitchen", "Entry Storage"],
    "completed",
    false,
  ],
  [
    "Garden Pavilion",
    "San Juan · Residential District",
    "Stosa",
    ["Kitchen", "Bar Cabinet"],
    "hold",
    false,
  ],
  [
    "Parkside Family Home",
    "Pasig · Residential District",
    "Both",
    [],
    "Submitted",
    false,
  ],
  [
    "The Willow Penthouse",
    "Makati · Central District",
    "Stosa",
    [],
    "Returned for Clarification",
    false,
  ],
  [
    "Cedar Lane Renovation",
    "Quezon City · Residential District",
    "SFY",
    [],
    "Draft",
    true,
  ],
  [
    "Atelier East Showroom",
    "Taguig · Design District",
    "Both",
    [],
    "Rejected",
    true,
  ],
];
try {
  for (const actor of [
    "ADMIN",
    "BDM",
    "LEAD",
    "DESIGNER",
    "OPS",
    "OTHER_BDM",
    "UNASSIGNED",
  ]) {
    const c = createClient(
      env.ONE_ODC_TEST_URL,
      env.ONE_ODC_TEST_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const r = await c.auth.signInWithPassword({
      email: env[`ONE_ODC_TEST_${actor}_EMAIL`],
      password: env[`ONE_ODC_TEST_${actor}_PASSWORD`],
    });
    if (r.error) throw Error(`Cannot authenticate staging ${actor}`);
    clients[actor] = c;
    actors[actor] = r.data.user.id;
  }
  for (const [i, name] of [
    "Forma Cabinetry Studio",
    "Linea Stone & Surfaces",
    "Archway Delivery Services",
  ].entries()) {
    await rpc(
      "OPS",
      "save_supplier",
      {
        p_id: id(`supplier${i}`),
        p_version: 0,
        p_data: {
          name,
          brand: i === 0 ? "Stosa" : "Both",
          active: true,
          contact_person: ["Mara Santos", "Leo Reyes", "Nina Cruz"][i],
          contact_details: `coordination@${["forma", "linea", "archway"][i]}.example`,
          remarks: "Fictional supplier for staging walkthroughs.",
        },
        p_reason: reason,
      },
      `supplier${i}`,
    );
  }
  for (const [
    i,
    [name, address, brand, spaces, stage, other],
  ] of samples.entries()) {
    const key = `sample${i}`,
      leadId = id(key),
      owner = other ? "OTHER_BDM" : "BDM";
    await rpc(
      owner,
      "save_lead",
      {
        p_id: leadId,
        p_expected_version: 0,
        p_payload: {
          project_name: name,
          address,
          brand,
          cabinetry_count: Math.max(spaces.length, 2),
          date_needed: day(21 + i),
          notes: `Fictional sample project — no real client information.\n${i % 2 ? "Warm oak cabinetry with concealed storage. Confirm site measurements before fabrication." : "Contemporary interior with matte finishes and integrated storage. Client requests clear circulation and durable surfaces."}`,
          resource_links: [
            {
              id: id(`${key}-link`),
              url: `https://example.com/one-odc/${i + 1}/design-brief`,
            },
          ],
          attachment_metadata: [],
        },
        p_submit: stage !== "Draft",
        p_duplicate_reason: "",
      },
      `${key}-lead`,
    );
    if (
      ["Draft", "Submitted", "Returned for Clarification", "Rejected"].includes(
        stage,
      )
    ) {
      if (["Returned for Clarification", "Rejected"].includes(stage))
        await rpc(
          "LEAD",
          "review_lead",
          {
            p_id: leadId,
            p_expected_version: 1,
            p_decision: stage,
            p_remarks:
              stage === "Rejected"
                ? "Requested scope is outside the current service offering."
                : "Please confirm appliance dimensions and attach the latest measured layout.",
            p_primary: null,
            p_support: [],
            p_ops: [],
            p_lead_designer: null,
          },
          `${key}-review`,
        );
      continue;
    }
    const project = await rpc(
      "LEAD",
      "review_lead",
      {
        p_id: leadId,
        p_expected_version: 1,
        p_decision: "Accepted",
        p_remarks: "Brief reviewed; proceed with the assigned design scope.",
        p_primary: actors.DESIGNER,
        p_support: [actors.LEAD],
        p_ops: [actors.OPS],
        p_lead_designer: null,
      },
      `${key}-accept`,
    );
    await rpc(
      "LEAD",
      "revise_project_deadline",
      {
        p_project: project,
        p_version: 1,
        p_deadline: i === 0 ? day(-2) : day(7 + i * 2),
        p_timezone: "Asia/Manila",
        p_reason: "Agreed target for the fictional staging brief",
      },
      `${key}-deadline`,
    );
    const completed = ["manufacturing", "installation", "completed"].includes(
      stage,
    );
    for (const [n, spaceName] of spaces.entries()) {
      const space = id(`${key}-space${n}`);
      await rpc(
        "LEAD",
        "save_space",
        {
          p_id: space,
          p_project: project,
          p_expected_version: 0,
          p_name: spaceName,
          p_deadline: i === 0 ? day(-2) : day(3 + i * 2 + n),
          p_primary: actors.DESIGNER,
          p_support: n === 0 ? [actors.LEAD] : [],
          p_reason: "Agreed cabinetry scope",
        },
        `${key}-space${n}`,
      );
      const statuses = completed
        ? ["In Progress", "Submitted", "Completed"]
        : stage === "review"
          ? ["In Progress", "Submitted"]
          : n === 0
            ? ["In Progress"]
            : [];
      for (const [j, status] of statuses.entries())
        await rpc(
          status === "Completed" ? "LEAD" : "DESIGNER",
          "change_space_status",
          {
            p_id: space,
            p_expected_version: j + 1,
            p_status: status,
            p_reason:
              status === "Completed"
                ? "Client-approved design package"
                : "Design development progressing against the brief",
            p_approval:
              status === "Completed" ? "Fictional client design sign-off" : "",
          },
          `${key}-space${n}-${status}`,
        );
    }
    const draft = await rpc(
      "DESIGNER",
      "create_quotation_draft",
      { p_project: project },
      `${key}-draft`,
    );
    for (const [n, spaceName] of spaces.entries())
      await rpc(
        "DESIGNER",
        "save_quotation_space",
        {
          p_draft: draft,
          p_space: id(`${key}-space${n}`),
          p_expected_version: n + 1,
          p_items: [
            {
              id: id(`${key}-item${n}a`),
              description: `${spaceName} — custom cabinetry supply and installation`,
              quantity: "1",
              unit_price: String(145000 + n * 35000),
            },
            {
              id: id(`${key}-item${n}b`),
              description: "Soft-close hardware and internal organizers",
              quantity: "2",
              unit_price: "12500.00",
            },
          ],
          p_reason: "Initial itemized scope and pricing",
        },
        `${key}-quote${n}`,
      );
    if (stage !== "design" && stage !== "hold") {
      await rpc(
        "DESIGNER",
        "submit_quotation",
        {
          p_version: draft,
          p_expected_version: spaces.length + 1,
          p_remarks: "Scope ready for Lead Designer pricing review.",
        },
        `${key}-submit`,
      );
      if (stage !== "review")
        await rpc(
          "LEAD",
          "review_quotation",
          {
            p_version: draft,
            p_expected_version: spaces.length + 2,
            p_decision: "Approved",
            p_remarks: "Itemized scope and pricing reviewed.",
          },
          `${key}-approve`,
        );
    }
    if (
      ["handoff", "manufacturing", "installation", "completed"].includes(stage)
    ) {
      const sale = spaces.reduce((sum, _, n) => sum + 170000 + n * 35000, 0),
        raw = Math.round(sale * 0.62);
      for (const [kind, amount, actor] of [
        ["Sale", sale, "BDM"],
        ["Raw", raw, "LEAD"],
      ])
        await rpc(
          actor,
          "set_financial_value",
          {
            p_project: project,
            p_kind: kind,
            p_amount: String(amount),
            p_expected_version: 0,
            p_reason: "Approved fictional commercial amount",
          },
          `${key}-${kind}`,
        );
      if (!Object.hasOwn(state.steps, `${key}-close`))
        await rpc(
          "LEAD",
          "transition_commercial_stage",
          {
            p_project: project,
            p_expected_stage: "For Quotation",
            p_target: "Under Negotiation",
            p_reason: "Design package released for BDM follow-up",
            p_confirm: true,
          },
          `${key}-negotiation`,
        );
      await rpc(
        "BDM",
        "close_project_sale",
        {
          p_project: project,
          p_expected_stage: "Under Negotiation",
          p_sale_version: 1,
          p_primary_ops: actors.OPS,
          p_confirm: true,
          p_reason: "Fictional client commercial confirmation",
        },
        `${key}-close`,
      );
      if (!Object.hasOwn(state.steps, `${key}-lead-handoff`)) {
        const h = await rpc("LEAD", "get_commercial_handoff", {
          p_project: project,
        });
        if (!h.current)
          await rpc(
            "LEAD",
            "handoff_closed_project",
            {
              p_project: project,
              p_primary_ops: actors.OPS,
              p_reason: "Lead-approved operational assignment and release",
              p_confirm: true,
            },
            `${key}-lead-handoff`,
          );
        else {
          state.steps[`${key}-lead-handoff`] = h.current.id;
          save();
        }
      }
      if (stage !== "handoff") {
        const handoff = await rpc("OPS", "get_commercial_handoff", {
          p_project: project,
        });
        await rpc(
          "OPS",
          "acknowledge_handoff",
          {
            p_project: project,
            p_handoff: handoff.current.id,
            p_version: 1,
            p_confirm: true,
          },
          `${key}-ack`,
        );
        const logistic = id(`${key}-logistics`);
        const states =
          stage === "manufacturing"
            ? ["RFP", "Supplier Adjustments", "For Manufacturing"]
            : [
                "RFP",
                "Supplier Adjustments",
                "For Manufacturing",
                "In Transit",
                "Landed",
                "For Delivery",
                "Delivered",
              ];
        for (const [v, status] of states.entries())
          await rpc(
            "OPS",
            "save_logistics",
            {
              p_id: logistic,
              p_project: project,
              p_version: v,
              p_supplier: id("supplier0"),
              p_data: {
                status,
                brand,
                reference: `PO-ODC-${2026}-${String(i + 1).padStart(3, "0")}`,
                remarks:
                  "Cabinetry package; coordinate delivery access with the site team.",
              },
              p_reason: "Fictional supplier coordination milestone",
              p_override: false,
            },
            `${key}-logistics${v}`,
          );
        for (const kind of ["client", "supplier"])
          await rpc(
            "OPS",
            "mutate_payment",
            {
              p_id: id(`${key}-payment-${kind}`),
              p_project: project,
              p_kind: kind,
              p_expected_version: 0,
              p_intent: "save",
              p_data: {
                payment_date: day(0),
                amount: String(
                  stage === "completed"
                    ? kind === "client"
                      ? sale
                      : raw
                    : Math.round((kind === "client" ? sale : raw) * 0.5),
                ),
                method: "Bank transfer",
                reference: `SAMPLE-${kind.toUpperCase()}-${i + 1}`,
                remarks: "Fictional staging payment, no actual transfer.",
              },
              p_reason: reason,
            },
            `${key}-payment-${kind}`,
          );
        if (["installation", "completed"].includes(stage))
          for (const [n] of spaces.entries()) {
            const statuses =
              stage === "completed" || n === 0
                ? ["Scheduled", "In Progress", "Completed"]
                : ["Scheduled"];
            for (const [v, status] of statuses.entries())
              await rpc(
                "DESIGNER",
                "save_installation",
                {
                  p_space: id(`${key}-space${n}`),
                  p_project: project,
                  p_version: v,
                  p_status: status,
                  p_date: stage === "completed" || n === 0 ? day(0) : day(3),
                  p_reason: "Fictional site installation update",
                  p_override: false,
                },
                `${key}-install${n}-${v}`,
              );
          }
        if (stage === "completed") {
          const r = await rpc("LEAD", "operational_readiness", {
            p_project: project,
          });
          await rpc(
            "LEAD",
            "complete_operations",
            {
              p_project: project,
              p_version: r.version,
              p_cycle: r.cycle,
              p_confirm: true,
              p_reason:
                "All fictional design, logistics and installation scope completed.",
            },
            `${key}-complete`,
          );
        }
      }
    }
    if (stage === "hold")
      await rpc(
        "LEAD",
        "control_project",
        {
          p_project: project,
          p_version: 2,
          p_action: "Hold",
          p_reason: "Client requested a pause pending finish selections.",
        },
        `${key}-hold`,
      );
    if (!state.records.some((x) => x.id === project)) {
      state.records.push({ id: project, leadId, name, stage });
      save();
    }
    console.log(`Prepared ${name}`);
  }

  for (const index of [0, 4]) {
    const key = `sample${index}`,
      project = state.steps[`${key}-accept`],
      name = samples[index][0];
    const contents = Buffer.from(
      `ONE ODC | FICTIONAL STAGING BRIEF\nProject: ${name}\nScope: ${samples[index][3].join(", ")}\nFinish: matte warm white with natural oak accents.\nHardware: soft-close hinges and concealed drawer runners.\nSite team to verify dimensions and appliance clearances before fabrication.\nThis document is sample data; it is not a real client specification.\n`,
    );
    const reserved = await rpc(
      "DESIGNER",
      "reserve_attachment",
      {
        p_attachment: null,
        p_lead: null,
        p_project: project,
        p_class: "general",
        p_name: "Design brief.txt",
        p_mime: "text/plain",
        p_size: contents.length,
      },
      `${key}-attachment`,
    );
    if (!state.steps[`${key}-uploaded`]) {
      const result = await clients.DESIGNER.storage
        .from(reserved.bucket)
        .upload(reserved.object_path, contents, { contentType: "text/plain" });
      if (result.error)
        throw Error(`Sample upload failed: ${result.error.message}`);
      state.steps[`${key}-uploaded`] = true;
      save();
    }
    await rpc(
      "DESIGNER",
      "complete_attachment",
      { p_version: reserved.id },
      `${key}-file-complete`,
    );
    const downloaded = await clients.DESIGNER.storage
      .from(reserved.bucket)
      .download(reserved.object_path);
    if (
      downloaded.error ||
      (await downloaded.data.text()) !== contents.toString()
    )
      throw Error("Sample file integrity failed");
  }
  const scopes = {};
  for (const actor of Object.keys(clients)) {
    const [projects, leads, spaces] = await Promise.all(
      ["projects", "leads", "spaces"].map((table) =>
        clients[actor].from(table).select("id"),
      ),
    );
    for (const result of [projects, leads, spaces])
      if (result.error) throw Error("Scope query failed");
    scopes[actor] = {
      projects: projects.data.length,
      leads: leads.data.length,
      spaces: spaces.data.length,
    };
  }
  if (scopes.OTHER_BDM.projects !== 0 || scopes.UNASSIGNED.projects !== 0)
    throw Error("Cross-project visibility failure");
  const project = state.steps["sample0-accept"];
  const opsQuote = await clients.OPS.rpc("get_quotation_version", {
    p_project: project,
    p_version: state.steps["sample0-draft"],
  });
  const bdmQuote = await clients.BDM.rpc("get_quotation_version", {
    p_project: project,
    p_version: state.steps["sample0-draft"],
  });
  if (!opsQuote.error || !bdmQuote.error)
    throw Error("Restricted quotation access unexpectedly allowed");
  const opsFile = await clients.OPS.storage
    .from(state.steps["sample0-attachment"].bucket)
    .download(state.steps["sample0-attachment"].object_path);
  if (!opsFile.error) throw Error("Operations file restriction failed");
  state.verification = {
    at: new Date().toISOString(),
    scopes,
    privateFileRoundTrips: 2,
    restrictedQuotationDenials: 2,
    operationsFileDenied: true,
  };
  save();
  console.log(
    JSON.stringify({
      projects: state.records.length,
      leads: samples.length,
      suppliers: 3,
      manifest: path,
    }),
  );
} finally {
  for (const c of Object.values(clients))
    await c.auth.signOut({ scope: "local" });
}
