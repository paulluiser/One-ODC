import type { Role } from "./domain";
// Presentation priority only. Counts, definitions and authorization stay in their existing services.
export const dashboardPrimary: Record<Role, string[]> = {
  system_administrator: ["active_users", "invitations", "access_alerts"],
  lead_designer: [
    "active_projects",
    "attention_spaces",
    "quotation_reviews",
    "overdue_projects",
  ],
  designer: [
    "assigned_spaces",
    "due_spaces",
    "revision_spaces",
    "overdue_spaces",
  ],
  bdm: [
    "submitted_leads",
    "awaiting_leads",
    "clarification_leads",
    "commercial_opportunities",
  ],
  operations_admin: [
    "operational_projects",
    "handoffs",
    "ops_installations",
    "delayed_logistics",
  ],
};
export function analyticsMetricGroup(key: string) {
  if (
    ["leads", "accepted_leads", "closed", "sale", "collections"].includes(key)
  )
    return "Commercial";
  if (
    [
      "handoffs",
      "outstanding_installations",
      "stalled_logistics",
      "installations",
    ].includes(key)
  )
    return "Operations";
  if (key === "spaces") return "Design";
  return "Projects";
}
