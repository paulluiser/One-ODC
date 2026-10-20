import "server-only";
import type { requireWorkspace } from "./workspace-session";
import { checkDatabase } from "./live-data";
import { dashboardSchema, type DashboardData } from "./dashboard";
import { calendarEventSchema } from "./calendar";
import { localDate, projectWorkState, type Monitoring } from "./monitoring";
import { projectColumns, projectSchema } from "./project-workspace";
export type DashboardExtras = {
  statuses: { label: string; count: number; href?: string }[];
  frequency: { label: string; count: number }[];
  schedule: { label: string; count: number }[];
  upcoming: {
    id: string;
    title: string;
    detail: string;
    date: string;
    href: string;
  }[];
  projects: {
    id: string;
    name: string;
    commercial: string;
    lifecycle: string;
    progress: number | null;
    deadline: string | null;
  }[];
};
export async function dashboardExtras(
  client: Awaited<ReturnType<typeof requireWorkspace>>["client"],
  data: DashboardData,
): Promise<DashboardExtras> {
  const personalSpaces = new Set<string>();
  const operationalProjects = new Set<string>();
  const result: DashboardExtras = {
    statuses: [],
    frequency: [],
    schedule: [],
    upcoming: [],
    projects: [],
  };
  const today = localDate(data.as_of),
    dateAt = (offset: number) => {
      const d = new Date(today + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
  if (data.role === "system_administrator") {
    const counts = new Map<string, number>();
    for (let offset = 0; ; offset += 500) {
      const response = await client
        .from("audit_events")
        .select("occurred_at")
        .gte("occurred_at", dateAt(-6) + "T00:00:00+08:00")
        .lte("occurred_at", data.as_of)
        .order("occurred_at")
        .order("id")
        .range(offset, offset + 499);
      checkDatabase(response.error);
      for (const r of response.data ?? []) {
        const day = localDate(r.occurred_at);
        counts.set(day, (counts.get(day) ?? 0) + 1);
      }
      if ((response.data?.length ?? 0) < 500) break;
    }
    result.frequency = Array.from({ length: 7 }, (_, i) => ({
      label: dateAt(i - 6),
      count: counts.get(dateAt(i - 6)) ?? 0,
    }));
  }
  if (data.role === "designer") {
    const counts = new Map<string, number>();
    for (let page = 1; ; page++) {
      const response = await client.rpc("role_dashboard", {
        p_view: "design_tasks",
        p_page: page,
      });
      checkDatabase(response.error);
      const items = dashboardSchema.parse(response.data);
      for (const r of items.records) {
        personalSpaces.add(r.id);
        const status = r.detail || "Not recorded";
        counts.set(status, (counts.get(status) ?? 0) + 1);
      }
      if (
        !items.records.length ||
        page * 25 >= (items.metrics.design_tasks?.count ?? 0)
      )
        break;
    }
    result.statuses = [...counts].map(([label, count]) => ({ label, count }));
  }
  if (data.role === "operations_admin") {
    for (let page = 1; ; page++) {
      const response = await client.rpc("role_dashboard", {
        p_view: "operational_projects",
        p_page: page,
      });
      checkDatabase(response.error);
      const items = dashboardSchema.parse(response.data);
      items.records.forEach((r) => operationalProjects.add(r.id));
      if (
        !items.records.length ||
        page * 25 >= (items.metrics.operational_projects?.count ?? 0)
      )
        break;
    }
  }
  if (
    ["designer", "lead_designer", "operations_admin"].includes(data.role) &&
    process.env.ONE_ODC_CALENDAR_ENABLED === "true"
  ) {
    const response = await client.rpc("workspace_calendar", {
      p_from: today,
      p_to: dateAt(data.role === "operations_admin" ? 6 : 14),
    });
    checkDatabase(response.error);
    const dates = calendarEventSchema
      .array()
      .parse(response.data ?? [])
      .filter(
        (e) =>
          e.kind !== "Installation" &&
          !["Completed", "Not Applicable", "Cancelled"].includes(e.status),
      );
    result.upcoming = dates
      .filter((e) =>
        data.role === "designer"
          ? e.kind === "Space deadline" &&
            personalSpaces.has(e.id.replace(/^space:/, ""))
          : true,
      )
      .slice(0, 3)
      .map((e) => ({
        id: e.id,
        title: e.title,
        detail: e.subtitle,
        date: e.date,
        href: e.href ?? "/dashboard/calendar",
      }));
    if (data.role === "operations_admin")
      result.schedule = Array.from({ length: 7 }, (_, i) => ({
        label: dateAt(i),
        count: dates.filter(
          (e) =>
            e.kind === "Installation" &&
            e.date === dateAt(i) &&
            operationalProjects.has(
              e.href?.match(/projects\/([0-9a-f-]+)/)?.[1] ?? "",
            ),
        ).length,
      }));
  }
  if (data.role === "lead_designer") {
    const response = await client
      .from("projects")
      .select(projectColumns)
      .eq("is_cancelled", false)
      .eq("is_operationally_completed", false)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(3);
    checkDatabase(response.error);
    const projects = projectSchema.array().parse(response.data ?? []);
    const summaries = projects.length
      ? await client.rpc("monitoring_summary", {
          p_projects: projects.map((p) => p.id),
        })
      : { data: [], error: null };
    checkDatabase(summaries.error);
    const map = new Map(
      ((summaries.data as Monitoring[]) ?? []).map((m) => [m.project_id, m]),
    );
    result.projects = projects.map((p) => {
      const m = map.get(p.id);
      return {
        id: p.id,
        name: p.name,
        commercial: p.commercial_status,
        lifecycle: m ? projectWorkState(m) : "Not available",
        progress: m?.active_spaces
          ? (100 * m.completed_spaces) / m.active_spaces
          : null,
        deadline: m?.deadline ?? null,
      };
    });
  }
  return result;
}
