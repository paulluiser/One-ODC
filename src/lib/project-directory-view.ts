import type { Project } from "./phase1";
import {
  projectMetrics,
  projectWorkState,
  type Monitoring,
} from "./monitoring";

export const directoryColumns = [
  { key: "project", label: "Project" },
  { key: "stage", label: "Commercial stage" },
  { key: "operations", label: "Operations" },
  { key: "progress", label: "Design progress" },
  { key: "deadline", label: "Deadline" },
  { key: "designer", label: "Lead Designer" },
  { key: "attention", label: "Attention" },
  { key: "handoff", label: "Expected handoff" },
] as const;
export type DirectoryColumn = (typeof directoryColumns)[number]["key"];
export const defaultDirectoryColumns: DirectoryColumn[] = directoryColumns
  .filter((c) => c.key !== "handoff")
  .map((c) => c.key);
export function visibleDirectoryColumns(value?: string): DirectoryColumn[] {
  if (value === undefined) return defaultDirectoryColumns;
  const selected = new Set(value.split(","));
  return directoryColumns
    .filter((c) => c.key === "project" || selected.has(c.key))
    .map((c) => c.key);
}
export function directoryDate(value: string | null | undefined) {
  if (!value) return "Not scheduled";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? "Not scheduled"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}
export function projectDirectoryRow(
  project: Project & {
    is_cancelled?: boolean;
    is_operationally_completed?: boolean;
  },
  monitoring: Monitoring | undefined,
  ops: boolean,
  designer?: string,
) {
  const restricted =
    ops &&
    (project.commercial_status !== "Closed" || !!project.awaiting_handoff);
  const m = restricted ? undefined : monitoring;
  const inactive =
    project.commercial_status === "Lost" ||
    project.is_cancelled ||
    project.is_operationally_completed;
  const metric = m ? projectMetrics(m) : null;
  return {
    id: project.id,
    name: project.name,
    reference: project.reference,
    stage: project.commercial_status,
    operations: restricted
      ? "Restricted preview"
      : project.is_cancelled
        ? "Cancelled"
        : project.is_operationally_completed
          ? "Operationally Completed"
          : project.commercial_status === "Lost"
            ? "Not available"
            : project.commercial_status !== "Closed"
              ? "Not released"
              : project.awaiting_handoff
                ? "Awaiting Handoff"
                : m
                  ? projectWorkState(m)
                  : "Not available",
    progress:
      m && m.active_spaces > 0
        ? Number(((m.completed_spaces / m.active_spaces) * 100).toFixed(1))
        : null,
    deadline: restricted ? "Restricted" : directoryDate(m?.deadline),
    designer:
      restricted || ops ? "See project team" : designer || "See project team",
    attention: restricted
      ? "Restricted"
      : inactive
        ? "—"
        : metric?.risk || "Not available",
    handoff: restricted
      ? "Restricted"
      : directoryDate(project.expected_handoff),
  };
}
export type ProjectDirectoryRow = ReturnType<typeof projectDirectoryRow>;
