import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { RebuildRoleDashboard } from "../../src/components/ui-r0/role-dashboard";
import { RebuildAnalytics } from "../../src/components/ui-r0/analytics";
import { dashboardMetrics, type DashboardData } from "../../src/lib/dashboard";
import { analyticsFilters, type AnalyticsData } from "../../src/lib/analytics";
import type { Profile } from "../../src/lib/phase1";
import { DashboardLoading } from "../../src/components/ui-r0/loading";
it("announces Analytics loading without business values", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardLoading, { destination: "analytics" }),
  );
  expect(html).toContain('aria-label="Loading analytics"');
  expect(html).toContain("Loading project analytics");
  expect(html).not.toContain("PHP");
});
const roles = [
  "system_administrator",
  "designer",
  "bdm",
  "operations_admin",
] as const;
for (const role of roles)
  it(`${role}: authorized responsibilities, real empty state and permission feedback`, () => {
    const data: DashboardData = {
      role,
      as_of: "2026-10-15T00:00:00Z",
      timezone: "Asia/Manila",
      metrics: Object.fromEntries(
        dashboardMetrics[role].map((m) => [
          m.key,
          { count: 2, amount: m.currency ? "123456789.12" : null },
        ]),
      ),
      view: "",
      page: 1,
      records: [],
      actions: [],
      recent: [],
      workload: [],
      workload_count: 0,
      unread: 0,
    };
    const profile = { role, display_name: "Test<script> Person" } as Profile;
    const html = renderToStaticMarkup(
      createElement(RebuildRoleDashboard, { data, profile, restricted: true }),
    );
    expect(html).toContain("All clear");
    expect(html).toContain("Your role does not permit access");
    expect(html).toContain("Test&lt;script&gt;");
    expect(html).not.toContain("view=raw");
    if (role === "bdm") expect(html).toContain("123,456,789.12");
    else expect(html).not.toContain("123,456,789.12");
    if (role === "operations_admin")
      expect(html).toContain("Logistics progression");
  });
for (const role of [...roles, "lead_designer"] as const)
  it(`${role}: analytics financial isolation and accessible chart drilldowns`, () => {
    const data: AnalyticsData = {
      role,
      as_of: "2026-10-15T00:00:00Z",
      metrics: {
        active_projects: { count: 3, amount: null },
        sale: { count: 1, amount: "123456789.12" },
        collections: { count: 1, amount: "10.00" },
      },
      groups: [{ key: "projects", bucket: "Closed", count: 3, amount: null }],
      records: [],
      people: [],
      selected_count: 0,
    };
    const filters = analyticsFilters.parse({
      from: "2026-10-01",
      to: "2026-10-15",
      view: "projects",
    });
    const html = renderToStaticMarkup(
      createElement(RebuildAnalytics, { data, filters }),
    );
    expect(html).toContain('aria-label="Closed: 3 matching records"');
    expect(html).toContain("bucket=Closed");
    expect(html).toContain('aria-label="Current project stage"');
    expect(html).toContain('aria-label="Assigned stakeholder"');
    expect(html).toContain('method="get"');
    expect(html).toContain("Last 30 days");
    const recoveryHtml = renderToStaticMarkup(
      createElement(RebuildAnalytics, {
        data,
        filters,
        recovery: {
          values: { from: "2025-02-30" },
          errors: { from: "Choose a valid calendar date." },
        },
      }),
    );
    expect(recoveryHtml).toContain("These filters weren’t applied.");
    expect(recoveryHtml).toContain('aria-label="Analytics KPIs"');
    expect(recoveryHtml).toContain('id="analytics-from-error"');
    expect(html).toContain("No matching records");
    expect(html).not.toContain("view=raw");
    if (["designer", "operations_admin"].includes(role))
      expect(html).not.toContain("123,456,789.12");
    else expect(html).toContain("123,456,789.12");
    if (role === "operations_admin") expect(html).toContain('disabled=""');
  });
