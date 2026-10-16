import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import {
  analyticsSchema,
  defaultAnalyticsRange,
} from "../../src/lib/analytics";
import { dashboardSchema } from "../../src/lib/dashboard";
import { dashboardPrimary } from "../../src/lib/workspace-presentation";
const actors = {
  ADMIN: "system_administrator",
  LEAD: "lead_designer",
  DESIGNER: "designer",
  BDM: "bdm",
  OPS: "operations_admin",
  OTHER_BDM: "bdm",
  UNASSIGNED: "designer",
} as const;
for (const [actor, role] of Object.entries(actors))
  it(`UI-R1 read-only dashboard and analytics isolation: ${actor}`, async () => {
    process.loadEnvFile(".env.verification");
    const env = process.env;
    if (
      env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
      new URL(env.ONE_ODC_TEST_URL!).hostname !==
        "jlvlwkryasoducuucvxk.supabase.co"
    )
      throw Error("Staging only");
    const client = createClient(
      env.ONE_ODC_TEST_URL!,
      env.ONE_ODC_TEST_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const login = await client.auth.signInWithPassword({
      email: env[`ONE_ODC_TEST_${actor}_EMAIL`]!,
      password: env[`ONE_ODC_TEST_${actor}_PASSWORD`]!,
    });
    expect(login.error).toBeNull();
    try {
      const range = defaultAnalyticsRange();
      const args = {
        p_from: range.from,
        p_to: range.to,
        p_stage: "",
        p_brand: "",
        p_stakeholder: null,
        p_view: "",
        p_bucket: "",
        p_page: 1,
      };
      const result = await client.rpc("project_analytics", args);
      expect(result.error).toBeNull();
      const data = analyticsSchema.parse(result.data);
      expect(data.role).toBe(role);
      expect(
        Object.keys(data.metrics).some((k) => k.toLowerCase().includes("raw")),
      ).toBe(false);
      const lifecycleTotal = data.groups
        .filter((g) => g.key === "projects")
        .reduce((s, g) => s + g.count, 0);
      const lifecycle = await client.rpc("project_analytics", {
        ...args,
        p_view: "projects",
      });
      expect(lifecycle.error).toBeNull();
      expect(analyticsSchema.parse(lifecycle.data).selected_count).toBe(
        lifecycleTotal,
      );
      if (["DESIGNER", "OPS"].includes(actor)) {
        expect(data.metrics.sale).toBeUndefined();
        expect(data.metrics.collections).toBeUndefined();
        const restricted = await client.rpc("project_analytics", {
          ...args,
          p_view: "sale",
        });
        expect(restricted.error).toBeNull();
        expect(analyticsSchema.parse(restricted.data).records).toEqual([]);
      }
      if (["OTHER_BDM", "UNASSIGNED"].includes(actor)) {
        const memberships = await client
          .from("project_memberships")
          .select("project_id")
          .eq("user_id", login.data.user!.id);
        expect(memberships.error).toBeNull();
        const authorized = new Set(
          (memberships.data ?? []).map((m) => m.project_id),
        );
        expect(lifecycleTotal).toBeLessThanOrEqual(authorized.size);
        expect(
          analyticsSchema
            .parse(lifecycle.data)
            .records.every((r) =>
              authorized.has(r.href.split("/")[3].split(/[?#]/)[0]),
            ),
        ).toBe(true);
        if (!authorized.size) expect(data.records).toEqual([]);
      }
      for (const key of dashboardPrimary[role]) {
        const d = await client.rpc("role_dashboard", {
          p_view: key,
          p_page: 1,
        });
        expect(d.error).toBeNull();
        const parsed = dashboardSchema.parse(d.data);
        expect(parsed.role).toBe(role);
        expect(parsed.view).toBe(key);
        expect(parsed.records.length).toBe(
          Math.min(25, parsed.metrics[key]?.count ?? 0),
        );
      }
      const filtered = await client.rpc("project_analytics", {
        ...args,
        p_stage: "For Quotation",
        p_view: "projects",
      });
      expect(filtered.error).toBeNull();
      if (actor === "OPS")
        expect(analyticsSchema.parse(filtered.data).selected_count).toBe(0);
    } finally {
      await client.auth.signOut({ scope: "local" });
    }
  });
