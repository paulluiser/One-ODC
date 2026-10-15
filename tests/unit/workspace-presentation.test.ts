import { describe, expect, it } from "vitest";
import { dashboardMetrics } from "../../src/lib/dashboard";
import {
  dashboardPrimary,
  analyticsMetricGroup,
} from "../../src/lib/workspace-presentation";
describe("workspace presentation priorities", () => {
  it("keeps a bounded prominent set of real role metrics, leaving all others available", () => {
    for (const role of Object.keys(
      dashboardPrimary,
    ) as (keyof typeof dashboardPrimary)[]) {
      const priority = dashboardPrimary[role];
      expect(priority.length).toBeGreaterThanOrEqual(3);
      expect(priority.length).toBeLessThanOrEqual(4);
      expect(new Set(priority).size).toBe(priority.length);
      expect(
        priority.every((key) =>
          dashboardMetrics[role].some((m) => m.key === key),
        ),
      ).toBe(true);
    }
  });
  it("does not promote financial data into Designer or Operations dashboards", () => {
    for (const role of ["designer", "operations_admin"] as const) {
      expect(dashboardPrimary[role]).not.toContain("sale");
      expect(dashboardMetrics[role].some((m) => m.currency)).toBe(false);
    }
  });
  it("groups commercial, design and operations statistics without changing keys", () => {
    expect(analyticsMetricGroup("collections")).toBe("Commercial");
    expect(analyticsMetricGroup("spaces")).toBe("Design");
    expect(analyticsMetricGroup("handoffs")).toBe("Operations");
    expect(analyticsMetricGroup("completions")).toBe("Projects");
  });
});
