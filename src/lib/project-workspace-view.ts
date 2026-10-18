export const workspaceTabs = [
  "overview",
  "spaces",
  "operations",
  "financials",
  "activity",
  "files",
] as const;
export type WorkspaceTab = (typeof workspaceTabs)[number];
export function workspaceView(query: Record<string, unknown>) {
  const tab = typeof query.tab === "string" ? query.tab : "overview";
  const legacy: Record<string, [WorkspaceTab, string]> = {
    quotation: ["financials", "quotation"],
    finance: ["financials", "finance"],
    installation: ["operations", "installation"],
    logistics: ["operations", "logistics"],
  };
  return legacy[tab]
    ? { tab: legacy[tab][0], section: legacy[tab][1] }
    : {
        tab: workspaceTabs.includes(tab as WorkspaceTab)
          ? (tab as WorkspaceTab)
          : "overview",
        section: typeof query.section === "string" ? query.section : "",
      };
}
export function workspaceUrl(project: string, tab: WorkspaceTab, section = "") {
  return `/dashboard/projects/${project}?${new URLSearchParams({ tab, ...(section ? { section } : {}) })}`;
}
export function readableProjectEvent(
  description: string,
  category = "System Event",
) {
  const raw = description.split(":")[0];
  const labels: Record<string, string> = {
    "project.created": "Project created",
    "project.assignments_changed": "Project assignments changed",
    "project.lead_designer_changed": "Lead Designer changed",
    "space.created": "Space created",
    "project.completed": "Project completed",
    "project.held": "Project placed on hold",
    "project.resumed": "Project resumed",
  };
  return category === "System Event"
    ? labels[raw] ||
        raw.replace(/[._]/g, " ").replace(/^./, (c) => c.toUpperCase())
    : category;
}
