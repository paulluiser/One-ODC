import { describe, it, expect } from "vitest";
import {
  projectDirectoryRow,
  visibleDirectoryColumns,
  directoryDate,
} from "../../src/lib/project-directory-view";
import type { Monitoring } from "../../src/lib/monitoring";
const project: Parameters<typeof projectDirectoryRow>[0] = {
  id: "10000000-0000-4000-8000-000000000001",
  reference: "ODC-2026-1",
  name: "Client residence",
  lead_designer_id: "10000000-0000-4000-8000-000000000002",
  commercial_status: "Closed",
  awaiting_handoff: false,
  expected_handoff: "2026-11-03",
  created_at: "2026-10-18T00:00:00Z",
};
const monitoring: Monitoring = {
  project_id: project.id,
  timezone: "Asia/Manila",
  deadline: "2026-11-01",
  original_deadline: "2026-11-01",
  state: "Active",
  version: 1,
  cancelled_at: null,
  created_at: project.created_at,
  space_refs: [],
  active_spaces: 4,
  completed_spaces: 0,
  last_progress_at: "2026-10-18T00:00:00Z",
  cycles: [
    {
      number: 1,
      started_at: project.created_at,
      ended_at: null,
      outcome: null,
    },
  ],
  holds: [],
};
describe("compact project directory data", () => {
  it("keeps true zero progress distinct from unavailable or empty scope", () => {
    expect(projectDirectoryRow(project, monitoring, false).progress).toBe(0);
    expect(
      projectDirectoryRow(project, { ...monitoring, active_spaces: 0 }, false)
        .progress,
    ).toBeNull();
    expect(projectDirectoryRow(project, undefined, false).progress).toBeNull();
    expect(
      projectDirectoryRow(
        project,
        { ...monitoring, completed_spaces: 1 },
        false,
      ).progress,
    ).toBe(25);
  });
  it("does not send restricted operational-preview details to list clients", () => {
    const row = projectDirectoryRow(
      { ...project, commercial_status: "For Quotation" },
      monitoring,
      true,
      "Private designer",
    );
    expect(row.operations).toBe("Restricted preview");
    expect(row.progress).toBeNull();
    expect([row.deadline, row.attention, row.handoff]).toEqual([
      "Restricted",
      "Restricted",
      "Restricted",
    ]);
    expect(JSON.stringify(row)).not.toContain("Private designer");
    expect(
      projectDirectoryRow(
        { ...project, awaiting_handoff: true },
        monitoring,
        true,
      ).progress,
    ).toBeNull();
  });
  it("separates commercial and operational status without inventing logistics stages", () => {
    expect(
      projectDirectoryRow(
        { ...project, commercial_status: "For Quotation" },
        monitoring,
        false,
      ).operations,
    ).toBe("Not released");
    expect(
      projectDirectoryRow(
        { ...project, awaiting_handoff: true },
        monitoring,
        false,
      ).operations,
    ).toBe("Awaiting Handoff");
    expect(
      projectDirectoryRow(
        { ...project, is_operationally_completed: true },
        monitoring,
        false,
      ).operations,
    ).toBe("Operationally Completed");
    const lost = projectDirectoryRow(
      { ...project, commercial_status: "Lost" },
      monitoring,
      false,
    );
    expect(lost.operations).toBe("Not available");
    expect(lost.attention).toBe("—");
  });
  it("normalizes column URLs and always retains project identity", () => {
    expect(visibleDirectoryColumns()).toHaveLength(7);
    expect(visibleDirectoryColumns()).not.toContain("handoff");
    expect(visibleDirectoryColumns("handoff,garbage,stage,stage")).toEqual([
      "project",
      "stage",
      "handoff",
    ]);
    expect(visibleDirectoryColumns("")).toEqual(["project"]);
  });
  it("formats dates without local timezone drift or invented deadlines", () => {
    expect(directoryDate("2026-11-03")).toBe("03 Nov 2026");
    expect(directoryDate(null)).toBe("Not scheduled");
    expect(directoryDate("invalid")).toBe("Not scheduled");
  });
});
