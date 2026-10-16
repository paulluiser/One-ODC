import { FilterBar } from "./filter-bar";
import { projectIsLost } from "@/lib/workspace-session";
import { DisclosureSummary } from "./ui-r2/primitives";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  requireWorkspace,
  projectMonitoringSummary,
  projectTeam,
} from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";

import {
  activityCategories,
  projectWorkState,
  projectMetrics,
  localDate,
  elapsed,
  overdue,
  risk,
  type Activity,
  type Monitoring,
  type TimelineEvent,
} from "@/lib/monitoring";
import {
  ProjectControl,
  ProjectDeadlineForm,
  CoordinatorForm,
  ActivityForm,
} from "./monitoring-forms";
import { ActivityDownload } from "./activity-download";
export async function ProjectMonitoring({
  project,
  manager,
  filters = {},
  nested = false,
}: {
  project: string;
  manager: boolean;
  nested?: boolean;
  filters?: Record<string, string | string[] | undefined>;
}) {
  const { client, profile } = await requireWorkspace();
  const lost = await projectIsLost(project);
  const val = (key: string) =>
    typeof filters[key] === "string" ? String(filters[key]) : "";
  const date = (key: string) =>
    z.iso.date().safeParse(val(key)).success ? val(key) : null;
  const uuid = (key: string) =>
    z.uuid().safeParse(val(key)).success ? val(key) : null;
  const category = [...activityCategories, "System Event"].includes(
    val("category"),
  )
    ? val("category")
    : "";
  const offset = Math.min(
    100000,
    Math.max(0, Number.parseInt(val("offset"), 10) || 0),
  );
  const [
    summary,
    spacesResult,
    activitiesResult,
    coordinatorsResult,
    versionsResult,
    timelineResult,
    attachmentsResult,
  ] = await Promise.all([
    projectMonitoringSummary(project),
    client
      .from("spaces")
      .select("*")
      .eq("project_id", project)
      .order("created_at"),
    client
      .from("project_activities")
      .select("*")
      .eq("project_id", project)
      .order("activity_date", { ascending: false })
      .limit(50),
    client
      .from("project_site_coordinators")
      .select("id,name,active")
      .eq("project_id", project),
    client
      .from("project_activity_versions")
      .select("activity_id,number,snapshot,actor_id,reason,recorded_at")
      .eq("project_id", project)
      .order("recorded_at", { ascending: false })
      .limit(100),
    client.rpc("project_timeline", {
      p_project: project,
      p_category: category,
      p_from: date("from"),
      p_to: date("to"),
      p_actor: uuid("actor"),
      p_space: uuid("space"),
      p_offset: offset,
    }),
    client
      .from("attachment_versions")
      .select("id,original_name,attachments!inner(project_id,archived_at)")
      .eq("attachments.project_id", project)
      .is("attachments.archived_at", null)
      .not("ready_at", "is", null),
  ]);
  for (const r of [
    summary,
    spacesResult,
    activitiesResult,
    coordinatorsResult,
    versionsResult,
    timelineResult,
    attachmentsResult,
  ])
    checkDatabase(r.error);
  const m = (summary.data as Monitoring[])[0];
  if (!m) return null;
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat("en-PH", {
      timeZone: m.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const now = new Date().toISOString();
  const metrics = projectMetrics(m, now);
  const spaces = spacesResult.data || [];
  const activities = (activitiesResult.data || []) as Activity[];
  const timeline = (timelineResult.data || []) as TimelineEvent[];
  const coordinators = coordinatorsResult.data || [];
  const attachments = (attachmentsResult.data || []).map((a) => ({
    id: a.id,
    name: a.original_name,
  }));
  const operationallyCompleted =
    process.env.ONE_ODC_INSTALLATIONS_ENABLED === "true" &&
    projectWorkState(m) === "Operationally Completed";
  const allowedCategories =
    profile.role === "operations_admin"
      ? [
          "Client Coordination",
          "Supplier Update",
          "Installation",
          "General Update",
        ]
      : profile.role === "designer"
        ? [
            "Design Work",
            "Client Coordination",
            "Site Visit",
            "Revision",
            "General Update",
          ]
        : [...activityCategories];
  const categories = operationallyCompleted
    ? allowedCategories.filter((c) =>
        ["Client Coordination", "General Update"].includes(c),
      )
    : allowedCategories;
  const mayRecord = !lost && profile.role !== "bdm";
  const actorOptions = [...new Set(timeline.map((t) => t.actor_id))];
  const team =
    profile.role !== "operations_admin"
      ? await projectTeam(project)
      : { data: [], error: null };
  checkDatabase(team.error);
  const actorName = (id: string) =>
    id === profile.id
      ? profile.display_name
      : (team.data ?? []).find(
          (p: { user_id: string; display_name: string }) => p.user_id === id,
        )?.display_name || `User ${id.slice(0, 8)}`;
  const measures = (
    <>
      <details className="monitoring-measures">
        <DisclosureSummary>
          Progress, aging and deadline details
        </DisclosureSummary>
        <dl className="record-details">
          <div>
            <dt>Work state</dt>
            <dd>
              {operationallyCompleted ? "Operationally Completed" : m.state}
            </dd>
          </div>
          <div>
            <dt>Design progress</dt>
            <dd>
              {metrics.progress} · {m.completed_spaces} of {m.active_spaces}{" "}
              active spaces completed
            </dd>
          </div>
          <div>
            <dt>Project aging</dt>
            <dd>{metrics.age} calendar days across operational cycles</dd>
          </div>
          <div>
            <dt>Original / current cycle aging</dt>
            <dd>
              {metrics.originalAge ?? "Not Available"} /{" "}
              {metrics.cycleAge ?? "Not Available"} days
            </dd>
          </div>
          <div>
            <dt>Overdue days</dt>
            <dd>
              {metrics.overdue} days
              {m.state === "Cancelled" ? " (historical)" : ""}
            </dd>
          </div>
          <div>
            <dt>Total hold duration</dt>
            <dd>{metrics.hold} calendar days</dd>
          </div>
          <div>
            <dt>Project deadline</dt>
            <dd>
              {m.deadline || "Not scheduled"} · Original:{" "}
              {m.original_deadline || "Not scheduled"}
            </dd>
          </div>
          <div>
            <dt>Risk indicator</dt>
            <dd>
              {metrics.risk}
              {m.state === "Cancelled" ? " · Inactive" : ""}
            </dd>
          </div>
          <div>
            <dt>Date boundaries</dt>
            <dd>
              {m.timezone} · Today {localDate(now, m.timezone)} · Start date is
              day 0
            </dd>
          </div>
        </dl>
      </details>
      <p className="field-hint">
        Risk is informational for the project and active spaces: approaching a
        deadline within three calendar days or no meaningful progress for seven
        days is At Risk; unfinished work past its deadline is Overdue. Hold days
        remain part of calendar aging.
      </p>
      {spaces.length > 0 && (
        <details>
          <DisclosureSummary>
            Space aging and deadline indicators
          </DisclosureSummary>
          {spaces.map((s) => {
            const end =
              s.cancelled_at || s.cycle_completed_at || m.cancelled_at || now;
            const inactive =
              !!s.cancelled_at ||
              s.status === "Completed" ||
              m.state === "Cancelled";
            const latest = activities
              .filter(
                (a) =>
                  a.space_id === s.id &&
                  ["Design Work", "Revision", "Site Visit"].includes(
                    a.category,
                  ),
              )
              .map((a) => a.activity_date)
              .sort()
              .at(-1);
            const last =
              latest &&
              latest > localDate(s.last_progress_at || now, m.timezone)
                ? latest
                : s.last_progress_at || s.created_at;
            return (
              <div className="history-entry" key={s.id}>
                <h3>
                  {s.name} · {s.id.slice(0, 8)}
                </h3>
                <p>
                  {elapsed(s.cycle_started_at, end, m.timezone) ??
                    "Not Available"}{" "}
                  calendar days in revision {s.revision_number} ·{" "}
                  {overdue(s.deadline, end, m.timezone)} overdue days
                  {inactive ? " (historical)" : ""} ·{" "}
                  {risk({
                    deadline: s.deadline,
                    lastProgress: last,
                    resolved: inactive,
                    now,
                    timezone: m.timezone,
                  })}
                </p>
                <p className="field-hint">
                  Work first started:{" "}
                  {s.work_started_at
                    ? formatTime(s.work_started_at)
                    : "Not started"}
                  . Original deadline: {s.original_deadline || "Not scheduled"};
                  current: {s.deadline || "Not scheduled"}.
                </p>
                {m.deadline && s.deadline && s.deadline > m.deadline && (
                  <p className="field-hint">
                    Space deadline is later than the project deadline.
                  </p>
                )}
              </div>
            );
          })}
        </details>
      )}
      <details>
        <DisclosureSummary>
          Operational cycle and hold history
        </DisclosureSummary>
        {m.cycles.map((c) => (
          <p key={c.number}>
            Cycle {c.number}: {formatTime(c.started_at)} →{" "}
            {c.ended_at ? formatTime(c.ended_at) : "Active"} ·{" "}
            {c.outcome || "Open"}
          </p>
        ))}
        {m.holds.map((h, i) => (
          <p key={i}>
            Hold: {formatTime(h.started_at)} →{" "}
            {h.ended_at ? formatTime(h.ended_at) : "Active"}
          </p>
        ))}
      </details>
    </>
  );
  const controls = !lost && manager && m.state !== "Cancelled" && (
    <details>
      <DisclosureSummary>
        Project controls and deadline revisions
      </DisclosureSummary>
      <ProjectControl m={m} />
      <ProjectDeadlineForm m={m} />
      <CoordinatorForm project={project} />
    </details>
  );
  const record = mayRecord && m.state !== "Cancelled" && (
    <details>
      <DisclosureSummary>Record project activity</DisclosureSummary>
      <ActivityForm
        project={project}
        id={randomUUID()}
        spaces={m.space_refs
          .filter((s) => s.editable)
          .map((s) => ({
            id: s.id,
            name: `${s.name} · ${s.id.slice(0, 8)}`,
          }))}
        coordinators={coordinators.filter((c) => c.active)}
        attachments={attachments}
        categories={categories}
      />
    </details>
  );
  const timelineSection = (
    <>
      <h3>Project timeline</h3>
      <FilterBar
        resetHref={`/dashboard/projects/${project}`}
        aria-label="Activity timeline filters"
        key={JSON.stringify(filters)}
      >
        <label className="live-field" htmlFor="timeline-category">
          Timeline category
          <select
            id="timeline-category"
            name="category"
            defaultValue={category}
          >
            <option value="">All authorized events</option>
            {[...activityCategories, "System Event"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="live-field" htmlFor="timeline-from">
          From date
          <input
            id="timeline-from"
            name="from"
            type="date"
            defaultValue={date("from") || ""}
          />
        </label>
        <label className="live-field" htmlFor="timeline-to">
          To date
          <input
            id="timeline-to"
            name="to"
            type="date"
            defaultValue={date("to") || ""}
          />
        </label>
        <label className="live-field" htmlFor="timeline-actor">
          Timeline actor
          <select
            id="timeline-actor"
            name="actor"
            defaultValue={uuid("actor") || ""}
          >
            <option value="">All actors</option>
            {actorOptions.map((a) => (
              <option key={a} value={a}>
                {actorName(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="live-field" htmlFor="timeline-space">
          Timeline space
          <select
            id="timeline-space"
            name="space"
            defaultValue={uuid("space") || ""}
          >
            <option value="">All spaces</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      {!timeline.length && <p>No authorized events match these filters.</p>}
      <div className="project-timeline">
        {timeline.map((t) => (
          <article className="history-entry" key={t.id}>
            <h3>
              {t.category === "System Event"
                ? t.description.split(":")[0].replace(/[._]/g, " ")
                : t.category}{" "}
              · {t.date}
            </h3>
            <p className="activity-description">{t.description}</p>
            <p className="field-hint">
              {actorName(t.actor_id)} · Recorded {formatTime(t.recorded_at)}
              {t.space_id
                ? ` · ${spaces.find((s) => s.id === t.space_id)?.name || "Space"}`
                : ""}
            </p>
            <details>
              <DisclosureSummary>Event identifiers</DisclosureSummary>
              <p>
                Actor: {t.actor_id} · Event: {t.id}
                {t.space_id ? ` · Space: ${t.space_id}` : ""}
              </p>
            </details>
          </article>
        ))}
      </div>
      <nav className="pagination" aria-label="Timeline pages">
        {offset > 0 && (
          <a
            href={`?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(filters).filter(([, v]) => typeof v === "string")) as Record<string, string>), offset: String(Math.max(0, offset - 50)) })}`}
          >
            Previous events
          </a>
        )}
        {timeline.length === 50 && (
          <a
            href={`?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(filters).filter(([, v]) => typeof v === "string")) as Record<string, string>), offset: String(offset + 50) })}`}
          >
            Older events
          </a>
        )}
      </nav>
    </>
  );
  const corrections = (
    <>
      <details>
        <DisclosureSummary>
          Manual activity corrections (latest 50 activities)
        </DisclosureSummary>
        {!activities.length && <p>No manual activities recorded.</p>}
        {activities.map((a) => (
          <details className="history-entry" key={a.id}>
            <DisclosureSummary>
              {a.category} · {a.activity_date} · Version {a.version}
            </DisclosureSummary>
            <p className="activity-description">{a.description}</p>
            <p>
              Tagged Site Coordinator:{" "}
              {coordinators.find((c) => c.id === a.coordinator_id)?.name ||
                "None"}
            </p>
            {a.attachment_versions
              .filter((id) => attachments.some((f) => f.id === id))
              .map((id) => (
                <ActivityDownload
                  key={id}
                  id={id}
                  name={attachments.find((f) => f.id === id)!.name}
                />
              ))}
            {mayRecord &&
              (!operationallyCompleted || categories.includes(a.category)) &&
              (manager || a.created_by === profile.id) && (
                <ActivityForm
                  project={project}
                  id={a.id}
                  activity={a}
                  spaces={m.space_refs
                    .filter((s) => s.editable || s.id === a.space_id)
                    .map((s) => ({ id: s.id, name: s.name }))}
                  coordinators={coordinators}
                  attachments={attachments}
                  categories={categories}
                />
              )}
            <details>
              <DisclosureSummary>
                Authorized correction history
              </DisclosureSummary>
              {versionsResult.data
                ?.filter((v) => v.activity_id === a.id)
                .map((v) => (
                  <div key={v.number}>
                    <p>
                      Version {v.number} · {v.reason} · Actor {v.actor_id} ·{" "}
                      {formatTime(v.recorded_at)}
                    </p>
                    <pre className="history-json">
                      {JSON.stringify(v.snapshot, null, 2)}
                    </pre>
                  </div>
                ))}
            </details>
          </details>
        ))}
      </details>
    </>
  );
  return (
    <section
      className="surface live-form project-monitoring"
      id={nested ? undefined : "project-activities"}
      aria-labelledby="monitoring-title"
    >
      <h2 id="monitoring-title">
        {process.env.ONE_ODC_UI_R0_ENABLED === "true"
          ? "Activities and history"
          : "Project monitoring"}
      </h2>
      {process.env.ONE_ODC_UI_R0_ENABLED === "true" ? (
        <>
          {record}
          {timelineSection}
          {controls}
          {measures}
          {corrections}
        </>
      ) : (
        <>
          {measures}
          {controls}
          {record}
          {timelineSection}
          {corrections}
        </>
      )}
    </section>
  );
}
