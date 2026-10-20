import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import type { Readiness } from "@/lib/installations";
import type { CommercialHandoff } from "@/lib/handoff";
import type { ToolbarQuery } from "@/lib/filter-toolbar";
import { toolbarText } from "@/lib/filter-toolbar";
import { formatTime } from "@/lib/phase1";
import { OperationSummary } from "./ui-r4/primitives";
export async function OperationsHistory({
  project,
  query,
}: {
  project: string;
  query: ToolbarQuery;
}) {
  const { client } = await requireWorkspace();
  const result = await client.rpc("get_commercial_handoff", {
    p_project: project,
  });
  checkDatabase(result.error);
  const h = result.data as CommercialHandoff;
  const ready =
    process.env.ONE_ODC_MONITORING_ENABLED === "true"
      ? await client.rpc("operational_readiness", { p_project: project })
      : { data: null, error: null };
  checkDatabase(ready.error);
  const completion = ready.data as Readiness | null;
  const events = [
    ...(completion?.history ?? []).map((c) => ({
      id: `completion-${c.cycle}`,
      at: c.completed_at,
      title: "Operational completion",
      reason: c.reason,
      detail: c,
    })),
    ...(h.closure
      ? [
          {
            id: h.closure.id,
            at: h.closure.closed_at,
            title: "Commercial closure",
            reason: h.closure.reason,
            detail: h.closure,
          },
        ]
      : []),
    ...h.history.flatMap((r) => [
      {
        id: r.id,
        at: r.assigned_at,
        title: r.superseded_at
          ? "Operations handoff reassigned"
          : "Operations handoff assigned",
        reason: r.reason,
        detail: r,
      },
      ...(r.acknowledged_at
        ? [
            {
              id: `${r.id}-ack`,
              at: r.acknowledged_at,
              title: "Operations handoff acknowledged",
              reason: "Receipt recorded by the assigned Operations Admin.",
              detail: r,
            },
          ]
        : []),
    ]),
    ...h.events.map((e) => ({
      id: e.id,
      at: e.occurred_at,
      title: e.action.replaceAll("_", " ").replaceAll(".", " "),
      reason: e.reason,
      detail: e,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const page = Math.min(
    Math.max(1, Number.parseInt(toolbarText(query, "handoff_page"), 10) || 1),
    Math.max(1, Math.ceil(events.length / 10)),
  );
  const url = (n: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (typeof value === "string") next.set(key, value);
    next.set("tab", "activity");
    next.set("section", "history");
    next.set("handoff_page", String(n));
    return `/dashboard/projects/${project}?${next}#operational-history`;
  };
  return (
    <section
      id="operational-history"
      aria-label="Commercial closure and handoff history"
    >
      <h3>Commercial closure & handoff history</h3>
      <p className="field-hint">
        Installation, supplier transitions and operational completion appear in
        the filtered project timeline above.
      </p>
      {!events.length ? (
        <p>No commercial closure or handoff recorded.</p>
      ) : (
        <>
          {events.slice((page - 1) * 10, page * 10).map((e) => (
            <article className="history-entry" key={e.id}>
              <h4>{e.title}</h4>
              <p>{e.reason}</p>
              <p className="field-hint">{formatTime(e.at)}</p>
              <details>
                <OperationSummary>Audit details</OperationSummary>
                <pre className="history-json">
                  {JSON.stringify(e.detail, null, 2)}
                </pre>
              </details>
            </article>
          ))}
          <nav aria-label="Handoff history pages">
            {page > 1 && <Link href={url(page - 1)}>Previous</Link>}
            <span>
              {" "}
              Page {page} of {Math.ceil(events.length / 10)}{" "}
            </span>
            {page * 10 < events.length && (
              <Link href={url(page + 1)}>Next</Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
