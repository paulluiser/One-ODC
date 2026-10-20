import { SpaceHandoffs } from "./space-handoffs";
import Link from "next/link";
import { CheckCircle2, Truck } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import type { ToolbarQuery } from "@/lib/filter-toolbar";
import { ProjectLogistics } from "./project-logistics";
import styles from "./operations-workspace.module.css";
export async function UnifiedOperations({
  project,
  query,
}: {
  project: string;
  query: ToolbarQuery;
}) {
  const { client, profile } = await requireWorkspace();
  const [projectRow, spaceRows, readyRows, handoffRows, logisticsCount] =
    await Promise.all([
      client
        .from("projects")
        .select(
          "lead_designer_id,is_operationally_completed,is_cancelled,commercial_status",
        )
        .eq("id", project)
        .single(),
      client
        .from("spaces")
        .select("id,name,cancelled_at")
        .eq("project_id", project)
        .is("cancelled_at", null),
      client.from("space_readiness").select("*").eq("project_id", project),
      client
        .from("space_operational_handoffs")
        .select("*")
        .eq("project_id", project)
        .is("invalidated_at", null),
      client
        .from("project_logistics")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project),
    ]);
  for (const r of [
    projectRow,
    spaceRows,
    readyRows,
    handoffRows,
    logisticsCount,
  ])
    checkDatabase(r.error);
  const manager =
    profile.role === "system_administrator" ||
    (profile.role === "lead_designer" &&
      projectRow.data?.lead_designer_id === profile.id);
  const spaceList = (spaceRows.data ?? []).map((s) => ({
    ...s,
    status:
      readyRows.data?.find((r) => r.space_id === s.id)?.status ??
      "Site Verification",
  }));
  const cards = [
    {
      label: "Space handoffs",
      icon: CheckCircle2,
      href: "operations-handoff",
      value: `${handoffRows.data?.filter((h) => h.acknowledged_at).length ?? 0} acknowledged`,
      hint: "Ordered Spaces only",
      available: true,
    },
    {
      label: "Supplier & logistics",
      icon: Truck,
      href: "operations-logistics",
      value: `${logisticsCount.count ?? 0} records`,
      hint: "Project supplier records",
      available: true,
    },
  ];
  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <div>
          <h2>Operations</h2>
          <p>Space handoffs, supplier logistics and project completion.</p>
        </div>
      </header>
      <div className={styles.summary}>
        {cards
          .filter((c) => c.available)
          .map((c) => (
            <Link key={c.label} href={`#${c.href}`} className={styles.card}>
              <c.icon size={22} aria-hidden="true" />
              <div>
                <h3>{c.label}</h3>
                <strong>{c.value}</strong>
                <small>{c.hint}</small>
              </div>
            </Link>
          ))}
      </div>
      <SpaceHandoffs
        project={project}
        spaces={spaceList}
        handoffs={handoffRows.data ?? []}
        manager={manager}
        actor={profile.id}
        admin={profile.role === "system_administrator"}
        locked={
          !!projectRow.data?.is_operationally_completed ||
          !!projectRow.data?.is_cancelled ||
          projectRow.data?.commercial_status !== "Closed"
        }
      />
      {process.env.ONE_ODC_LOGISTICS_ENABLED === "true" && (
        <ProjectLogistics
          project={project}
          query={{ ...query, tab: "operations" }}
          unified
        />
      )}
    </div>
  );
}
