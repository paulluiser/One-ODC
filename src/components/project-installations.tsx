import Link from "next/link";
import { RecordStatus } from "./record-table";
import { progressLabel } from "@/lib/monitoring";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime } from "@/lib/phase1";
import type { Installation, Readiness } from "@/lib/installations";
import {
  InstallationReadinessHeading,
  InstallationForm,
} from "./installation-form";
import type { CommercialHandoff } from "@/lib/handoff";
export async function ProjectInstallations({ project }: { project: string }) {
  const { client, profile } = await requireWorkspace();
  const p = await client
    .from("projects")
    .select("commercial_status,lead_designer_id,is_cancelled")
    .eq("id", project)
    .single();
  checkDatabase(p.error);
  if (p.data?.commercial_status !== "Closed")
    return (
      <section className="surface">
        <h2>Installation</h2>
        <p>Installation tracking becomes available after commercial closure.</p>
      </section>
    );
  const [spaces, support, installations, events, ready, handoff, monitor] =
    await Promise.all([
      client
        .from("spaces")
        .select("*")
        .eq("project_id", project)
        .order("created_at"),
      client
        .from("space_supporters")
        .select("space_id,user_id,spaces!inner(project_id)")
        .eq("spaces.project_id", project),
      client.from("space_installations").select("*").eq("project_id", project),
      client
        .from("installation_events")
        .select("*")
        .eq("project_id", project)
        .order("occurred_at")
        .order("version"),
      client.rpc("operational_readiness", { p_project: project }),
      client.rpc("get_commercial_handoff", { p_project: project }),
      client.rpc("monitoring_summary", { p_projects: [project] }),
    ]);
  for (const r of [
    spaces,
    support,
    installations,
    events,
    ready,
    handoff,
    monitor,
  ])
    checkDatabase(r.error);
  const readiness = ready.data as Readiness,
    h = handoff.data as CommercialHandoff,
    manager =
      profile.role === "system_administrator" ||
      (profile.role === "lead_designer" &&
        p.data?.lead_designer_id === profile.id),
    held = monitor.data?.[0]?.state === "On Hold";
  const activeSpaces = (spaces.data ?? []).filter((s) => !s.cancelled_at);
  const satisfied = activeSpaces.filter((s) =>
    (installations.data ?? []).some(
      (i) =>
        i.space_id === s.id &&
        ["Completed", "Not Applicable"].includes(i.status),
    ),
  ).length;
  return (
    <section
      className="surface live-form installation-workspace"
      aria-label="Installation and operational readiness"
    >
      <h2>Installation</h2>
      <p>
        Installation progress:
        {progressLabel(activeSpaces.length, satisfied)} · {satisfied} of{" "}
        {activeSpaces.length} active Spaces satisfied (Completed or Not
        Applicable), equally weighted.
      </p>
      <p>
        Independent Space installation tracking. No Space-to-supplier
        relationship exists; unrelated shipping records do not block
        installation scheduling or updates.
      </p>
      <section
        className="readiness-checklist"
        data-completed={readiness.completed}
        aria-label="Operational readiness"
      >
        <InstallationReadinessHeading completed={readiness.completed} />
        <p>
          {readiness.completed
            ? "Operationally Completed"
            : readiness.ready
              ? "Ready for operational completion"
              : "Operational prerequisites remain"}
        </p>
        {readiness.completed ? (
          <p>
            Operational completion recorded. Review the preserved completion
            history below.
          </p>
        ) : readiness.blockers.length > 0 ? (
          <ul className="readiness-blockers">
            {readiness.blockers.map((b, i) => (
              <li key={i}>
                {b.label}
                {b.id && (
                  <Link
                    href={
                      b.kind === "logistics"
                        ? `/dashboard/projects/${project}?tab=logistics#logistics-${b.id}`
                        : `#installation-${b.id}`
                    }
                  >
                    {" "}
                    · View record
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            All active design, installation, handoff and logistics requirements
            are satisfied. Outstanding payments do not block completion.
          </p>
        )}
        {manager && !readiness.completed && (
          <InstallationForm project={project} readiness={readiness} />
        )}{" "}
        {readiness.completed && (
          <Link href={`/dashboard/projects/${project}#project-activities`}>
            Reopen through Project monitoring controls
          </Link>
        )}
      </section>
      <div className="operations-record-grid">
        {(spaces.data ?? []).map((s) => {
          const installation = (
            (installations.data as Installation[]) ?? []
          ).find((i) => i.space_id === s.id);
          const assigned =
            s.primary_designer_id === profile.id ||
            support.data?.some(
              (m) => m.space_id === s.id && m.user_id === profile.id,
            );
          const canEdit =
            !readiness.completed &&
            !p.data?.is_cancelled &&
            !s.cancelled_at &&
            (manager || assigned || profile.role === "operations_admin") &&
            (manager || h.status === "Acknowledged");
          return (
            <article
              className="surface live-form operations-record"
              id={`installation-${s.id}`}
              key={s.id}
              aria-label={`Installation ${s.name} ${s.id}`}
            >
              <h3>
                {s.name} ·{" "}
                <RecordStatus>
                  {s.cancelled_at
                    ? "Cancelled Space (excluded)"
                    : (installation?.status ?? "Not Scheduled")}
                </RecordStatus>
              </h3>
              <p>
                Design: {s.status} · Scheduled:{" "}
                {installation?.scheduled_date ?? "Not scheduled"}
              </p>
              {installation?.completed_at && (
                <p>
                  Installation completed {formatTime(installation.completed_at)}
                </p>
              )}
              {installation?.status === "Not Applicable" && (
                <p>
                  Not Applicable:{" "}
                  {events.data?.filter((e) => e.space_id === s.id).at(-1)
                    ?.reason ||
                    "See preserved installation history for the recorded reason."}
                </p>
              )}
              <details>
                <summary>Space reference</summary>
                <p>Space ID: {s.id}</p>
              </details>
              {canEdit && (
                <details>
                  <summary>Schedule or update installation</summary>
                  <InstallationForm
                    project={project}
                    space={s.id}
                    installation={installation}
                    manager={manager}
                    held={held}
                  />
                </details>
              )}
              <details>
                <summary>Installation history</summary>
                <ol>
                  {events.data
                    ?.filter((e) => e.space_id === s.id)
                    .map((e) => (
                      <li key={e.id}>
                        {formatTime(e.occurred_at)} · {e.reason}
                        <details>
                          <summary>Preserved values and actor</summary>
                          <p>Actor {e.actor_id}</p>
                          <pre className="history-json">
                            {JSON.stringify(
                              {
                                previous: e.previous_value,
                                current: e.new_value,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </li>
                    ))}
                </ol>
              </details>
            </article>
          );
        })}
      </div>
      <details>
        <summary>Operational completion history</summary>
        {readiness.history.length ? (
          <ol>
            {readiness.history.map((c) => (
              <li key={c.cycle}>
                Cycle {c.cycle} · {formatTime(c.completed_at)} · Actor{" "}
                {c.completed_by} · {c.reason}
                {c.administrative_override
                  ? " · Audited administrative completion"
                  : ""}
              </li>
            ))}
          </ol>
        ) : (
          <p>No operational completion recorded.</p>
        )}
      </details>
    </section>
  );
}
