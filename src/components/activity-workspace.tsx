import {
  requireWorkspace,
  projectMonitoringSummary,
  projectTeam,
  projectIsLost,
} from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import {
  activityCategories,
  localDate,
  projectWorkState,
  type Monitoring,
  type Activity,
  type TimelineEvent,
} from "@/lib/monitoring";
import { financialAmount, type Financials } from "@/lib/finance";
import type { Quotation, QuotationVersionSummary } from "@/lib/quotations";
import type { CommercialHandoff } from "@/lib/handoff";
import { readableProjectEvent } from "@/lib/project-workspace-view";
import {
  activityDirectory,
  readableChanges,
  type ActivityRow,
} from "@/lib/activity-workspace";
import { ActivityWorkspaceView } from "./activity-workspace-view";
type SnapshotEvent = {
  id: string;
  reason: string;
  previous_value: unknown;
  new_value: unknown;
};
type ActivityVersion = {
  activity_id: string;
  number: number;
  snapshot: Activity;
  actor_id: string;
  reason: string;
  recorded_at: string;
};
export async function ActivityWorkspace({
  project,
  manager,
  query,
}: {
  project: string;
  manager: boolean;
  query: Record<string, string | string[] | undefined>;
}) {
  const { client, profile } = await requireWorkspace();
  const enabled = (name: string) =>
    process.env[`ONE_ODC_${name}_ENABLED`] === "true";
  const readAll = async (table: string, select = "*") => {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const r = await client
        .from(table)
        .select(select)
        .eq("project_id", project)
        .order(table === "project_activity_versions" ? "activity_id" : "id")
        .order(table === "project_activity_versions" ? "number" : "id")
        .range(offset, offset + 499);
      checkDatabase(r.error);
      const batch = r.data ?? [];
      rows.push(...(batch as unknown as Record<string, unknown>[]));
      if (batch.length < 500) return rows;
    }
  };
  const timeline: TimelineEvent[] = [];
  for (let offset = 0; ; offset += 50) {
    const r = await client.rpc("project_timeline", {
      p_project: project,
      p_category: "",
      p_from: null,
      p_to: null,
      p_actor: null,
      p_space: null,
      p_offset: offset,
    });
    checkDatabase(r.error);
    const batch = (r.data ?? []) as TimelineEvent[];
    timeline.push(...batch);
    if (batch.length < 50) break;
    if (offset >= 100000)
      throw Error(
        "Activity history exceeds the existing timeline paging limit. Narrowing requires a supported backend query.",
      );
  }
  const [
    summary,
    lost,
    spaces,
    coordinators,
    attachments,
    activities,
    versions,
    spaceEvents,
    installationEvents,
    logisticsEvents,
    assignments,
    team,
    financial,
    quotes,
    handoff,
  ] = await Promise.all([
    projectMonitoringSummary(project),
    projectIsLost(project),
    readAll("spaces"),
    readAll("project_site_coordinators"),
    client
      .from("attachment_versions")
      .select("id,original_name,attachments!inner(project_id,archived_at)")
      .eq("attachments.project_id", project)
      .is("attachments.archived_at", null)
      .not("ready_at", "is", null),
    readAll("project_activities"),
    readAll("project_activity_versions"),
    readAll("space_events"),
    enabled("INSTALLATIONS") ? readAll("installation_events") : [],
    enabled("LOGISTICS") ? readAll("logistics_events") : [],
    profile.role !== "operations_admin"
      ? readAll("project_assignment_events")
      : [],
    profile.role !== "operations_admin"
      ? projectTeam(project)
      : { data: [], error: null },
    enabled("FINANCE") && profile.role !== "designer"
      ? client.rpc("get_project_financials", { p_project: project })
      : { data: null, error: null },
    enabled("QUOTATIONS") && profile.role !== "operations_admin"
      ? client.rpc("list_quotation_versions", { p_project: project })
      : { data: [], error: null },
    enabled("HANDOFF")
      ? client.rpc("get_commercial_handoff", { p_project: project })
      : { data: null, error: null },
  ]);
  for (const r of [summary, attachments, team, financial, quotes, handoff])
    checkDatabase(r.error);
  const m = (summary.data as Monitoring[])[0];
  if (!m) return null;
  const names: Record<string, string> = { [profile.id]: profile.display_name };
  for (const p of team.data ?? []) names[p.user_id] = p.display_name;
  for (const s of spaces) names[String(s.id)] = String(s.name);
  for (const c of coordinators) names[String(c.id)] = String(c.name);
  for (const a of attachments.data ?? []) names[a.id] = a.original_name;
  const name = (id: string) => names[id] ?? "Project member";
  const rows: ActivityRow[] = [];
  const add = (
    e: Partial<ActivityRow> &
      Pick<ActivityRow, "id" | "title" | "category" | "at">,
  ) =>
    rows.push({
      description: "",
      actor: "Not recorded",
      date: localDate(e.at, m.timezone),
      space: null,
      related: "Project",
      reason: "",
      changes: [],
      links: [],
      ...e,
    });
  const versionRows = versions as unknown as ActivityVersion[];
  const manual = activities as unknown as Activity[];
  const snapshots = new Map(
    [...spaceEvents, ...installationEvents, ...logisticsEvents].map((e) => [
      String(e.id),
      e as unknown as SnapshotEvent,
    ]),
  );
  const assignmentMap = new Map(assignments.map((e) => [String(e.id), e]));
  for (const t of timeline) {
    // Current manual rows are projections; preserve recorded create/correction events once via version history.
    if (t.kind === "manual" && versionRows.some((v) => v.activity_id === t.id))
      continue;
    if (
      /^activity\.(created|corrected):/.test(t.description) &&
      versionRows.some(
        (v) => v.recorded_at === t.recorded_at && v.actor_id === t.actor_id,
      )
    )
      continue;
    const snap = snapshots.get(t.id),
      assignment = assignmentMap.get(t.id);
    const title =
      t.kind === "manual"
        ? t.category
        : t.category === "System Event"
          ? readableProjectEvent(t.description)
          : t.description.startsWith("Logistics")
            ? "Supplier Update"
            : t.description.startsWith("Installation")
              ? "Installation updated"
              : t.category;
    const description =
      t.kind === "manual"
        ? t.description
        : t.description.includes(":")
          ? t.description.slice(t.description.indexOf(":") + 1).trim()
          : t.description;
    add({
      id: `timeline-${t.id}`,
      title,
      category: t.category === "System Event" ? "System Event" : t.category,
      description,
      actor: name(t.actor_id),
      at: t.recorded_at,
      space: t.space_id,
      related: t.space_id ? (names[t.space_id] ?? "Space") : "Project",
      reason: snap?.reason ?? String(assignment?.reason ?? description),
      changes: readableChanges(
        snap?.previous_value ?? assignment?.previous_assignments,
        snap?.new_value ?? assignment?.new_assignments,
        names,
      ),
      ...(t.kind === "manual" ? { manualId: t.id } : {}),
    });
  }
  for (const v of versionRows) {
    const earlier = versionRows.find(
      (a) => a.activity_id === v.activity_id && a.number === v.number - 1,
    );
    add({
      id: `activity-${v.activity_id}-${v.number}`,
      title: v.number === 1 ? "Activity recorded" : "Activity corrected",
      category: v.number === 1 ? v.snapshot.category : "Corrections",
      description: v.snapshot.description,
      actor: name(v.actor_id),
      at: v.recorded_at,
      space: v.snapshot.space_id,
      related: v.snapshot.space_id
        ? (names[v.snapshot.space_id] ?? "Space")
        : "Project",
      reason: v.reason,
      changes: readableChanges(earlier?.snapshot, v.snapshot, names),
      manualId: v.activity_id,
    });
  }
  const f = financial.data as Financials | null;
  for (const [kind, value] of [
    ["Sale", f?.sale],
    ["Raw", f?.raw],
  ] as const)
    for (const e of value?.history ?? [])
      add({
        id: `value-${e.id}`,
        title: `${kind} adjustment`,
        category: "Financial",
        description: `${financialAmount(e.previous_amount)} → ${financialAmount(e.new_amount)}`,
        actor: name(e.actor_id),
        at: e.occurred_at,
        related: kind,
        reason: e.reason,
        changes: readableChanges(
          { amount: e.previous_amount },
          { amount: e.new_amount },
        ),
        links: [
          {
            label: "View Financial Management",
            href: `/dashboard/projects/${project}?tab=financials&section=finance`,
          },
        ],
      });
  for (const p of [
    ...(f?.client_payments.records ?? []),
    ...(f?.supplier_payments.records ?? []),
  ])
    for (const e of p.history)
      add({
        id: `payment-${e.id}`,
        title: `${p.kind === "client" ? "Client" : "Supplier"} payment ${e.action.replaceAll("_", " ").replaceAll(".", " ")}`,
        category: "Financial",
        description: e.reason || "Payment recorded",
        actor: name(e.actor_id),
        at: e.occurred_at,
        related: `${p.kind === "client" ? "Client" : "Supplier"} payment`,
        reason: e.reason,
        changes: readableChanges(e.previous_value, e.new_value),
        links: [
          {
            label: "View payment",
            href: `/dashboard/projects/${project}?tab=financials&section=finance&payment_detail=${p.id}`,
          },
        ],
      });
  const quotationVersions = (quotes.data ?? []) as QuotationVersionSummary[];
  for (const v of quotationVersions) {
    const r = await client.rpc("get_quotation_version", {
      p_project: project,
      p_version: v.id,
    });
    checkDatabase(r.error);
    const q = r.data as Quotation;
    const links = [
      {
        label: `Open quotation version ${v.number}`,
        href: `/dashboard/projects/${project}?tab=quotation&version=${v.id}`,
      },
    ];
    add({
      id: `quote-created-${v.id}`,
      title: `Quotation version ${v.number} created`,
      category: "Quotation",
      description: `Version ${v.number}`,
      actor: name(v.created_by),
      at: v.created_at,
      related: `Quotation version ${v.number}`,
      links,
    });
    for (const e of q.history ?? [])
      add({
        id: `quote-${e.id}`,
        title: `Quotation ${e.action.replaceAll("_", " ").replaceAll(".", " ")}`,
        category: "Quotation",
        description: e.remarks || `Version ${v.number}`,
        actor: name(e.actor_id),
        at: e.occurred_at,
        related: `Quotation version ${v.number}`,
        reason: e.remarks,
        links,
      });
  }
  const h = handoff.data as CommercialHandoff | null;
  if (h) {
    for (const e of h.events)
      add({
        id: `handoff-event-${e.id}`,
        title: readableProjectEvent(e.action),
        category: "Operational",
        description: e.reason,
        reason: e.reason,
        actor: name(e.actor_id),
        at: e.occurred_at,
      });
    if (
      h.closure &&
      !h.events.some(
        (e) => e.occurred_at === h.closure?.closed_at && /clos/i.test(e.action),
      )
    )
      add({
        id: `closure-${h.closure.id}`,
        title: "Commercial closure",
        category: "Operational",
        actor: name(h.closure.closed_by),
        at: h.closure.closed_at,
        reason: h.closure.reason,
        description: "Deal closed",
        changes: f?.sale
          ? readableChanges({}, { sale_amount: h.closure.sale_amount })
          : [],
      });
    for (const r of h.history) {
      if (
        !h.events.some(
          (e) =>
            e.occurred_at === r.assigned_at && /handoff|assign/i.test(e.action),
        )
      )
        add({
          id: `handoff-${r.id}`,
          title: "Operations handoff assigned",
          category: "Operational",
          description: `Primary Operations Admin: ${name(r.primary_ops_id)}`,
          actor: name(r.assigned_by),
          at: r.assigned_at,
          reason: r.reason,
        });
      if (
        r.acknowledged_at &&
        !h.events.some(
          (e) =>
            e.occurred_at === r.acknowledged_at && /acknowledg/i.test(e.action),
        )
      )
        add({
          id: `handoff-ack-${r.id}`,
          title: "Operations handoff acknowledged",
          category: "Operational",
          description: "Receipt recorded by the assigned Operations Admin.",
          actor: r.acknowledged_by ? name(r.acknowledged_by) : "Not recorded",
          at: r.acknowledged_at,
        });
    }
  }
  // Lifecycle cycles are covered by project events; retain initial cycle creation if it has no event.
  for (const c of m.cycles)
    if (
      !rows.some((e) => e.at === c.started_at && /reopen|cycle/i.test(e.title))
    )
      add({
        id: `cycle-${c.number}`,
        title: `Operational cycle ${c.number} started`,
        category: "Operational",
        description: `${c.outcome ?? "Open"}${c.ended_at ? `; ended ${localDate(c.ended_at, m.timezone)}` : ""}`,
        at: c.started_at,
      });
  const contextual =
    typeof query.finance_history === "string"
      ? query.finance_history
      : typeof query.quotation_history === "string"
        ? query.quotation_history
        : "";
  const scoped = contextual
    ? rows.filter((e) =>
        typeof query.finance_history === "string"
          ? e.links.some((l) =>
              l.href.includes(`payment_detail=${contextual}`),
            ) || e.related === contextual
          : e.links.some((l) => l.href.includes(`version=${contextual}`)),
      )
    : rows;
  const directory = activityDirectory(scoped, query);
  const text = (key: string) =>
    typeof query[key] === "string" ? query[key] : "";
  const selectedId = text("activity_detail");
  const selected = directory.all.find((e) => e.id === selectedId);
  const completed = projectWorkState(m) === "Operationally Completed";
  const allowed =
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
  const categories = completed
    ? allowed.filter((c) =>
        ["Client Coordination", "General Update"].includes(c),
      )
    : allowed;
  const selectedActivity = selected?.manualId
    ? manual.find((a) => a.id === selected.manualId)
    : undefined;
  const editable =
    selectedActivity &&
    !lost &&
    profile.role !== "bdm" &&
    (!completed || categories.includes(selectedActivity.category)) &&
    (manager || selectedActivity.created_by === profile.id)
      ? selectedActivity
      : undefined;
  const fileOptions = (attachments.data ?? []).map((a) => ({
    id: a.id,
    name: a.original_name,
  }));

  const contextIds = contextual
    ? directory.all
        .filter((e) =>
          text("finance_history")
            ? e.links.some((l) =>
                l.href.includes(`payment_detail=${contextual}`),
              ) || e.related === contextual
            : e.links.some((l) => l.href.includes(`version=${contextual}`)),
        )
        .map((e) => e.id)
    : null;
  return (
    <ActivityWorkspaceView
      project={project}
      m={m}
      rows={directory.rows}
      allCount={directory.all.length}
      financialCount={
        directory.all.filter((e) => e.category === "Financial").length
      }
      correctionCount={
        directory.all.filter((e) => e.category === "Corrections").length
      }
      count={directory.count}
      offset={directory.offset}
      error={directory.error}
      query={query}
      selected={selected}
      activity={editable}
      contextIds={contextIds}
      options={{
        spaces: m.space_refs
          .filter((s) => s.editable || s.id === selectedActivity?.space_id)
          .map((s) => ({ id: s.id, name: s.name })),
        coordinators: coordinators
          .filter((c) => c.active || c.id === selectedActivity?.coordinator_id)
          .map((c) => ({
            id: String(c.id),
            name: String(c.name),
            active: Boolean(c.active),
          })),
        attachments: fileOptions,
        categories,
      }}
      manager={!lost && manager && m.state !== "Cancelled"}
      categories={[...new Set(directory.all.map((e) => e.category))]}
      actors={[...new Set(directory.all.map((e) => e.actor))]}
      spaces={spaces.map((s) => ({ id: String(s.id), name: String(s.name) }))}
      files={(selected?.manualId
        ? (versionRows.find(
            (v) => `activity-${v.activity_id}-${v.number}` === selected.id,
          )?.snapshot.attachment_versions ??
          selectedActivity?.attachment_versions ??
          [])
        : []
      ).flatMap((id) => fileOptions.filter((f) => f.id === id))}
      versions={
        selectedActivity
          ? versionRows
              .filter((v) => v.activity_id === selectedActivity.id)
              .sort((a, b) => b.number - a.number)
              .map((v) => ({
                number: v.number,
                at: v.recorded_at,
                actor: name(v.actor_id),
                reason: v.reason,
                changes: readableChanges(
                  versionRows.find(
                    (a) =>
                      a.activity_id === v.activity_id &&
                      a.number === v.number - 1,
                  )?.snapshot,
                  v.snapshot,
                  names,
                ),
              }))
          : []
      }
    />
  );
}
