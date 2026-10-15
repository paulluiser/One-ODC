import { describe, expect, it } from "vitest";
import {
  localDate,
  elapsed,
  overdue,
  progressLabel,
  risk,
  projectMetrics,
  projectWorkState,
  type Monitoring,
} from "../../src/lib/monitoring";
describe("Monitoring calendar and risk rules", () => {
  it("weights current active completions equally and reports no-space N/A", () => {
    expect(progressLabel(3, 2)).toBe("66.7%");
    expect(progressLabel(0, 0)).toBe("Not Available");
    expect(progressLabel(3, 1)).toBe("33.3%");
  });
  it("uses Manila midnight boundaries and day zero instead of duration division", () => {
    expect(localDate("2026-10-13T15:59:59Z")).toBe("2026-10-13");
    expect(localDate("2026-10-13T16:00:00Z")).toBe("2026-10-14");
    expect(
      elapsed("2026-10-13T15:59:59Z", "2026-10-13T16:00:00Z", "Asia/Manila"),
    ).toBe(1);
    expect(
      elapsed("2026-10-13T01:00:00Z", "2026-10-13T15:00:00Z", "Asia/Manila"),
    ).toBe(0);
  });
  it("handles configured timezones and DST using calendar dates", () => {
    expect(
      elapsed(
        "2026-03-08T05:00:00Z",
        "2026-03-09T04:00:00Z",
        "America/New_York",
      ),
    ).toBe(1);
    expect(overdue("2026-10-14", "2026-10-13T16:00:00Z", "Asia/Manila")).toBe(
      0,
    );
    expect(elapsed(null, "2026-10-13T16:00:00Z", "UTC")).toBeNull();
  });
  it("centralizes approaching/stalled rules and suppresses active risks for resolved work", () => {
    const p = {
      deadline: "2026-10-16",
      lastProgress: "2026-10-13T00:00:00Z",
      resolved: false,
      now: "2026-10-13T01:00:00Z",
      timezone: "Asia/Manila",
    };
    expect(risk(p)).toBe("At Risk");
    expect(risk({ ...p, deadline: "2026-10-17" })).toBe("On Track");
    expect(risk({ ...p, deadline: null, lastProgress: "2026-10-06" })).toBe(
      "At Risk",
    );
    expect(risk({ ...p, deadline: "2026-10-12" })).toBe("Overdue");
    expect(risk({ ...p, deadline: "2026-10-12", resolved: true })).toBe(
      "On Track",
    );
  });
  it("preserves ended aging, sums holds separately, and tracks reopened cycles independently", () => {
    const m = {
      timezone: "UTC",
      state: "Active",
      deadline: "2026-10-02",
      cancelled_at: null,
      active_spaces: 2,
      completed_spaces: 1,
      last_progress_at: "2026-10-10T00:00:00Z",
      cycles: [
        {
          number: 1,
          started_at: "2026-10-01T00:00:00Z",
          ended_at: "2026-10-05T00:00:00Z",
          outcome: "Completed",
        },
        {
          number: 2,
          started_at: "2026-10-10T00:00:00Z",
          ended_at: null,
          outcome: null,
        },
      ],
      holds: [
        {
          started_at: "2026-10-01T23:59:00Z",
          ended_at: "2026-10-03T00:00:00Z",
        },
      ],
    } as Monitoring;
    const r = projectMetrics(m, "2026-10-13T00:00:00Z");
    expect(r.age).toBe(7);
    expect(r.originalAge).toBe(4);
    expect(r.cycleAge).toBe(3);
    expect(r.hold).toBe(2);
    const ended = {
      ...m,
      state: "Cancelled" as const,
      cancelled_at: "2026-10-12T00:00:00Z",
      cycles: [
        m.cycles[0],
        {
          ...m.cycles[1],
          ended_at: "2026-10-12T00:00:00Z",
          outcome: "Cancelled",
        },
      ],
    };
    expect(projectMetrics(ended, "2026-12-31T00:00:00Z").age).toBe(6);
    expect(projectMetrics(ended, "2026-12-31T00:00:00Z").risk).toBe("On Track");
  });
});

it("labels completed, reopened and later cancelled work without confusing preserved old completions", () => {
  const original = {
    number: 1,
    started_at: "2026-10-01T00:00:00Z",
    ended_at: "2026-10-02T00:00:00Z",
    outcome: "Completed",
  };
  expect(projectWorkState({ state: "Active", cycles: [original] })).toBe(
    "Operationally Completed",
  );
  expect(
    projectWorkState({
      state: "Active",
      cycles: [
        { ...original, number: 2, ended_at: null, outcome: null },
        original,
      ],
    }),
  ).toBe("Active");
  expect(
    projectWorkState({
      state: "Cancelled",
      cycles: [original, { ...original, number: 2, outcome: "Cancelled" }],
    }),
  ).toBe("Cancelled");
  expect(projectWorkState({ state: "Active", cycles: [] })).toBe("Active");
});
