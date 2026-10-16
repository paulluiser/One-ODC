import { z } from "zod";
import { localDate } from "./monitoring";
import { moneyCentavos } from "./quotations";
export const analyticsStages = [
  "For Quotation",
  "Under Negotiation",
  "Closed",
  "Lost",
  "Completed",
  "Cancelled",
  "On Hold",
] as const;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Choose a valid calendar date.",
  );
export const analyticsFilters = z
  .object({
    from: date,
    to: date,
    stage: z.enum(["", ...analyticsStages]).default(""),
    brand: z.enum(["", "SFY", "Stosa", "Both"]).default(""),
    stakeholder: z.union([z.literal(""), z.string().uuid()]).default(""),
    view: z.string().max(60).default(""),
    bucket: z.string().max(100).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .superRefine((v, ctx) => {
    if (v.to < v.from)
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "End date must be on or after the start date.",
      });
    if ((Date.parse(v.to) - Date.parse(v.from)) / 86400000 > 1095)
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "Choose a range of 1,095 days or less (up to three years).",
      });
    const today = localDate(new Date().toISOString());
    if (v.to > today)
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "End date cannot be later than today.",
      });
    if (v.from > today)
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "Start date cannot be later than today.",
      });
  });
export type AnalyticsFilters = z.infer<typeof analyticsFilters>;
export function analyticsFilterErrors(input: unknown) {
  const parsed = analyticsFilters.safeParse(input);
  const errors: Record<string, string> = {};
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "filters");
      if (!errors[field])
        errors[field] = ["from", "to"].includes(field)
          ? issue.code === "custom"
            ? issue.message
            : "Choose a valid calendar date."
          : `Choose a valid ${field === "stakeholder" ? "stakeholder" : field}.`;
    }
  return errors;
}
export function defaultAnalyticsRange(now = new Date()) {
  const to = localDate(now.toISOString());
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 11, 1);
  return { from: start.toISOString().slice(0, 10), to };
}
export function analyticsUrl(
  filters: AnalyticsFilters,
  view = "",
  bucket = "",
  page = 1,
) {
  return `/dashboard/analytics?${new URLSearchParams({ ...filters, view, bucket, page: String(page) })}`;
}
const metric = z.object({
  count: z.number().int().nonnegative(),
  amount: z.string().nullable(),
});
export const analyticsSchema = z.object({
  role: z.enum([
    "bdm",
    "designer",
    "lead_designer",
    "operations_admin",
    "system_administrator",
  ]),
  as_of: z.string(),
  metrics: z.record(z.string(), metric),
  groups: z.array(metric.extend({ key: z.string(), bucket: z.string() })),
  records: z.array(
    z.object({
      id: z.string().uuid(),
      label: z.string(),
      href: z.string().startsWith("/dashboard/"),
      detail: z.string(),
      at: z.string().nullable(),
    }),
  ),
  selected_count: z.number().int().nonnegative(),
  people: z.array(
    z.object({ id: z.string().uuid(), display_name: z.string() }),
  ),
});
export type AnalyticsData = z.infer<typeof analyticsSchema>;
export function rate(numerator: number, denominator: number) {
  return denominator
    ? `${((100 * numerator) / denominator).toFixed(1)}%`
    : "Not Available";
}
export function collectionRate(
  paid: string | null | undefined,
  sale: string | null | undefined,
) {
  if (paid == null || sale == null) return "Not Available";
  const total = moneyCentavos(sale);
  if (total === 0n) return "Not Available";
  const tenths = (moneyCentavos(paid) * 1000n + total / 2n) / total;
  return `${tenths / 10n}.${tenths % 10n}%`;
}
export const analyticsDefinitions = [
  "Current workload, lifecycle, design, installation, handoff and Sale cards use Projects created within the inclusive date range, in each Project’s timezone. Current stage, exact originating-lead brand and current Project stakeholder filters apply to every section. Supporting assignments never duplicate Projects or Spaces.",
  "Completion charts use the latest recorded operational completion per Project, dated in its timezone at completion. Reopened Projects retain their completion history but are active again. Current completed count uses current status. Closure charts use actual commercial closure dates; closure does not imply operational completion.",
  "Average operational duration sums calendar days across ended cycles through the latest completion, divided by distinct completed Projects in range. Holds count; gaps between cycles and unfinished reopened cycles do not. On-time compares completion with the Project deadline recorded then, frozen in new completion snapshots, with immutable deadline-audit reconstruction for older completions; missing deadlines are unavailable, never on time.",
  "Lead conversion = currently Accepted Leads / distinct Leads first submitted in range (Asia/Manila). Resubmissions count once. Acceptance can occur after the submission range. Stage/stakeholder filters omit unconverted Leads unless the stakeholder is their originating BDM. Lead Designers retain existing pre-conversion review visibility; converted Leads follow Project access.",
  "Sale is the current recorded Sale total for non-cancelled Projects in the created cohort. Collection progress is all current non-voided client payments for those same Projects with a recorded Sale, divided by that Sale. It is a current balance, not historical revenue or period cash flow. Missing Sale is unavailable; recorded zero remains zero; percentages may exceed 100% and are unavailable when Sale is zero. No Raw or supplier payment information appears.",
  "Space design completion = current Completed / all non-cancelled Spaces in the cohort. Installation completion = Completed / (all active Spaces minus Not Applicable) in active Closed Projects; missing installation records count as Not Scheduled. Outstanding tasks exclude Completed/Not Applicable. Designer workload counts each unfinished Space once per currently assigned active Designer; shared Spaces contribute to each assignee.",
  "Pending handoff aging starts at original commercial closure, including after primary reassignment. Operations Admin sees only assigned Closed Projects; pending handoffs are their own primary acknowledgments. Operations brand filtering is unavailable because originating Lead resources are restricted. Stakeholder choices show at most 50 authorized people.",
  "Historical at-risk/overdue trends are deferred: no dated risk snapshots exist and mutable activities cannot safely reconstruct past risk. Current risk uses the established three-day deadline and seven-day inactivity thresholds. Logistics delivery-delay analytics are unavailable because no delivery deadlines are stored. Stalled logistics is the separate existing ≥7 calendar days without a stage change, including On Hold.",
] as const;
