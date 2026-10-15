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
import { compareQuotations, type Quotation } from "../../src/lib/quotations";
it("staging: frozen quotation snapshots, concurrent submission/review/version creation, correction/comparison and real-JWT isolation", async () => {
  const lead = randomUUID();
  await rpc("BDM", "save_lead", {
    p_id: lead,
    p_expected_version: 0,
    p_payload: {
      project_name: `3B review verification ${lead}`,
      address: `Synthetic ${lead}`,
      brand: "Stosa",
      cabinetry_count: 2,
      notes: "Authorized staging only",
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
  const a = randomUUID(),
    b = randomUUID();
  for (const space of [a, b])
    await rpc("LEAD", "save_space", {
      p_id: space,
      p_project: project,
      p_expected_version: 0,
      p_name: "Kitchen",
      p_deadline: null,
      p_primary: ids.DESIGNER,
      p_support: [],
      p_reason: "Quotation review scope",
    });
  const first = await rpc("DESIGNER", "create_quotation_draft", {
    p_project: project,
  });
  const one = {
    id: randomUUID(),
    description: "Cabinet one",
    quantity: "1",
    unit_price: "0.10",
  };
  const removed = {
    id: randomUUID(),
    description: "Half cent line",
    quantity: "0.005",
    unit_price: "1.00",
  };
  const save = (id: string, space: string, items: unknown[], version: number) =>
    rpc("DESIGNER", "save_quotation_space", {
      p_draft: id,
      p_space: space,
      p_expected_version: version,
      p_items: items,
      p_reason: "Verified staged pricing",
    });
  await save(first, a, [one, removed], 1);
  await save(first, b, [{ ...one, id: randomUUID(), unit_price: "0.20" }], 2);
  const get = (id: string, actor = "LEAD") =>
    rpc(actor, "get_quotation_version", {
      p_project: project,
      p_version: id,
    }) as Promise<Quotation>;
  const submit = (actor: string, id: string, version: number) =>
    clients[actor].rpc("submit_quotation", {
      p_version: id,
      p_expected_version: version,
      p_remarks: "Staging submission",
    });
  const review = (
    actor: string,
    id: string,
    version: number,
    decision: string,
    remarks: string,
  ) =>
    clients[actor].rpc("review_quotation", {
      p_version: id,
      p_expected_version: version,
      p_decision: decision,
      p_remarks: remarks,
    });
  expect((await submit("UNASSIGNED", first, 3)).error?.message).toContain(
    "ACCESS_DENIED",
  );
  const submissions = await Promise.all([
    submit("DESIGNER", first, 3),
    submit("LEAD", first, 3),
  ]);
  expect(submissions.filter((r) => !r.error)).toHaveLength(1);
  expect(submissions.find((r) => r.error)?.error?.message).toContain(
    "VERSION_CONFLICT",
  );
  const frozen = await get(first);
  expect(frozen.state).toBe("Submitted for Review");
  expect(frozen.total).toBe("0.31");
  expect(frozen.spaces).toHaveLength(2);
  expect(frozen.spaces.every((s) => !s.editable)).toBe(true);
  const originalSnapshot = await clients.LEAD.from("quotation_versions")
    .select("snapshot")
    .eq("id", first)
    .single();
  expect(originalSnapshot.error).toBeNull();
  expect(
    (
      await clients.DESIGNER.rpc("save_quotation_space", {
        p_draft: first,
        p_space: a,
        p_expected_version: 4,
        p_items: [],
        p_reason: "Forbidden lock bypass",
      })
    ).error?.message,
  ).toContain("HISTORY_IMMUTABLE");
  expect(
    (await clients.LEAD.rpc("create_quotation_draft", { p_project: project }))
      .error?.message,
  ).toContain("QUOTATION_PENDING_REVIEW");
  expect(
    (await review("DESIGNER", first, 4, "Approved", "Forbidden reviewer")).error
      ?.message,
  ).toContain("ACCESS_DENIED");
  expect(
    (await review("LEAD", first, 4, "Returned for Revision", " ")).error
      ?.message,
  ).toContain("REMARKS_REQUIRED");
  for (const actor of ["BDM", "OPS", "OTHER_BDM"]) {
    expect(
      (
        await clients[actor].rpc("get_quotation_version", {
          p_project: project,
          p_version: first,
        })
      ).error?.message,
    ).toContain("ACCESS_DENIED");
    expect(
      (await review(actor, first, 4, "Approved", "Forbidden reviewer")).error,
    ).not.toBeNull();
    const rows = await clients[actor]
      .from("quotation_versions")
      .select("id,snapshot")
      .eq("project_id", project);
    expect(rows.data).toEqual([]);
  }
  const reviews = await Promise.all([
    review("LEAD", first, 4, "Returned for Revision", "Correct pricing"),
    review(
      "ADMIN",
      first,
      4,
      "Returned for Revision",
      "Audited staging oversight",
    ),
  ]);
  expect(reviews.filter((r) => !r.error)).toHaveLength(1);
  expect(reviews.find((r) => r.error)?.error?.message).toContain(
    "VERSION_CONFLICT",
  );
  await rpc("LEAD", "save_space", {
    p_id: a,
    p_project: project,
    p_expected_version: 1,
    p_name: "Renamed kitchen",
    p_deadline: null,
    p_primary: ids.DESIGNER,
    p_support: [],
    p_reason: "Rename after locked submission",
  });
  const drafts = await Promise.all([
    rpc("DESIGNER", "create_quotation_draft", { p_project: project }),
    rpc("LEAD", "create_quotation_draft", { p_project: project }),
  ]);
  expect(drafts[0]).toBe(drafts[1]);
  const second = drafts[0];
  const corrected = await get(second);
  expect(corrected.number).toBe(2);
  expect(corrected.source_version_id).toBe(first);
  const sourceSpace = frozen.spaces.find((s) => s.id === a)!,
    copied = corrected.spaces.find((s) => s.id === a)!;
  expect(copied.name).toBe("Renamed kitchen");
  expect(copied.items[0].id).not.toBe(sourceSpace.items[0].id);
  expect(copied.items[0].lineage_id).toBe(sourceSpace.items[0].lineage_id);
  await save(
    second,
    a,
    [
      { ...copied.items[0], quantity: "2", unit_price: "0.25" },
      {
        id: randomUUID(),
        description: "New trim",
        quantity: "1",
        unit_price: "0.30",
      },
    ],
    1,
  );
  expect((await submit("LEAD", second, 2)).error).toBeNull();
  expect(
    (await review("LEAD", second, 3, "Approved", "Approved staged quotation"))
      .error,
  ).toBeNull();
  const approved = await get(second);
  expect(approved.total).toBe("1.00");
  const diff = compareQuotations(frozen, approved);
  expect(diff.added).toHaveLength(1);
  expect(diff.removed).toHaveLength(1);
  expect(diff.changed).toHaveLength(1);
  expect(diff.totalDelta).toBe(69n);
  expect(diff.changed[0]).toMatchObject({ quantity: true, price: true });
  expect(
    (
      await clients.LEAD.from("quotation_versions")
        .select("snapshot")
        .eq("id", first)
        .single()
    ).data?.snapshot,
  ).toEqual(originalSnapshot.data?.snapshot);
  expect((await get(first)).spaces.find((s) => s.id === a)?.name).toBe(
    "Kitchen",
  );
  const list = await rpc("BDM", "list_quotation_versions", {
    p_project: project,
  });
  expect(list.map((v: { number: number }) => v.number)).toEqual([2]);
  expect((await get(second, "BDM")).total).toBe("1.00");
  expect(
    (
      await clients.BDM.from("quotation_items")
        .select("id")
        .eq("project_id", project)
    ).data,
  ).toEqual([]);
  expect(
    (
      await clients.BDM.from("quotation_review_events")
        .select("action")
        .eq("project_id", project)
    ).data,
  ).toEqual([{ action: "Approved" }]);
  expect(
    (await clients.OPS.rpc("list_quotation_versions", { p_project: project }))
      .error?.message,
  ).toContain("ACCESS_DENIED");
  expect(
    (
      await clients.LEAD.rpc("get_quotation_version", {
        p_project: randomUUID(),
        p_version: second,
      })
    ).error?.message,
  ).toContain("ACCESS_DENIED");
  expect(
    (
      await clients.ADMIN.from("quotation_versions")
        .update({ snapshot: { total: "999" } })
        .eq("id", second)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await clients.ADMIN.from("quotation_review_events")
        .delete()
        .eq("version_id", second)
    ).error,
  ).not.toBeNull();
  const next = await rpc("DESIGNER", "create_quotation_draft", {
    p_project: project,
  });
  expect((await get(next)).number).toBe(3);
  expect((await get(next)).source_version_id).toBe(second);
  expect((await get(second, "BDM")).total).toBe("1.00");
  expect((await submit("LEAD", next, 1)).error).toBeNull();
  expect(
    (
      await review(
        "LEAD",
        next,
        2,
        "Approved",
        "Second approved staged version",
      )
    ).error,
  ).toBeNull();
  const bdmVersions = await rpc("BDM", "list_quotation_versions", {
    p_project: project,
  });
  expect(bdmVersions.map((v: { number: number }) => v.number)).toEqual([3, 2]);
  const approvedComparison = compareQuotations(
    await get(second, "BDM"),
    await get(next, "BDM"),
  );
  expect(approvedComparison.totalDelta).toBe(0n);
  expect(approvedComparison.added).toEqual([]);
  expect(approvedComparison.removed).toEqual([]);
  const history = await clients.ADMIN.from("audit_events")
    .select("action")
    .eq("project_id", project)
    .eq("entity_type", "quotation");
  expect(
    history.data?.filter((e) => e.action === "quotation.submitted"),
  ).toHaveLength(3);
  expect(
    history.data?.filter((e) => e.action === "quotation.reviewed"),
  ).toHaveLength(3);
  expect(
    history.data?.filter((e) => e.action === "draft_created"),
  ).toHaveLength(3);
});
