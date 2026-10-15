import { describe, it, expect } from "vitest";
import { workspaceCrumbs } from "../../src/lib/workspace-navigation";
describe("6B.1 workspace location", () => {
  it("keeps navigation within known existing destinations", () => {
    expect(workspaceCrumbs("/dashboard")).toEqual([
      { label: "Workspace", href: "/dashboard" },
    ]);
    expect(workspaceCrumbs("/dashboard/analytics").at(-1)).toEqual({
      label: "Analytics",
      href: "/dashboard/analytics",
    });
    expect(workspaceCrumbs("/dashboard/unknown")).toHaveLength(1);
  });
  it("preserves Project URLs and gives tabs a readable current location", () => {
    const path = "/dashboard/projects/10000000-0000-4000-8000-000000000001";
    expect(workspaceCrumbs(path, "finance").at(-1)).toEqual({
      label: "Financial Management",
      href: `${path}?tab=finance`,
    });
    expect(workspaceCrumbs(path, "not-a-tab").at(-1)).toEqual({
      label: "Overview",
      href: path,
    });
  });
  it("does not mistake a new request for a saved Lead", () => {
    expect(workspaceCrumbs("/dashboard/leads/new").at(-1)?.label).toBe(
      "New request",
    );
    expect(workspaceCrumbs("/dashboard/leads/id").at(-1)?.label).toBe(
      "Lead details",
    );
  });
});
