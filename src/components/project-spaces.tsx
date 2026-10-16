import { projectIsLost } from "@/lib/workspace-session";
import { DisclosureSummary, SpaceRow } from "./ui-r2/primitives";
import { risk, localDate } from "@/lib/monitoring";
import { randomUUID } from "node:crypto";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime, type Person } from "@/lib/phase1";
import type { Space, Supporter, SpaceEvent } from "@/lib/spaces";
import {
  SpaceEditForm,
  SpaceStatusForm,
  SpaceCancelForm,
  BulkSpaceForm,
} from "./space-forms";
export async function ProjectSpaces({
  project,
  manager,
  people,
}: {
  project: string;
  manager: boolean;
  people: Person[];
}) {
  const rebuild = process.env.ONE_ODC_UI_R0_ENABLED === "true";
  const { client, profile } = await requireWorkspace();
  const lost = await projectIsLost(project);
  const [rows, support, events, monitoring, completion, activity] =
    await Promise.all([
      client
        .from("spaces")
        .select("*")
        .eq("project_id", project)
        .order("created_at")
        .order("id"),
      client
        .from("space_supporters")
        .select("space_id,user_id,assigned_at,spaces!inner(project_id)")
        .eq("spaces.project_id", project),
      client
        .from("space_events")
        .select(
          "id,space_id,action,reason,actor_id,occurred_at,previous_value,new_value",
        )
        .eq("project_id", project)
        .order("occurred_at", { ascending: false })
        .limit(100),
      process.env.ONE_ODC_MONITORING_ENABLED === "true"
        ? client
            .from("project_monitoring")
            .select("state,timezone")
            .eq("project_id", project)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      process.env.ONE_ODC_INSTALLATIONS_ENABLED === "true"
        ? client
            .from("projects")
            .select("is_operationally_completed,commercial_status")
            .eq("id", project)
            .single()
        : { data: null, error: null },
      process.env.ONE_ODC_MONITORING_ENABLED === "true"
        ? client
            .from("project_activities")
            .select("space_id,category,activity_date")
            .eq("project_id", project)
        : { data: [], error: null },
    ]);
  for (const r of [rows, support, events, monitoring, completion, activity])
    checkDatabase(r.error);
  const cancelled =
    lost ||
    monitoring.data?.state === "Cancelled" ||
    completion.data?.is_operationally_completed === true;
  const held = monitoring.data?.state === "On Hold";
  const canManage = manager && !cancelled;
  const spaces = (rows.data || []) as (Space & {
    created_at: string;
    last_progress_at: string | null;
  })[];
  const supporters = (support.data || []) as Supporter[];
  const history = (events.data || []) as SpaceEvent[];
  const name = (id: string) =>
    people.find((p) => p.id === id)?.display_name || id;
  const installations =
    process.env.ONE_ODC_INSTALLATIONS_ENABLED === "true" &&
    completion.data?.commercial_status === "Closed"
      ? await client
          .from("space_installations")
          .select("space_id,status")
          .eq("project_id", project)
      : { data: [], error: null };
  checkDatabase(installations.error);
  const timezone = monitoring.data?.timezone || "Asia/Manila",
    now = new Date().toISOString();
  return (
    <section className="surface live-form project-spaces" id="project-spaces">
      <h2>Spaces</h2>
      <p className="field-hint">
        {spaces.filter((s) => !s.cancelled_at).length} active ·{" "}
        {spaces.filter((s) => s.cancelled_at).length} cancelled.
        {!rebuild &&
          " Duplicate names are supported; each space has a stable ID."}
      </p>
      {cancelled && (
        <p className="field-hint">
          {completion.data?.is_operationally_completed
            ? "This project is operationally completed. Space records and history are read-only until reopening."
            : "This project is locked. Space records and history are read-only."}
        </p>
      )}
      {canManage && (
        <details>
          <DisclosureSummary id="space-create">
            Create a space
          </DisclosureSummary>
          <SpaceEditForm
            key="create"
            newId={randomUUID()}
            project={project}
            supporters={[]}
            people={people}
            manager
          />
        </details>
      )}
      {!spaces.length && <p>No spaces have been created for this project.</p>}
      <div className="space-work-grid">
        {spaces.map((s) => {
          const roster = supporters.filter((a) => a.space_id === s.id);
          const latest = (activity.data ?? [])
            .filter(
              (a) =>
                a.space_id === s.id &&
                ["Design Work", "Revision", "Site Visit"].includes(a.category),
            )
            .map((a) => a.activity_date)
            .sort()
            .at(-1);
          const last =
            latest && latest > localDate(s.last_progress_at || now, timezone)
              ? latest
              : s.last_progress_at || s.created_at;
          const indicator = risk({
            deadline: s.deadline,
            lastProgress: last,
            resolved: !!s.cancelled_at || s.status === "Completed" || cancelled,
            now,
            timezone,
          });
          const editable =
            !cancelled &&
            (manager ||
              (["designer", "lead_designer"].includes(profile.role) &&
                (s.primary_designer_id === profile.id ||
                  roster.some((a) => a.user_id === profile.id))));
          return (
            <SpaceRow
              enabled={rebuild}
              id={`space-${s.id}`}
              key={s.id}
              title={s.name}
              status={s.cancelled_at ? "Cancelled" : s.status}
              designer={name(s.primary_designer_id)}
              deadline={s.deadline || "Not scheduled"}
              risk={
                process.env.ONE_ODC_MONITORING_ENABLED === "true"
                  ? indicator
                  : ""
              }
            >
              <h3>{s.name}</h3>
              <p>
                {s.cancelled_at ? "Cancelled" : s.status} · Revision{" "}
                {s.revision_number}
              </p>
              {process.env.ONE_ODC_MONITORING_ENABLED === "true" && (
                <p className="space-risk">{indicator}</p>
              )}
              <dl className="record-details">
                {process.env.ONE_ODC_INSTALLATIONS_ENABLED === "true" && (
                  <div>
                    <dt>Installation</dt>
                    <dd>
                      {completion.data?.commercial_status === "Closed"
                        ? installations.data?.find((i) => i.space_id === s.id)
                            ?.status || "Not Scheduled"
                        : "After commercial closure"}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Primary Designer</dt>
                  <dd>{name(s.primary_designer_id)}</dd>
                </div>
                <div>
                  <dt>Supporting Designers</dt>
                  <dd>
                    {roster.length
                      ? roster
                          .map(
                            (a) =>
                              `${name(a.user_id)} · ${formatTime(a.assigned_at)}`,
                          )
                          .join("; ")
                      : "None"}
                  </dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>{s.deadline || "Not scheduled"}</dd>
                </div>

                {s.first_completed_at && (
                  <div>
                    <dt>First / latest completion</dt>
                    <dd>
                      {formatTime(s.first_completed_at)} /{" "}
                      {formatTime(s.last_completed_at!)}
                    </dd>
                  </div>
                )}
              </dl>
              <details className="space-technical">
                <DisclosureSummary>
                  Identity and assignment dates
                </DisclosureSummary>
                <p>Space ID: {s.id}</p>
                <p>Primary assigned: {formatTime(s.primary_assigned_at)}</p>
              </details>
              {s.cancelled_at ? (
                <p>
                  Cancelled {formatTime(s.cancelled_at)}:{" "}
                  {s.cancellation_reason}
                </p>
              ) : (
                editable && (
                  <>
                    <details>
                      <DisclosureSummary>Edit space</DisclosureSummary>
                      <SpaceEditForm
                        project={project}
                        space={s}
                        supporters={roster}
                        people={people}
                        manager={manager}
                      />
                    </details>
                    {held ? (
                      <p className="field-hint">
                        Resume the project before changing design status.
                      </p>
                    ) : (
                      <details>
                        <DisclosureSummary>
                          Change design status
                        </DisclosureSummary>
                        <SpaceStatusForm
                          space={s}
                          manager={manager}
                          admin={profile.role === "system_administrator"}
                        />
                      </details>
                    )}
                    {manager && (
                      <details>
                        <DisclosureSummary>Cancel space</DisclosureSummary>
                        <p className="field-hint">
                          Cancellation preserves records and removes this space
                          from active progress.
                        </p>
                        <SpaceCancelForm space={s} />
                      </details>
                    )}
                  </>
                )
              )}
            </SpaceRow>
          );
        })}
      </div>
      {canManage && spaces.some((s) => !s.cancelled_at) && (
        <details>
          <DisclosureSummary>Bulk reassignment</DisclosureSummary>
          <BulkSpaceForm
            key="bulk"
            project={project}
            spaces={spaces}
            people={people}
          />
        </details>
      )}
      <details>
        <DisclosureSummary>Space history (latest 100 events)</DisclosureSummary>
        {!history.length && <p>No space changes recorded.</p>}
        {history.map((h) => (
          <details className="history-entry" key={h.id}>
            <DisclosureSummary>
              {formatTime(h.occurred_at)} · {h.action} · {h.reason}
            </DisclosureSummary>
            <p>
              Space: {h.space_id} · Actor: {h.actor_id}
            </p>
            <h3>Previous record</h3>
            <pre className="history-json">
              {JSON.stringify(h.previous_value, null, 2)}
            </pre>
            <h3>Updated record</h3>
            <pre className="history-json">
              {JSON.stringify(h.new_value, null, 2)}
            </pre>
          </details>
        ))}
      </details>
    </section>
  );
}
