import { OperationsCompletionBar } from "./operations-completion-bar";
import Link from "next/link";
import { CheckCircle2, Hammer, Truck, TriangleAlert } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime } from "@/lib/phase1";
import type { CommercialHandoff } from "@/lib/handoff";
import type { Readiness } from "@/lib/installations";
import type { ToolbarQuery } from "@/lib/filter-toolbar";
import {
  installationProgress,
  outstandingItems,
} from "@/lib/operations-workspace";
import { ProjectHandoff } from "./project-handoff";
import { ProjectInstallations } from "./project-installations";
import { ProjectLogistics } from "./project-logistics";
import styles from "./operations-workspace.module.css";
export async function UnifiedOperations({
  project,
  query,
}: {
  project: string;
  query: ToolbarQuery;
}) {
  const { client } = await requireWorkspace();
  const enabled = (name: string) =>
    process.env[`ONE_ODC_${name}_ENABLED`] === "true";
  const [handoff, spaces, installations, records, readiness] =
    await Promise.all([
      enabled("HANDOFF")
        ? client.rpc("get_commercial_handoff", { p_project: project })
        : { data: null, error: null },
      enabled("INSTALLATIONS")
        ? client
            .from("spaces")
            .select("id,cancelled_at")
            .eq("project_id", project)
        : { data: [], error: null },
      enabled("INSTALLATIONS")
        ? client
            .from("space_installations")
            .select("space_id,status")
            .eq("project_id", project)
        : { data: [], error: null },
      enabled("LOGISTICS")
        ? client
            .from("project_logistics")
            .select("id", { count: "exact", head: true })
            .eq("project_id", project)
        : { count: null, error: null },
      enabled("INSTALLATIONS")
        ? client.rpc("operational_readiness", { p_project: project })
        : { data: null, error: null },
    ]);
  for (const r of [handoff, spaces, installations, records, readiness])
    checkDatabase(r.error);
  const h = handoff.data as CommercialHandoff | null,
    r = readiness.data as Readiness | null;
  const progress = installationProgress(
      spaces.data ?? [],
      installations.data ?? [],
    ),
    count = r ? (r.completed ? 0 : outstandingItems(r.blockers).length) : null;
  const cards = [
    {
      label: "Commercial handoff",
      icon: CheckCircle2,
      href: "operations-handoff",
      value: h?.status ?? "Unavailable",
      hint: h?.closed_at
        ? `Closed · ${formatTime(h.closed_at)}`
        : "Not commercially closed",
      available: enabled("HANDOFF"),
    },
    {
      label: "Installation",
      icon: Hammer,
      href: "operations-installation",
      value: progress.total
        ? `${progress.satisfied} of ${progress.total} satisfied`
        : "No active spaces",
      hint:
        progress.percent === null
          ? "Not available"
          : `${progress.percent}% · Completed or Not Applicable`,
      available: enabled("INSTALLATIONS"),
    },
    {
      label: "Supplier & logistics",
      icon: Truck,
      href: "operations-logistics",
      value:
        records.count === null ? "Unavailable" : `${records.count} records`,
      hint: "Project supplier records",
      available: enabled("LOGISTICS"),
    },
    {
      label: "Outstanding items",
      icon: TriangleAlert,
      href: "operations-outstanding",
      value: count === null ? "Unavailable" : `${count} items`,
      hint: r?.completed
        ? "Operations completed"
        : count
          ? "Operational prerequisites remain"
          : "No outstanding prerequisites",
      available: enabled("INSTALLATIONS"),
    },
  ];
  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <div>
          <h2>Operations</h2>
          <p>Commercial handoff, installation and logistics in one view.</p>
        </div>
      </header>
      <div className={styles.summary}>
        {cards
          .filter((c) => c.available)
          .map((c) => (
            <Link
              key={c.label}
              href={`#${c.href}`}
              className={styles.card}
              data-attention={c.label === "Outstanding items" && !!count}
            >
              <c.icon size={22} aria-hidden="true" />
              <div>
                <h3>{c.label}</h3>
                <strong>{c.value}</strong>
                <small>{c.hint}</small>
                {c.label === "Installation" && progress.percent !== null && (
                  <progress
                    aria-label="Installation requirements satisfied"
                    max={100}
                    value={progress.percent}
                  />
                )}
              </div>
            </Link>
          ))}
      </div>
      {r && <OperationsCompletionBar project={project} readiness={r} />}
      {enabled("HANDOFF") && <ProjectHandoff project={project} unified />}
      {enabled("INSTALLATIONS") && (
        <ProjectInstallations
          project={project}
          query={{ ...query, tab: "operations" }}
          unified
        />
      )}
      {enabled("LOGISTICS") && (
        <ProjectLogistics
          project={project}
          query={{ ...query, tab: "operations" }}
          unified
        />
      )}
    </div>
  );
}
