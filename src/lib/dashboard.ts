import { z } from "zod";
import type { Role } from "./domain";
export type DashboardMetric = {
  key: string;
  label: string;
  definition: string;
  currency?: boolean;
};
const metric = (
  key: string,
  label: string,
  definition: string,
): DashboardMetric => ({ key, label, definition });
export const dashboardMetrics: Record<Role, DashboardMetric[]> = {
  system_administrator: [
    metric(
      "active_users",
      "Active users",
      "Count of One ODC profiles with active access, including accounts awaiting first sign-in.",
    ),
    metric(
      "inactive_users",
      "Inactive users",
      "Count of One ODC profiles with disabled access.",
    ),
    metric(
      "invitations",
      "Pending invitations",
      "Count of provisioned One ODC profiles whose Auth invitation exists and has no recorded sign-in. This does not prove email delivery.",
    ),
    metric(
      "access_alerts",
      "Account access alerts",
      "Count of inactive profiles requiring administrative review; not an inferred security incident.",
    ),
    metric(
      "system_activity",
      "Recent system activity",
      "Count of audit events recorded today and the previous 13 Asia/Manila calendar dates. Audit values and financial details are omitted.",
    ),
  ],
  lead_designer: [
    metric(
      "active_projects",
      "Active assigned projects",
      "Distinct authorized projects with an open operational cycle; cancelled and operationally completed Projects excluded. On Hold remains workload.",
    ),
    metric(
      "overdue_projects",
      "Overdue projects",
      "Active projects where the project deadline or an unfinished active Space deadline is before today in the project timezone.",
    ),
    metric(
      "risk_projects",
      "At-risk projects",
      "Active projects that are not Overdue and have a deadline today through three days ahead or at least seven calendar days without meaningful progress. Uses existing Project/Space risk rules.",
    ),
    metric(
      "attention_spaces",
      "Spaces requiring attention",
      "Active unfinished Spaces Submitted, For Revision, On Hold, due within three days, overdue or stalled seven days. Each Space counted once.",
    ),
    metric(
      "quotation_reviews",
      "Pending quotation reviews",
      "Submitted for Review quotation versions in authorized non-cancelled Projects. One entry per locked version.",
    ),
    metric(
      "recent_completed",
      "Recently completed projects",
      "Distinct authorized Projects whose latest recorded operational completion falls today or the previous 13 dates in the project timezone. Reopened/cancelled Projects retain this historical count and show their current state; they are not treated as currently completed.",
    ),
    metric(
      "workload",
      "Designer workload distribution",
      "Distinct active unfinished Spaces per active primary or supporting Designer in authorized Projects. A Space counts once for each assigned person, so totals across people can overlap.",
    ),
  ],
  designer: [
    metric(
      "assigned_spaces",
      "Assigned active spaces",
      "Distinct primary/support-assigned unfinished Spaces in authorized Projects with an open cycle, excluding cancelled Spaces/Projects and completed Projects. On Hold remains workload.",
    ),
    metric(
      "due_spaces",
      "Spaces due soon",
      "Assigned active unfinished Spaces due today through three calendar days ahead, inclusive, in each project timezone.",
    ),
    metric(
      "overdue_spaces",
      "Overdue spaces",
      "Assigned active unfinished Spaces whose deadline is before today in each project timezone. Missing deadlines are excluded.",
    ),
    metric(
      "revision_spaces",
      "Spaces returned for revision",
      "Assigned active Spaces currently For Revision; prior completion history does not remove current revision work.",
    ),
    metric(
      "design_tasks",
      "Pending design activities",
      "Assigned active unfinished Spaces requiring design progression. This is Space workload, not a fabricated activity-record count.",
    ),
    metric(
      "installation_tasks",
      "Pending installation activities",
      "Assigned active Spaces in commercially Closed projects with installation missing, Not Scheduled, Scheduled, In Progress or On Hold. Design completion is independent. Current handoff controls editing at the destination.",
    ),
  ],
  bdm: [
    metric(
      "submitted_leads",
      "Submitted leads",
      "Distinct own Leads ever submitted, including later accepted/rejected/clarified states; resubmissions do not add another Lead.",
    ),
    metric(
      "awaiting_leads",
      "Leads awaiting review",
      "Own Leads currently Submitted.",
    ),
    metric(
      "clarification_leads",
      "Returned for clarification",
      "Own Leads currently Returned for Clarification.",
    ),
    metric(
      "accepted_leads",
      "Accepted leads",
      "Own Leads currently Accepted; historical accepted Leads remain counted after project completion.",
    ),
    metric("rejected_leads", "Rejected leads", "Own Leads currently Rejected."),
    metric(
      "commercial_opportunities",
      "Active commercial opportunities",
      "Distinct authorized Projects with an open cycle and commercial stage For Quotation or Negotiation; cancelled/completed Projects excluded.",
    ),
    metric(
      "closed_projects",
      "Commercially closed projects",
      "Distinct authorized non-cancelled Closed Projects, including operationally completed history.",
    ),
    {
      ...metric(
        "sale",
        "Authorized Sale total",
        "Exact PostgreSQL sum of current recorded Sale for authorized non-cancelled Projects. Missing Sale is excluded; no recorded values means unavailable, recorded zero means PHP 0.00. Historical completed Projects remain included. Raw/supplier finances are omitted.",
      ),
      currency: true,
    },
  ],
  operations_admin: [
    metric(
      "handoffs",
      "Pending handoff acknowledgments",
      "Current Pending Acknowledgment handoffs naming you primary Ops, on authorized commercially Closed Projects with an open cycle; supporting Ops cannot acknowledge.",
    ),
    metric(
      "operational_projects",
      "Active operational projects",
      "Distinct authorized commercially Closed Projects with an open operational cycle; cancelled/completed excluded, On Hold included. Pre-close preview does not enter operational metrics.",
    ),
    ...[
      "RFP",
      "Supplier Adjustments",
      "For Manufacturing",
      "In Transit",
      "Landed",
      "For Delivery",
      "Delivered",
      "On Hold",
    ].map((s) =>
      metric(
        `logistics:${s}`,
        `Logistics · ${s}`,
        `Distinct logistics records currently ${s} in active authorized Closed Projects. Cancelled records excluded. Supporting assignments do not duplicate records.`,
      ),
    ),
    metric(
      "delayed_logistics",
      "Delayed supplier progress",
      "Non-Delivered/non-cancelled logistics in active authorized Closed Projects with no stage change for at least seven project-local calendar days. Informational inactivity, not an inferred missed delivery deadline; includes On Hold.",
    ),
    metric(
      "ops_installations",
      "Installation tasks",
      "Active non-cancelled Spaces in authorized Closed Projects with installation not Completed/Not Applicable, including missing installation records. Handoff acknowledgment is enforced at the destination.",
    ),
    metric(
      "recent_delivered",
      "Recently delivered projects",
      "Distinct authorized non-cancelled Closed Projects with at least one Delivered record, all non-cancelled records Delivered, and the latest delivery today or the previous 13 dates in the project timezone. Includes operationally completed Projects; delivery does not imply installation completion.",
    ),
  ],
};
const entry = z.object({
  id: z.string().uuid(),
  label: z.string(),
  href: z.string().startsWith("/dashboard"),
  detail: z.string().optional(),
  at: z.string().nullable(),
});
export const dashboardSchema = z.object({
  role: z.enum([
    "system_administrator",
    "lead_designer",
    "designer",
    "bdm",
    "operations_admin",
  ]),
  as_of: z.string(),
  timezone: z.literal("Asia/Manila"),
  metrics: z.record(
    z.string(),
    z.object({
      count: z.number().int().nonnegative(),
      amount: z.string().nullable(),
    }),
  ),
  view: z.string(),
  page: z.number().int().positive(),
  records: z.array(entry),
  actions: z.array(entry),
  recent: z.array(entry),
  workload: z.array(
    z.object({
      id: z.string().uuid(),
      display_name: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  workload_count: z.number().int().nonnegative(),
  unread: z.number().int().nonnegative(),
});
export type DashboardData = z.infer<typeof dashboardSchema>;
export function dashboardOptions(role: Role, view: unknown, page: unknown) {
  return {
    view:
      typeof view === "string" &&
      dashboardMetrics[role].some((m) => m.key === view)
        ? view
        : "",
    page: Math.min(
      100000,
      Math.max(
        1,
        Number.parseInt(typeof page === "string" ? page : "1", 10) || 1,
      ),
    ),
  };
}
export function dashboardUrl(view: string, page = 1) {
  return `/dashboard?${new URLSearchParams({ view, page: String(page) })}`;
}
