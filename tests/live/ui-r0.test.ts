import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { dashboardSchema } from "../../src/lib/dashboard";
import { calendarEventSchema } from "../../src/lib/calendar";

// Read-only acceptance: existing staging identities, no service key or fixture writes.
const roles = {
  ADMIN: "system_administrator",
  LEAD: "lead_designer",
  DESIGNER: "designer",
  BDM: "bdm",
  OPS: "operations_admin",
  UNASSIGNED: "designer",
  OTHER_BDM: "bdm",
} as const;
for (const [account, role] of Object.entries(roles)) {
  it(`UI-R0 authenticated data contract: ${account}`, async () => {
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
      email: env[`ONE_ODC_TEST_${account}_EMAIL`]!,
      password: env[`ONE_ODC_TEST_${account}_PASSWORD`]!,
    });
    expect(login.error).toBeNull();
    const result = await client.rpc("role_dashboard", {
      p_view: "",
      p_page: 1,
    });
    expect(result.error).toBeNull();
    const dashboard = dashboardSchema.parse(result.data);
    expect(dashboard.role).toBe(role);
    const projects = await client
      .from("projects")
      .select("id,is_cancelled,is_operationally_completed");
    expect(projects.error).toBeNull();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
    }).format(new Date());
    const dates = await client.rpc("workspace_calendar", {
      p_from: today,
      p_to: today,
    });
    expect(dates.error).toBeNull();
    const calendar = calendarEventSchema.array().parse(dates.data);
    if (account === "LEAD") {
      const active = projects.data!.filter(
        (p) => !p.is_cancelled && !p.is_operationally_completed,
      );
      expect(dashboard.metrics.active_projects.count).toBe(active.length);
      for (const key of [
        "active_projects",
        "attention_spaces",
        "quotation_reviews",
        "overdue_projects",
      ]) {
        const drilldown = await client.rpc("role_dashboard", {
          p_view: key,
          p_page: 1,
        });
        expect(drilldown.error).toBeNull();
        const parsed = dashboardSchema.parse(drilldown.data);
        expect(parsed.view).toBe(key);
        expect(parsed.records.length).toBe(
          Math.min(25, parsed.metrics[key].count),
        );
      }
    }
    if (["UNASSIGNED", "OTHER_BDM"].includes(account)) {
      // These long-lived identities may have authorized synthetic assignments.
      // Assert relationship-based isolation rather than a permanently empty account.
      const memberships = await client
        .from("project_memberships")
        .select("project_id")
        .eq("user_id", login.data.user!.id);
      expect(memberships.error).toBeNull();
      const authorized = new Set(
        (memberships.data ?? []).map((m) => m.project_id),
      );
      expect(projects.data!.every((p) => authorized.has(p.id))).toBe(true);
      expect(
        calendar
          .filter((e) => e.href?.startsWith("/dashboard/projects/"))
          .every((e) => authorized.has(e.href!.split("/")[3].split(/[?#]/)[0])),
      ).toBe(true);
    }
    if (account === "OPS") {
      expect(calendar.some((e) => e.kind === "Lead requested date")).toBe(
        false,
      );
      const quotations = await client.from("quotation_versions").select("id");
      expect(quotations.error).toBeNull();
      expect(quotations.data).toEqual([]);
    }
    if (account === "BDM") {
      const versions = await client.from("quotation_versions").select("state");
      expect(versions.error).toBeNull();
      expect(versions.data!.every((v) => v.state === "Approved")).toBe(true);
    }
    await client.auth.signOut({ scope: "local" });
  });
}
