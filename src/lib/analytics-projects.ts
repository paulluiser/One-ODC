import "server-only";
import type { requireWorkspace } from "./workspace-session";
import { checkDatabase } from "./live-data";
import { analyticsSchema, type AnalyticsFilters } from "./analytics";
import { projectColumns, projectSchema } from "./project-workspace";
import { projectWorkState, type Monitoring } from "./monitoring";
export type AnalyticsProject = {
  id: string;
  name: string;
  reference: string;
  commercial: string;
  lifecycle: string;
  progress: number | null;
  deadline: string | null;
  handoff: string | null;
  lastActivity: string | null;
};
// The existing reporting RPC defines the authorized, timezone-aware cohort.
export async function analyticsProjects(
  client: Awaited<ReturnType<typeof requireWorkspace>>["client"],
  filters: AnalyticsFilters,
  role: string,
) {
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const r = await client.rpc("project_analytics", {
      p_from: filters.from,
      p_to: filters.to,
      p_stage: filters.stage,
      p_brand: filters.brand,
      p_stakeholder: filters.stakeholder || null,
      p_view: "projects",
      p_bucket: "",
      p_page: page,
    });
    checkDatabase(r.error);
    const cohort = analyticsSchema.parse(r.data);
    ids.push(...cohort.records.map((r) => r.id));
    if (ids.length >= cohort.selected_count || !cohort.records.length) break;
  }
  const rows: AnalyticsProject[] = [];
  for (let start = 0; start < ids.length; start += 25) {
    const batch = ids.slice(start, start + 25);
    const [projects, summaries] = await Promise.all([
      client.from("projects").select(projectColumns).in("id", batch),
      client.rpc("monitoring_summary", { p_projects: batch }),
    ]);
    checkDatabase(projects.error);
    checkDatabase(summaries.error);
    const monitoring = new Map(
      ((summaries.data as Monitoring[]) ?? []).map((m) => [m.project_id, m]),
    );
    for (const p of projectSchema.array().parse(projects.data ?? [])) {
      const m = monitoring.get(p.id);
      rows.push({
        id: p.id,
        name: p.name,
        reference: p.reference,
        commercial: p.commercial_status,
        lifecycle: p.is_cancelled
          ? "Cancelled"
          : p.is_operationally_completed
            ? "Operationally Completed"
            : m
              ? projectWorkState(m)
              : "Not available",
        progress:
          role !== "operations_admin" && m?.active_spaces
            ? (100 * m.completed_spaces) / m.active_spaces
            : null,
        deadline: m?.deadline ?? null,
        handoff: p.expected_handoff,
        lastActivity: m?.last_progress_at ?? null,
      });
    }
  }
  return rows;
}
