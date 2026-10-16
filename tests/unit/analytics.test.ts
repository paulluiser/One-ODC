import { describe, expect, it } from "vitest";
import {
  analyticsFilters,
  analyticsFilterErrors,
  analyticsUrl,
  collectionRate,
  defaultAnalyticsRange,
  rate,
} from "../../src/lib/analytics";
describe("5B analytics contracts", () => {
  it("uses Manila dates and calendar month boundaries", () => {
    expect(defaultAnalyticsRange(new Date("2026-01-31T16:00:00Z"))).toEqual({
      from: "2025-03-01",
      to: "2026-02-01",
    });
  });
  it("rejects invalid calendar dates, reversed/oversized ranges and unsafe filters", () => {
    for (const params of [
      { from: "2025-02-30", to: "2025-03-01" },
      { from: "2025-03-01", to: "2025-02-01" },
      { from: "2020-01-01", to: "2025-01-01" },
      { from: "2025-01-01", to: "2025-03-01", stage: "fake" },
      { from: "2025-01-01", to: "2025-03-01", stakeholder: "fake" },
    ])
      expect(analyticsFilters.safeParse(params).success).toBe(false);
  });
  it("preserves every filter in encoded drilldown/pagination URLs", () => {
    const f = analyticsFilters.parse({
      from: "2025-01-01",
      to: "2025-03-01",
      stage: "On Hold",
      brand: "Stosa",
    });
    const url = new URL(
      analyticsUrl(f, "risk", "At Risk", 2),
      "https://example.test",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      from: f.from,
      to: f.to,
      stage: f.stage,
      brand: f.brand,
      view: "risk",
      bucket: "At Risk",
      page: "2",
    });
  });
  it("provides field-specific errors for invalid date ranges and unsafe parameters", () => {
    expect(
      analyticsFilterErrors({ from: "2025-03-01", to: "2025-02-01" }).to,
    ).toMatch(/on or after/);
    expect(
      analyticsFilterErrors({ from: "2020-01-01", to: "2025-01-01" }).from,
    ).toMatch(/1,095/);
    expect(
      analyticsFilterErrors({ from: "2025-02-30", to: "2025-03-01" }).from,
    ).toMatch(/valid calendar date/);
    expect(
      analyticsFilterErrors({ from: "2025-01-01", to: "2999-01-01" }).to,
    ).toMatch(/later than today/);
    expect(
      analyticsFilterErrors({
        from: ["2025-01-01", "2025-02-01"],
        to: "2025-03-01",
      }).from,
    ).toBeDefined();
    expect(
      analyticsFilterErrors({
        from: "2025-01-01",
        to: "2025-03-01",
        stage: "fake",
        stakeholder: "fake",
        page: "0",
      }),
    ).toMatchObject({
      stage: expect.any(String),
      stakeholder: expect.any(String),
      page: expect.any(String),
    });
  });
  it("accepts inclusive single-day and 1,095-day ranges but rejects a longer range", () => {
    expect(
      analyticsFilters.safeParse({ from: "2025-03-01", to: "2025-03-01" })
        .success,
    ).toBe(true);
    expect(
      analyticsFilters.safeParse({ from: "2022-03-02", to: "2025-03-01" })
        .success,
    ).toBe(true);
    expect(
      analyticsFilters.safeParse({ from: "2022-03-01", to: "2025-03-01" })
        .success,
    ).toBe(false);
  });
  it("distinguishes empty denominators, zero and overcollection without floating-point money", () => {
    expect(rate(0, 0)).toBe("Not Available");
    expect(rate(0, 4)).toBe("0.0%");
    expect(rate(1, 3)).toBe("33.3%");
    expect(collectionRate(null, "100.00")).toBe("Not Available");
    expect(collectionRate("0.00", "0.00")).toBe("Not Available");
    expect(collectionRate("0.00", "100.00")).toBe("0.0%");
    expect(collectionRate("110.00", "100.00")).toBe("110.0%");
    expect(
      collectionRate(
        "33333333333333333333333333.33",
        "99999999999999999999999999.99",
      ),
    ).toBe("33.3%");
  });
});
