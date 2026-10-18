// Bounded Phase 4 acceptance: real password sessions and business RPCs only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw new Error("Refusing non-staging acceptance");
const clients = {},
  ids = {},
  timings = {};
async function call(actor, name, args) {
  const r = await clients[actor].rpc(name, args);
  if (r.error) throw new Error(`${name}: ${r.error.message}`);
  return r.data;
}
async function rows(actor, table, column, value) {
  const r = await clients[actor].from(table).select("*").eq(column, value);
  assert.equal(r.error, null);
  return r.data;
}
async function denied(actor, name, args, code = "ACCESS_DENIED") {
  const r = await clients[actor].rpc(name, args);
  assert.ok(
    r.error?.message.includes(code),
    `${name} must reject ${actor} (${code})`,
  );
}
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
      process.env.ONE_ODC_TEST_URL,
      process.env.ONE_ODC_TEST_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    clients[actor] = c;
    const login = await c.auth.signInWithPassword({
      email: process.env[`ONE_ODC_TEST_${actor}_EMAIL`],
      password: process.env[`ONE_ODC_TEST_${actor}_PASSWORD`],
    });
    if (login.error) throw new Error("Staging sign-in failed");
    ids[actor] = login.data.user.id;
  }
  const lead = randomUUID(),
    space = randomUUID(),
    cancelled = randomUUID(),
    supplier = randomUUID(),
    logistics = randomUUID();
  const notes = "4D Notes\n<script>window.odcInjected=true</script>",
    links = [
      { id: randomUUID(), url: "https://example.com/4d-plans" },
      { id: randomUUID(), url: "https://example.com/4d-specifications" },
    ];
  const payload = {
    assigned_lead_designer_id: ids.LEAD,
    project_name: `4D acceptance ${lead}`,
    address: `Synthetic acceptance ${lead}`,
    brand: "Stosa",
    cabinetry_count: 2,
    notes,
    date_needed: null,
    attachment_metadata: [],
    resource_links: links,
  };
  const saveLead = (v, submit) =>
    call("BDM", "save_lead", {
      p_id: lead,
      p_expected_version: v,
      p_payload: payload,
      p_submit: submit,
      p_duplicate_reason: "",
    });
  await saveLead(0, false);
  const reservation = {
    p_attachment: null,
    p_lead: lead,
    p_project: null,
    p_class: "general",
    p_name: "4d-private.txt",
    p_mime: "text/plain",
    p_size: 4,
  };
  const slots = await Promise.all(
    Array.from({ length: 4 }, () =>
      clients.BDM.rpc("reserve_attachment", reservation),
    ),
  );
  assert.equal(slots.filter((r) => !r.error).length, 3);
  assert.ok(
    slots
      .find((r) => r.error)
      ?.error.message.includes("ATTACHMENT_COUNT_LIMIT"),
  );
  const files = slots.filter((r) => !r.error).map((r) => r.data);
  for (const f of files) {
    const upload = await clients.BDM.storage
      .from(f.bucket)
      .upload(f.object_path, Buffer.from("test"), {
        contentType: "text/plain",
      });
    assert.equal(upload.error, null);
    await call("BDM", "complete_attachment", { p_version: f.id });
  }
  await saveLead(1, true);
  await call("LEAD", "review_lead", {
    p_id: lead,
    p_expected_version: 2,
    p_decision: "Returned for Clarification",
    p_remarks: "Clarify scope",
  });
  payload.notes = notes + "\nClarified";
  await saveLead(3, true);
  const accept = {
    p_id: lead,
    p_expected_version: 4,
    p_decision: "Accepted",
    p_remarks: "",
    p_primary: ids.DESIGNER,
    p_support: [],
    p_ops: [ids.OPS],
    p_lead_designer: null,
  };
  const accepted = await Promise.all([
    clients.LEAD.rpc("review_lead", accept),
    clients.LEAD.rpc("review_lead", accept),
  ]);
  for (const r of accepted) assert.equal(r.error, null);
  assert.equal(accepted[0].data, accepted[1].data);
  const project = accepted[0].data;
  assert.equal(
    (await rows("ADMIN", "project_origins", "lead_id", lead)).length,
    1,
  );
  const notices = await rows("BDM", "notifications", "project_id", project);
  await call("LEAD", "review_lead", accept);
  assert.equal(
    (await rows("BDM", "notifications", "project_id", project)).length,
    notices.length,
  );
  const resources = await call("DESIGNER", "project_resources", {
    p_project: project,
  });
  assert.equal(resources.notes, payload.notes);
  assert.deepEqual(resources.resource_links, links);
  assert.equal(
    (await call("LEAD", "get_attachment_slots", { p_project: project }))
      .remaining,
    0,
  );
  await denied("OPS", "project_resources", { p_project: project });
  const inherited = files[0];
  const replacement = await call("DESIGNER", "reserve_attachment", {
    ...reservation,
    p_attachment: inherited.attachment_id,
    p_lead: null,
    p_project: project,
  });
  const replaced = await clients.DESIGNER.storage
    .from(replacement.bucket)
    .upload(replacement.object_path, Buffer.from("new!"), {
      contentType: "text/plain",
    });
  assert.equal(replaced.error, null);
  await call("DESIGNER", "complete_attachment", { p_version: replacement.id });
  assert.equal(
    (
      await rows(
        "DESIGNER",
        "attachment_versions",
        "attachment_id",
        inherited.attachment_id,
      )
    ).length,
    2,
  );
  assert.equal(
    (await call("LEAD", "get_attachment_slots", { p_project: project }))
      .remaining,
    0,
  );
  await call("LEAD", "archive_attachment", {
    p_id: inherited.attachment_id,
    p_archive: true,
    p_reason: "Integrated archive",
  });
  assert.equal(
    (await call("LEAD", "get_attachment_slots", { p_project: project }))
      .remaining,
    1,
  );
  assert.equal(
    (
      await clients.DESIGNER.storage
        .from(inherited.bucket)
        .download(inherited.object_path)
    ).data,
    null,
  );
  await call("LEAD", "archive_attachment", {
    p_id: inherited.attachment_id,
    p_archive: false,
    p_reason: "Integrated restore",
  });
  assert.equal(
    (await call("LEAD", "get_attachment_slots", { p_project: project }))
      .remaining,
    0,
  );
  const original = await clients.DESIGNER.storage
    .from(inherited.bucket)
    .download(inherited.object_path);
  assert.equal(original.error, null);
  assert.equal(await original.data.text(), "test");
  const latest = await clients.DESIGNER.storage
    .from(replacement.bucket)
    .download(replacement.object_path);
  assert.equal(latest.error, null);
  assert.equal(await latest.data.text(), "new!");
  // Allow a bounded network window before checking actual expiration.
  const signed = await clients.BDM.storage
    .from(inherited.bucket)
    .createSignedUrl(inherited.object_path, 10);
  assert.equal(signed.error, null);
  assert.equal((await fetch(signed.data.signedUrl)).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 12000));
  assert.ok(
    [400, 401, 403].includes((await fetch(signed.data.signedUrl)).status),
    "Expired signed download must fail",
  );

  const create = {
    p_project: project,
    p_expected_version: 0,
    p_name: "4D Kitchen",
    p_deadline: null,
    p_primary: ids.DESIGNER,
    p_support: [],
    p_reason: "Initial scope",
  };
  await call("LEAD", "save_space", { ...create, p_id: space });
  await call("LEAD", "save_space", {
    ...create,
    p_id: cancelled,
    p_name: "Cancelled scope",
  });
  await call("LEAD", "cancel_space", {
    p_id: cancelled,
    p_expected_version: 1,
    p_reason: "Removed scope",
  });
  const design = (status, version, actor = "DESIGNER") =>
    call(actor, "change_space_status", {
      p_id: space,
      p_expected_version: version,
      p_status: status,
      p_reason: "Integrated design work",
      p_approval: actor === "LEAD" ? "Client approval 4D" : "",
    });
  await design("In Progress", 1);
  await design("Submitted", 2);
  const quotation = await call("DESIGNER", "create_quotation_draft", {
    p_project: project,
  });
  await call("DESIGNER", "save_quotation_space", {
    p_draft: quotation,
    p_space: space,
    p_expected_version: 1,
    p_items: [
      {
        id: randomUUID(),
        description: "Exact cabinet line",
        quantity: "0.005",
        unit_price: "1.00",
      },
      {
        id: randomUUID(),
        description: "Exact trim line",
        quantity: "2",
        unit_price: "0.10",
      },
    ],
    p_reason: "Integrated exact pricing",
  });
  await denied("BDM", "get_quotation_version", {
    p_project: project,
    p_version: quotation,
  });
  await call("DESIGNER", "submit_quotation", {
    p_version: quotation,
    p_expected_version: 2,
    p_remarks: "Integrated review",
  });
  await call("LEAD", "review_quotation", {
    p_version: quotation,
    p_expected_version: 3,
    p_decision: "Approved",
    p_remarks: "Reviewed exact pricing",
  });
  const q = await call("BDM", "get_quotation_version", {
    p_project: project,
    p_version: quotation,
  });
  assert.equal(q.total, "0.21");
  const snapshot = (
    await rows("LEAD", "quotation_versions", "id", quotation)
  )[0].snapshot;
  const money = (actor, kind, amount, version) =>
    call(actor, "set_financial_value", {
      p_project: project,
      p_kind: kind,
      p_amount: amount,
      p_expected_version: version,
      p_reason: "Authorized financial record",
    });
  await money("BDM", "Sale", "100.10", 0);
  await money("LEAD", "Raw", "40.05", 0);
  await denied("OTHER_BDM", "close_project_sale", {
    p_project: project,
    p_expected_stage: "For Quotation",
    p_sale_version: 1,
    p_primary_ops: ids.OPS,
    p_confirm: true,
    p_reason: "",
  });
  await call("LEAD", "transition_commercial_stage", {
    p_project: project,
    p_expected_stage: "For Quotation",
    p_target: "Under Negotiation",
    p_reason: "Release to BDM",
    p_confirm: true,
  });
  await call("BDM", "close_project_sale", {
    p_project: project,
    p_expected_stage: "Under Negotiation",
    p_sale_version: 1,
    p_primary_ops: ids.OPS,
    p_confirm: true,
    p_reason: "Client confirmed the agreed price",
  });
  await call("LEAD", "handoff_closed_project", {
    p_project: project,
    p_primary_ops: ids.OPS,
    p_reason: "Lead-approved Operations handoff",
    p_confirm: true,
  });
  assert.equal(
    (await rows("LEAD", "spaces", "id", space))[0].status,
    "Submitted",
  ); // closure without design completion or settled balances
  const handoff = await call("OPS", "get_commercial_handoff", {
    p_project: project,
  });
  const install = (
    actor,
    version,
    status,
    date = null,
    reason = "Integrated installation",
  ) =>
    call(actor, "save_installation", {
      p_space: space,
      p_project: project,
      p_version: version,
      p_status: status,
      p_date: date,
      p_reason: reason,
      p_override: false,
    });
  await denied(
    "OPS",
    "save_installation",
    {
      p_space: space,
      p_project: project,
      p_version: 0,
      p_status: "Not Applicable",
      p_date: null,
      p_reason: "Exception",
      p_override: false,
    },
    "HANDOFF_REQUIRED",
  );
  await denied("LEAD", "acknowledge_handoff", {
    p_project: project,
    p_handoff: handoff.current.id,
    p_version: 1,
    p_confirm: true,
  });
  await call("OPS", "acknowledge_handoff", {
    p_project: project,
    p_handoff: handoff.current.id,
    p_version: 1,
    p_confirm: true,
  });
  await call("OPS", "save_supplier", {
    p_id: supplier,
    p_version: 0,
    p_data: {
      name: `4D Supplier ${supplier}`,
      contact_details: "4D private contact sentinel",
      brand: "Stosa",
      active: true,
    },
    p_reason: "Integrated supplier",
  });
  const logistic = (version, status) =>
    call("OPS", "save_logistics", {
      p_id: logistics,
      p_project: project,
      p_version: version,
      p_supplier: supplier,
      p_data: {
        status,
        brand: "Stosa",
        reference: "Integrated order",
        remarks: "External payment request monitoring",
      },
      p_reason: "Integrated forward transition",
      p_override: false,
    });
  await logistic(0, "RFP");
  await logistic(1, "For Manufacturing");
  await install("DESIGNER", 0, "Scheduled", "2026-11-01");
  await design("Completed", 3, "LEAD");
  const originalCompletion = (await rows("LEAD", "spaces", "id", space))[0]
    .first_completed_at;
  await design("For Revision", 4, "LEAD");
  await design("In Progress", 5);
  await design("Submitted", 6);
  await design("Completed", 7, "LEAD");
  assert.equal(
    (await rows("LEAD", "spaces", "id", space))[0].first_completed_at,
    originalCompletion,
  );
  assert.equal(
    (await rows("LEAD", "quotation_versions", "id", quotation))[0].snapshot
      .project_total,
    snapshot.project_total,
  );
  const pay = (actor, id, kind, version, amount, intent = "save") =>
    call(actor, "mutate_payment", {
      p_id: id,
      p_project: project,
      p_kind: kind,
      p_expected_version: version,
      p_intent: intent,
      p_data:
        intent === "void"
          ? {}
          : {
              payment_date: "2026-10-14",
              amount,
              method: "Bank transfer",
              reference: "4D receipt",
              remarks: "Integrated staging payment",
            },
      p_reason: "Integrated financial correction",
    });
  const clientPayment = randomUUID(),
    supplierPayment = randomUUID();
  await pay("OPS", clientPayment, "client", 0, "0.10");
  await pay("OPS", supplierPayment, "supplier", 0, "0.20");
  await pay("OPS", clientPayment, "client", 1, "0.15");
  await pay("OPS", supplierPayment, "supplier", 1, "0", "void");
  const finance = () =>
    call("LEAD", "get_project_financials", { p_project: project });
  const f = await finance();
  assert.equal(f.sale.amount, "100.10");
  assert.equal(f.raw.amount, "40.05");
  assert.equal(f.client_payments.outstanding, "99.95");
  assert.equal(f.supplier_payments.outstanding, "40.05");
  const readiness = () =>
    call("LEAD", "operational_readiness", { p_project: project });
  let ready = await readiness();
  assert.ok(ready.blockers.some((b) => b.kind === "installation"));
  assert.ok(ready.blockers.some((b) => b.kind === "logistics"));
  assert.ok(!ready.blockers.some((b) => b.id === cancelled));
  const complete = (r, actor = "LEAD") =>
    call(actor, "complete_operations", {
      p_project: project,
      p_version: r.version,
      p_cycle: r.cycle,
      p_confirm: true,
      p_reason: "Integrated prerequisite review",
    });
  await denied(
    "LEAD",
    "complete_operations",
    {
      p_project: project,
      p_version: ready.version,
      p_cycle: ready.cycle,
      p_confirm: true,
      p_reason: "Premature",
    },
    "OPERATIONAL_PREREQUISITES",
  );
  const control = (action, r) =>
    call("LEAD", "control_project", {
      p_project: project,
      p_version: r.version,
      p_action: action,
      p_reason: "Integrated lifecycle control",
    });
  await control("Hold", ready);
  await denied(
    "DESIGNER",
    "save_installation",
    {
      p_space: space,
      p_project: project,
      p_version: 1,
      p_status: "In Progress",
      p_date: "2026-11-01",
      p_reason: "Held",
      p_override: false,
    },
    "PROJECT_HELD",
  );
  assert.deepEqual(await finance(), f);
  await control("Resume", await readiness());
  await logistic(2, "Delivered");
  assert.equal(
    (await rows("BDM", "space_installations", "space_id", space))[0].status,
    "Scheduled",
  );
  assert.equal((await readiness()).ready, false);
  await install("DESIGNER", 1, "In Progress", "2026-11-01");
  await install("DESIGNER", 2, "Completed", "2026-11-01");
  ready = await readiness();
  assert.equal(ready.ready, true);
  const args = {
    p_project: project,
    p_version: ready.version,
    p_cycle: ready.cycle,
    p_confirm: true,
    p_reason: "Integrated prerequisite review",
  };
  const completed = await Promise.all([
    clients.LEAD.rpc("complete_operations", args),
    clients.LEAD.rpc("complete_operations", args),
  ]);
  assert.equal(completed.filter((r) => !r.error).length, 1);
  assert.deepEqual(await finance(), f);
  assert.equal(
    (await rows("BDM", "projects", "id", project))[0]
      .is_operationally_completed,
    true,
  );
  const history = (
    await rows("BDM", "operational_completions", "project_id", project)
  )[0];
  assert.ok(history.completed_at);
  assert.equal(history.snapshot.spaces.length, 1);
  const noticesAfter = await rows(
    "BDM",
    "notifications",
    "project_id",
    project,
  );
  await denied(
    "LEAD",
    "complete_operations",
    args,
    "PROJECT_ALREADY_COMPLETED",
  );
  assert.equal(
    (await rows("BDM", "notifications", "project_id", project)).length,
    noticesAfter.length,
  );
  await pay("OPS", clientPayment, "client", 2, "0.20");
  await pay("OPS", clientPayment, "client", 3, "0", "void");
  assert.equal((await finance()).client_payments.outstanding, "100.10");
  await control("Reopen", await readiness());
  assert.equal(
    (await rows("LEAD", "spaces", "id", space))[0].status,
    "Completed",
  );
  assert.equal(
    (await rows("BDM", "space_installations", "space_id", space))[0].status,
    "Completed",
  );
  await install(
    "DESIGNER",
    3,
    "In Progress",
    "2026-11-01",
    "Documented rework",
  );
  assert.equal((await readiness()).ready, false);
  await install("DESIGNER", 4, "Completed", "2026-11-01");
  await complete(await readiness(), "ADMIN");
  const histories = await rows(
    "BDM",
    "operational_completions",
    "project_id",
    project,
  );
  assert.equal(histories.length, 2);
  assert.deepEqual(
    histories.find((c) => c.cycle_number === 1),
    history,
  );
  assert.equal(
    histories.find((c) => c.cycle_number === 2).administrative_override,
    true,
  );
  assert.deepEqual(
    (await rows("LEAD", "quotation_versions", "id", quotation))[0].snapshot,
    snapshot,
  );
  for (const actor of ["OTHER_BDM", "UNASSIGNED"])
    for (const table of [
      "spaces",
      "space_installations",
      "installation_events",
      "project_logistics",
      "logistics_events",
      "operational_completions",
      "quotation_versions",
      "project_payments",
      "project_activities",
    ]) {
      assert.deepEqual(await rows(actor, table, "project_id", project), []);
    }
  for (const actor of ["OPS", "DESIGNER"]) {
    const data = await call(actor, "get_project_financials", {
      p_project: project,
    });
    if (actor === "OPS") {
      assert.equal(data.sale, undefined);
      assert.equal(data.approved_quotation, undefined);
    } else {
      assert.equal(data.raw, undefined);
      assert.equal(data.sale.editable, false);
    }
  }
  assert.deepEqual(
    await rows("OPS", "quotation_versions", "project_id", project),
    [],
  );
  assert.equal(
    (
      await clients.OPS.storage
        .from(files[0].bucket)
        .createSignedUrl(files[0].object_path, 60)
    ).data,
    null,
  );
  assert.equal(
    (
      await clients.UNASSIGNED.storage
        .from(files[0].bucket)
        .download(files[0].object_path)
    ).data,
    null,
  );
  // Administrative APIs cannot mutate historical tables even with an authenticated Admin session.
  for (const table of [
    "operational_completions",
    "installation_events",
    "logistics_events",
    "audit_events",
  ]) {
    const r = await clients.ADMIN.from(table)
      .delete()
      .eq("project_id", project);
    assert.ok(r.error);
  }
  const fresh = await clients.DESIGNER.auth.refreshSession();
  assert.equal(fresh.error, null);
  assert.equal((await rows("DESIGNER", "spaces", "id", space)).length, 1);
  // Verify deactivation against the existing JWT, then restore in finally.
  const access = (active) =>
    call("ADMIN", "update_user_access", {
      p_user: ids.DESIGNER,
      p_role: "designer",
      p_active: active,
      p_name: "Staging DESIGNER",
      p_reason: "4D dedicated test-account revocation",
    });
  try {
    await access(false);
    assert.deepEqual(
      await rows("DESIGNER", "space_installations", "project_id", project),
      [],
    );
    await denied("DESIGNER", "operational_readiness", { p_project: project });
    assert.equal(
      (
        await clients.DESIGNER.storage
          .from(files[0].bucket)
          .download(files[0].object_path)
      ).data,
      null,
    );
  } finally {
    await access(true);
  }
  for (const [name, query] of Object.entries({
    projects: async () => {
      const r = await clients.LEAD.from("projects")
        .select(
          "id,reference,name,lead_designer_id,commercial_status,expected_handoff,created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(0, 24);
      assert.equal(r.error, null);
      return r.data;
    },
    spaces: () => rows("LEAD", "spaces", "project_id", project),
    finance,
    timeline: () => call("LEAD", "project_timeline", { p_project: project }),
  })) {
    timings[name] = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const data = await query();
      timings[name].push(Math.round(performance.now() - start));
      assert.ok(data);
    }
  }
  const timeline = await call("BDM", "project_timeline", {
    p_project: project,
  });
  assert.ok(JSON.stringify(timeline).includes("Installation"));
  assert.ok(!JSON.stringify(timeline).includes("4D private contact sentinel"));
  const audit = await rows("ADMIN", "audit_events", "project_id", project);
  assert.equal(
    audit.filter((e) => e.action === "project.operationally_completed").length,
    2,
  );
  // Safe IDs/measurements only, never passwords, sessions, keys or signed URLs.
  console.log(
    JSON.stringify({
      project,
      lead,
      space,
      cancelled,
      quotation,
      supplier,
      logistics,
      name: payload.project_name,
      notes: payload.notes,
      links,
      clientPayment,
      supplierPayment,
      timings,
      cycles: 2,
      approvedTotal: "0.21",
      sale: "100.10",
      raw: "40.05",
    }),
  );
} finally {
  for (const c of Object.values(clients))
    await c.auth.signOut({ scope: "local" });
}
