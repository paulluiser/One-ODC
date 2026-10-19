import { mergePendingToolbarValues } from "../../src/lib/filter-toolbar";
import { describe, it, expect } from "vitest";
import {
  installationProgress,
  outstandingItems,
} from "../../src/lib/operations-workspace";
describe("Unified operational summaries", () => {
  it("deduplicates a Space blocked by both design and installation, retaining separate logistics", () => {
    expect(
      outstandingItems([
        { kind: "design", id: "a", label: "Design" },
        { kind: "installation", id: "a", label: "Install" },
        { kind: "logistics", id: "a", label: "Shipping" },
        { kind: "handoff", label: "Acknowledge" },
      ]),
    ).toHaveLength(3);
  });
  it("counts Completed and Not Applicable equally and excludes cancelled Spaces", () => {
    expect(
      installationProgress(
        [
          { id: "a", cancelled_at: null },
          { id: "b", cancelled_at: null },
          { id: "c", cancelled_at: "2026-10-18" },
        ],
        [
          { space_id: "a", status: "Completed" },
          { space_id: "b", status: "Not Applicable" },
        ],
      ),
    ).toEqual({ total: 2, satisfied: 2, percent: 100 });
  });
  it("keeps missing records outstanding and distinguishes unavailable from zero", () => {
    expect(installationProgress([], []).percent).toBeNull();
    expect(installationProgress([{ id: "a", cancelled_at: null }], [])).toEqual(
      { total: 1, satisfied: 0, percent: 0 },
    );
  });
});

it("sort and search do not resurrect filters while a clear navigation is pending", () => {
  expect(
    mergePendingToolbarValues(
      { status: "Completed", sort: "created", q: "Kitchen" },
      { status: "", sort: "created", q: "Kitchen" },
      { status: "Completed", sort: "name", q: "" },
    ),
  ).toEqual({ status: "", sort: "name", q: "" });
});
