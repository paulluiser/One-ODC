import { describe, expect, it } from "vitest";
import {
  saveSpaceSchema,
  spaceTransitions,
  type Space,
} from "../../src/lib/spaces";
const space = {
  status: "Submitted",
  cancelled_at: null,
  held_status: null,
} as Space;
describe("Space form business contracts", () => {
  it("only offers normal completion to project managers and revision from completion", () => {
    expect(spaceTransitions(space, false, false)).toEqual([]);
    expect(spaceTransitions(space, true, false)).toContain("Completed");
    expect(
      spaceTransitions({ ...space, status: "Completed" }, true, false),
    ).toEqual(["For Revision"]);
  });
  it("resumes a hold to its previous state and never offers changes for cancellation", () => {
    expect(
      spaceTransitions(
        { ...space, status: "On Hold", held_status: "In Progress" },
        false,
        false,
      ),
    ).toEqual(["In Progress"]);
    expect(
      spaceTransitions({ ...space, cancelled_at: "2026-10-13" }, true, true),
    ).toEqual([]);
  });
  it("validates calendar dates, mandatory reasons and distinct assignees", () => {
    const v = {
      id: "30000000-0000-4000-8000-000000000001",
      project: "40000000-0000-4000-8000-000000000001",
      version: 0,
      name: "Kitchen",
      deadline: "2026-11-30",
      primary: "10000000-0000-4000-8000-000000000001",
      support: [],
      reason: "Design scope",
    };
    expect(saveSpaceSchema.safeParse(v).success).toBe(true);
    for (const change of [
      { deadline: "2026-02-30" },
      { reason: " " },
      { support: [v.primary] },
    ])
      expect(saveSpaceSchema.safeParse({ ...v, ...change }).success).toBe(
        false,
      );
  });
});
