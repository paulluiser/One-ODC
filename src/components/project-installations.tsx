import { operationDetail } from "@/lib/operations-workspace";
import { InstallationDetailsSheet } from "./installation-details-sheet";
import { InstallationActionDialog } from "./installation-action-dialog";
import panel from "./installation-dialog.module.css";
import { CalendarDays, Users, List, ClipboardCheck } from "lucide-react";
import { OperationsDirectory } from "./operations-directory";
import styles from "./operations-workspace.module.css";
import { directoryDate } from "@/lib/project-directory-view";
import { Fragment } from "react";
import { FilterBar } from "./filter-bar";
import {
  filterOptions,
  toolbarText,
  toolbarChoice,
  type ToolbarQuery,
} from "@/lib/filter-toolbar";
import { installationStatuses } from "@/lib/installations";
import {
  ReadinessGroups,
  OperationSummary,
  OperationEditor,
  OperationsFrame,
} from "./ui-r4/primitives";
import Link from "next/link";
import { RecordStatus } from "./record-table";
import { progressLabel } from "@/lib/monitoring";
import {
  requireWorkspace,
  projectMonitoringSummary,
  projectTeam,
} from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime, type Member } from "@/lib/phase1";
import type { Installation, Readiness } from "@/lib/installations";
import {
  InstallationReadinessHeading,
  InstallationForm,
} from "./installation-form";
import type { CommercialHandoff } from "@/lib/handoff";
export async function ProjectInstallations({
  project,
  query = {},
  unified = false,
}: {
  project: string;
  query?: ToolbarQuery;
  unified?: boolean;
}) {
  const rebuild = process.env.ONE_ODC_UI_R0_ENABLED === "true";
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
      projectMonitoringSummary(project),
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
  const assigneeIds = rebuild
    ? [
        ...new Set(
          [
            ...(spaces.data ?? []).map((s) => s.primary_designer_id),
            ...(support.data ?? []).map((s) => s.user_id),
          ].filter(Boolean),
        ),
      ]
    : [];
  const people = assigneeIds.length
    ? await client
        .from("profiles")
        .select("id,display_name")
        .in("id", assigneeIds)
    : { data: [], error: null };
  checkDatabase(people.error);
  const teamResult =
    unified && profile.role !== "operations_admin"
      ? await projectTeam(project)
      : { data: [], error: null };
  checkDatabase(teamResult.error);
  const names = new Map((people.data ?? []).map((p) => [p.id, p.display_name]));
  for (const member of (teamResult.data ?? []) as Member[])
    names.set(member.user_id, member.display_name);
  const activeSpaces = (spaces.data ?? []).filter((s) => !s.cancelled_at);
  const installationQ = toolbarText(query, "installation_q"),
    installationStatus = toolbarChoice(
      query,
      "installation_status",
      installationStatuses,
    ),
    installationSort = toolbarChoice(
      query,
      "installation_sort",
      ["created", "name", "scheduled", "updated"],
      "created",
    );
  const visibleSpaces = (spaces.data ?? [])
    .filter(
      (s) =>
        (!installationQ ||
          s.name.toLowerCase().includes(installationQ.toLowerCase())) &&
        (!installationStatus ||
          ((installations.data ?? []).find((i) => i.space_id === s.id)
            ?.status ?? "Not Scheduled") === installationStatus),
    )
    .sort(
      (a, b) =>
        (installationSort === "name"
          ? a.name.localeCompare(b.name)
          : installationSort === "scheduled"
            ? (
                (installations.data ?? []).find((i) => i.space_id === a.id)
                  ?.scheduled_date ?? "9999"
              ).localeCompare(
                (installations.data ?? []).find((i) => i.space_id === b.id)
                  ?.scheduled_date ?? "9999",
              )
            : installationSort === "updated"
              ? (
                  (installations.data ?? []).find((i) => i.space_id === b.id)
                    ?.updated_at ?? b.updated_at
                ).localeCompare(
                  (installations.data ?? []).find((i) => i.space_id === a.id)
                    ?.updated_at ?? a.updated_at,
                )
              : a.created_at.localeCompare(b.created_at)) ||
        a.id.localeCompare(b.id),
    );
  const satisfied = activeSpaces.filter((s) =>
    (installations.data ?? []).some(
      (i) =>
        i.space_id === s.id &&
        ["Completed", "Not Applicable"].includes(i.status),
    ),
  ).length;
  const selected = operationDetail(query, "installation");
  const Frame = rebuild && !unified ? OperationsFrame : Fragment;
  return (
    <Frame>
      <section
        className={
          unified
            ? `surface ${styles.section}`
            : "surface live-form installation-workspace"
        }
        id="operations-installation"
        tabIndex={-1}
        aria-label="Installation and operational readiness"
      >
        <h2>Installation</h2>
        {!unified && (
          <>
            <div className="installation-progress-summary">
              <div>
                <span>Installation progress</span>
                <strong>{progressLabel(activeSpaces.length, satisfied)}</strong>
              </div>
              <p>
                {satisfied} of {activeSpaces.length} active Spaces satisfied
              </p>
            </div>
            <details className="installation-guidance">
              <OperationSummary>
                How installation progress works
              </OperationSummary>
              <p>
                Active Spaces are equally weighted. Completed and Not Applicable
                satisfy installation requirements. Scheduling and updates are
                tracked per Space, independently of shipping records.
              </p>
            </details>
          </>
        )}
        {!unified && (
          <section
            id="operations-outstanding"
            tabIndex={-1}
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
            {unified && (
              <p className="field-hint">
                Completed and Not Applicable satisfy installation requirements;
                cancelled Spaces are excluded.
              </p>
            )}
            <details open={!unified}>
              <OperationSummary>Operational prerequisites</OperationSummary>
              {readiness.completed ? (
                <p>
                  Operational completion recorded. Review its preserved history
                  in Activity.
                </p>
              ) : readiness.blockers.length > 0 ? (
                rebuild ? (
                  <ReadinessGroups
                    blockers={readiness.blockers}
                    project={project}
                  />
                ) : (
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
                )
              ) : (
                <p>
                  All active design, installation, handoff and logistics
                  requirements are satisfied. Outstanding payments do not block
                  completion.
                </p>
              )}
            </details>
            {!unified && manager && !readiness.completed && (
              <OperationEditor
                enabled={rebuild}
                title="Complete project operations"
                description="Review all prerequisites before confirming operational completion."
              >
                <InstallationForm
                  rebuild={rebuild}
                  project={project}
                  readiness={readiness}
                />
              </OperationEditor>
            )}{" "}
            {readiness.completed && (
              <Link
                href={`/dashboard/projects/${project}?tab=activity&section=history`}
              >
                Reopen through Project monitoring controls
              </Link>
            )}
          </section>
        )}
        <div className={unified ? styles.directory : "operations-record-grid"}>
          {rebuild && (
            <FilterBar
              resultCount={visibleSpaces.length}
              values={{
                ...(typeof query.tab === "string" ? { tab: query.tab } : {}),
                ...(typeof query.section === "string"
                  ? { section: query.section }
                  : {}),
                installation_q: installationQ,
                installation_status: installationStatus,
                installation_sort: installationSort,
              }}
              config={{
                label: "Installation filters",
                search: {
                  key: "installation_q",
                  label: "Search installations",
                  placeholder: "Search installation space…",
                },
                sort: {
                  key: "installation_sort",
                  label: "Sort installations",
                  defaultValue: "created",
                  options: [
                    { value: "created", label: "Creation order" },
                    { value: "name", label: "Space A–Z" },
                    { value: "scheduled", label: "Scheduled date" },
                    { value: "updated", label: "Recently updated" },
                  ],
                },
                fields: [
                  {
                    key: "installation_status",
                    label: "Installation status",
                    options: [
                      { value: "", label: "All statuses" },
                      ...filterOptions(installationStatuses),
                    ],
                  },
                ],
              }}
            />
          )}
          {rebuild && !visibleSpaces.length && (
            <p>No installation records match these filters.</p>
          )}
          {unified && (
            <OperationsDirectory
              kind="installation"
              columns={[
                "Space",
                "Assigned Designer",
                "Status",
                "Scheduled Date",
                "Completed Date",
                "Updated",
              ]}
              rows={visibleSpaces.map((s) => {
                const i = (installations.data ?? []).find(
                  (i) => i.space_id === s.id,
                );
                return {
                  id: s.id,
                  name: s.name,
                  cells: [
                    s.name,
                    names.get(s.primary_designer_id) ??
                      (s.primary_designer_id
                        ? "Assigned Designer"
                        : "Not assigned"),
                    s.cancelled_at
                      ? "Cancelled Space (excluded)"
                      : (i?.status ?? "Not Scheduled"),
                    i?.scheduled_date
                      ? directoryDate(i.scheduled_date)
                      : "Not scheduled",
                    i?.completed_at ? formatTime(i.completed_at) : "—",
                    i?.updated_at ? formatTime(i.updated_at) : "Not recorded",
                  ],
                };
              })}
            />
          )}
          {(rebuild ? visibleSpaces : (spaces.data ?? []))
            .filter((s) => !unified || s.id === selected)
            .map((s) => {
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
              if (unified)
                return (
                  <InstallationDetailsSheet
                    key={s.id}
                    records={visibleSpaces.map((row) => ({
                      id: row.id,
                      name: row.name,
                    }))}
                    id={s.id}
                    name={s.name}
                    designer={
                      names.get(s.primary_designer_id) ??
                      (s.primary_designer_id
                        ? "Assigned Designer"
                        : "Not assigned")
                    }
                    status={
                      <RecordStatus>
                        {s.cancelled_at
                          ? "Cancelled Space (excluded)"
                          : (installation?.status ?? "Not Scheduled")}
                      </RecordStatus>
                    }
                  >
                    <dl className={panel.sheetDates}>
                      <div>
                        <dt>Scheduled date</dt>
                        <dd>
                          {installation?.scheduled_date
                            ? directoryDate(installation.scheduled_date)
                            : "Not scheduled"}
                        </dd>
                      </div>
                      <div>
                        <dt>Completed date</dt>
                        <dd>
                          {installation?.completed_at
                            ? formatTime(installation.completed_at)
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                    <section>
                      <h3>
                        <Users aria-hidden="true" />
                        Design team
                      </h3>
                      <dl>
                        <div>
                          <dt>Primary Designer</dt>
                          <dd>
                            {names.get(s.primary_designer_id) ??
                              (s.primary_designer_id
                                ? "Assigned Designer"
                                : "Not assigned")}
                          </dd>
                        </div>
                        <div>
                          <dt>Supporting Designers</dt>
                          <dd>
                            {(support.data ?? [])
                              .filter((m) => m.space_id === s.id)
                              .map(
                                (m) =>
                                  names.get(m.user_id) ?? "Assigned Designer",
                              )
                              .join(", ") || "None assigned"}
                          </dd>
                        </div>
                      </dl>
                    </section>
                    <section>
                      <h3>
                        <CalendarDays aria-hidden="true" />
                        Installation responsibility
                      </h3>
                      <p>
                        {assigned
                          ? "You are assigned to this Space."
                          : profile.role === "operations_admin"
                            ? "Operations responsibility within this assigned Project."
                            : "Space Designer responsibility; managers retain oversight."}
                      </p>
                      {installation?.status === "Not Applicable" && (
                        <p>
                          Not Applicable:{" "}
                          {events.data
                            ?.filter((e) => e.space_id === s.id)
                            .at(-1)?.reason ||
                            "See installation history for the recorded reason."}
                        </p>
                      )}
                    </section>
                    <section>
                      <h3>
                        <List aria-hidden="true" />
                        Space reference and assignments
                      </h3>
                      <p>Design status: {s.status}</p>
                      <details>
                        <OperationSummary>Record references</OperationSummary>
                        <p>Space ID: {s.id}</p>
                        <p>
                          Primary Designer ID:{" "}
                          {s.primary_designer_id || "Not assigned"}
                        </p>
                        <p>
                          Supporting Designer IDs:{" "}
                          {(support.data ?? [])
                            .filter((m) => m.space_id === s.id)
                            .map((m) => m.user_id)
                            .join(", ") || "None"}
                        </p>
                      </details>
                    </section>
                    {canEdit && (
                      <InstallationActionDialog
                        project={project}
                        space={s.id}
                        name={s.name}
                        installation={installation}
                        manager={manager}
                        held={held}
                        administrative={profile.role === "system_administrator"}
                        handoffAcknowledged={h.status === "Acknowledged"}
                      />
                    )}
                    <Link
                      href={`/dashboard/projects/${project}?tab=activity&section=history&category=Installation&space=${s.id}`}
                    >
                      View installation history in Activity →
                    </Link>
                    <section>
                      <h3>
                        <ClipboardCheck aria-hidden="true" />
                        Project operational readiness
                      </h3>
                      <p>
                        {readiness.completed
                          ? "Operationally Completed"
                          : readiness.ready
                            ? "All operational prerequisites are satisfied."
                            : "Operational prerequisites remain. Review project-level readiness in the Operations workspace."}
                      </p>
                      <p>
                        Completed and Not Applicable satisfy installation
                        requirements; cancelled Spaces are excluded.
                      </p>
                    </section>
                  </InstallationDetailsSheet>
                );
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
                  {rebuild && (
                    <p className="field-hint">
                      Primary Designer:{" "}
                      {names.get(s.primary_designer_id) ?? "Assigned Designer"}
                      {(support.data ?? []).some((m) => m.space_id === s.id)
                        ? ` · Supporting: ${(support.data ?? [])
                            .filter((m) => m.space_id === s.id)
                            .map(
                              (m) =>
                                names.get(m.user_id) ?? "Assigned Designer",
                            )
                            .join(", ")}`
                        : ""}
                    </p>
                  )}
                  {rebuild && (
                    <p className="field-hint">
                      {assigned
                        ? "You are assigned to this Space."
                        : profile.role === "operations_admin"
                          ? "Operations responsibility within this assigned Project."
                          : "Space Designer responsibility; managers retain oversight."}
                    </p>
                  )}
                  {installation?.completed_at && (
                    <p>
                      Installation completed{" "}
                      {formatTime(installation.completed_at)}
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
                    <OperationSummary>
                      Space reference and assignments
                    </OperationSummary>
                    <p>Space ID: {s.id}</p>
                    <p>Primary Designer: {s.primary_designer_id}</p>
                    <p>
                      Supporting Designers:{" "}
                      {(support.data ?? [])
                        .filter((m) => m.space_id === s.id)
                        .map((m) => m.user_id)
                        .join(", ") || "None"}
                    </p>
                  </details>
                  {canEdit && (
                    <OperationEditor
                      enabled={rebuild}
                      title="Schedule or update installation"
                    >
                      <InstallationForm
                        rebuild={rebuild}
                        project={project}
                        space={s.id}
                        installation={installation}
                        manager={manager}
                        held={held}
                      />
                    </OperationEditor>
                  )}
                  {!unified && (
                    <details>
                      <OperationSummary>Installation history</OperationSummary>
                      <ol>
                        {events.data
                          ?.filter((e) => e.space_id === s.id)
                          .map((e) => (
                            <li key={e.id}>
                              {formatTime(e.occurred_at)} · {e.reason}
                              <details>
                                <OperationSummary>
                                  Preserved values and actor
                                </OperationSummary>
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
                  )}
                  {unified && (
                    <Link
                      href={`/dashboard/projects/${project}?tab=activity&section=history&category=Installation&space=${s.id}`}
                    >
                      View installation history in Activity →
                    </Link>
                  )}
                </article>
              );
            })}
        </div>
        {!unified && (
          <details>
            <OperationSummary>Operational completion history</OperationSummary>
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
        )}
      </section>
    </Frame>
  );
}
