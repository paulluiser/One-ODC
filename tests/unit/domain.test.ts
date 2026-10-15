import { describe, expect, it } from "vitest";
import {
  calendarDays,
  designProgress,
  installationProgress,
  type Space,
} from "../../src/lib/domain";
describe("PRD progress and aging invariants", () => {
  const spaces: Space[] = [
    { status: "Completed", installation: "Completed", cancelled: false },
    { status: "In Progress", installation: "Not Applicable", cancelled: false },
    { status: "Completed", installation: "In Progress", cancelled: true },
  ];
  it("excludes cancelled spaces from equal-weighted design completion", () => {
    expect(designProgress(spaces)).toBe(50);
  });
  it("excludes cancelled and not-applicable installations", () => {
    expect(installationProgress(spaces)).toBe(100);
  });
  it("reports N/A when no spaces are eligible", () => {
    expect(designProgress([])).toBeNull();
    expect(installationProgress([spaces[1], spaces[2]])).toBeNull();
  });
  it("does not infer installation completion from design completion", () => {
    expect(
      installationProgress([
        { status: "Completed", installation: "Scheduled", cancelled: false },
      ]),
    ).toBe(0);
  });
  it("uses calendar date boundaries and day zero", () => {
    expect(calendarDays("2026-10-13", "2026-10-13")).toBe(0);
    expect(calendarDays("2026-10-11", "2026-10-13")).toBe(2);
    expect(calendarDays("2026-10-20", "2026-10-13")).toBe(0);
    expect(calendarDays("2024-02-28", "2024-03-01")).toBe(2);
  });
  it("rejects impossible date boundaries", () => {
    expect(() => calendarDays("2026-02-30", "2026-03-01")).toThrow();
  });
});
