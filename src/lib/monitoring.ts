import { calendarDays } from "./domain";
export const riskThresholds = Object.freeze({
  approachingDays: 3,
  stalledDays: 7,
});
export const activityCategories = [
  "Design Work",
  "Client Coordination",
  "Site Visit",
  "Revision",
  "Supplier Update",
  "Installation",
  "General Update",
] as const;
export type Monitoring = {
  project_id: string;
  timezone: string;
  deadline: string | null;
  original_deadline: string | null;
  state: "Active" | "On Hold" | "Cancelled";
  version: number;
  cancelled_at: string | null;
  created_at: string;
  space_refs: { id: string; name: string; editable: boolean }[];
  earliest_space_deadline?: string | null;
  oldest_space_progress_at?: string | null;
  active_spaces: number;
  completed_spaces: number;
  last_progress_at: string;
  cycles: {
    number: number;
    started_at: string;
    ended_at: string | null;
    outcome: string | null;
  }[];
  holds: { started_at: string; ended_at: string | null }[];
};
export function localDate(timestamp: string, timezone = "Asia/Manila") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function elapsed(
  start: string | null,
  end: string,
  timezone: string,
): number | null {
  return start
    ? calendarDays(localDate(start, timezone), localDate(end, timezone))
    : null;
}
export function overdue(
  deadline: string | null,
  end: string,
  timezone: string,
) {
  return deadline ? calendarDays(deadline, localDate(end, timezone)) : 0;
}
export function progressLabel(active: number, completed: number) {
  return active
    ? `${((completed / active) * 100).toFixed(1)}%`
    : "Not Available";
}
export function risk({
  deadline,
  lastProgress,
  resolved,
  now,
  timezone,
}: {
  deadline: string | null;
  lastProgress: string;
  resolved: boolean;
  now: string;
  timezone: string;
}) {
  if (resolved) return "On Track";
  const today = localDate(now, timezone);
  if (deadline && deadline < today) return "Overdue";
  if (
    (deadline &&
      calendarDays(today, deadline) <= riskThresholds.approachingDays) ||
    calendarDays(
      /^\d{4}-\d{2}-\d{2}$/.test(lastProgress)
        ? lastProgress
        : localDate(lastProgress, timezone),
      today,
    ) >= riskThresholds.stalledDays
  )
    return "At Risk";
  return "On Track";
}
export function projectMetrics(m: Monitoring, now = new Date().toISOString()) {
  const current = m.cycles.find((c) => !c.ended_at);
  const last = m.cycles.at(-1);
  const end = m.cancelled_at || (!current ? last?.ended_at : null) || now;
  return {
    progress: progressLabel(m.active_spaces, m.completed_spaces),
    age: m.cycles.reduce(
      (sum, c) =>
        sum + (elapsed(c.started_at, c.ended_at || now, m.timezone) || 0),
      0,
    ),
    originalAge: m.cycles[0]
      ? elapsed(m.cycles[0].started_at, m.cycles[0].ended_at || now, m.timezone)
      : null,
    cycleAge: current ? elapsed(current.started_at, now, m.timezone) : null,
    overdue: overdue(m.deadline, end, m.timezone),
    hold: m.holds.reduce(
      (sum, h) =>
        sum + (elapsed(h.started_at, h.ended_at || now, m.timezone) || 0),
      0,
    ),
    risk: (() => {
      const resolved = m.state === "Cancelled" || !current;
      const common = { resolved, now, timezone: m.timezone };
      const projectRisk = risk({
        ...common,
        deadline: m.deadline,
        lastProgress: m.last_progress_at,
      });
      const spaceRisk = risk({
        ...common,
        deadline: m.earliest_space_deadline || null,
        lastProgress: m.oldest_space_progress_at || m.last_progress_at,
      });
      return projectRisk === "Overdue" || spaceRisk === "Overdue"
        ? "Overdue"
        : projectRisk === "At Risk" || spaceRisk === "At Risk"
          ? "At Risk"
          : "On Track";
    })(),
  };
}
export type Activity = {
  id: string;
  project_id: string;
  space_id: string | null;
  category: string;
  activity_date: string;
  description: string;
  coordinator_id: string | null;
  attachment_versions: string[];
  created_by: string;
  recorded_at: string;
  version: number;
};
export type TimelineEvent = {
  id: string;
  space_id: string | null;
  actor_id: string;
  category: string;
  description: string;
  date: string;
  occurred_at: string;
  recorded_at: string;
  kind: "manual" | "system";
};

export function projectWorkState(m: Pick<Monitoring, "state" | "cycles">) {
  if (m.state !== "Active" || m.cycles.some((c) => !c.ended_at)) return m.state;
  const latest = m.cycles.reduce<Monitoring["cycles"][number] | undefined>(
    (last, c) => (!last || c.number > last.number ? c : last),
    undefined,
  );
  return latest?.outcome === "Completed" ? "Operationally Completed" : m.state;
}
