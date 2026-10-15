import { expect, it } from "vitest";
import {
  dashboardMetrics,
  dashboardOptions,
  dashboardUrl,
} from "../../src/lib/dashboard";
it("validates role-specific drilldowns and bounded pages", () => {
  expect(dashboardOptions("operations_admin", "sale", "-2")).toEqual({
    view: "",
    page: 1,
  });
  expect(dashboardOptions("bdm", "sale", "999999")).toEqual({
    view: "sale",
    page: 100000,
  });
  expect(dashboardUrl("logistics:For Delivery", 2)).toBe(
    "/dashboard?view=logistics%3AFor+Delivery&page=2",
  );
});
it("defines unique metric keys and explicit formulas for all five roles", () => {
  for (const metrics of Object.values(dashboardMetrics)) {
    expect(new Set(metrics.map((m) => m.key)).size).toBe(metrics.length);
    expect(metrics.every((m) => m.definition.length > 25)).toBe(true);
  }
  expect(dashboardMetrics.operations_admin.some((m) => m.key === "sale")).toBe(
    false,
  );
  expect(dashboardMetrics.designer.some((m) => m.currency)).toBe(false);
});
