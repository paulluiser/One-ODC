import { Fragment } from "react";
import {
  OperationSummary,
  OperationEditor,
  OperationsFrame,
  LogisticsTracker,
} from "./ui-r4/primitives";
import Link from "next/link";
import { RecordStatus } from "./record-table";
import { logisticsStatuses } from "@/lib/logistics";
import { randomUUID } from "node:crypto";
import {
  requireWorkspace,
  projectMonitoringSummary,
} from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime } from "@/lib/phase1";
import type { Supplier, Logistics, LogisticsEvent } from "@/lib/logistics";
import type { CommercialHandoff } from "@/lib/handoff";
import { LogisticsForm } from "./logistics-form";
function skippedTransition(event: LogisticsEvent) {
  const previous = event.previous_value as {
    status?: string;
    held_status?: string;
  } | null;
  const current = event.new_value as { status?: string } | null;
  const from =
    previous?.status === "On Hold" ? previous.held_status : previous?.status;
  const stages: readonly string[] = logisticsStatuses.slice(0, 7);
  const start = stages.indexOf(from ?? ""),
    end = stages.indexOf(current?.status ?? "");
  return start >= 0 && end > start + 1
    ? `${from} → ${current?.status}: skipped ${stages.slice(start + 1, end).join(", ")}`
    : null;
}
export async function ProjectLogistics({ project }: { project: string }) {
  const rebuild = process.env.ONE_ODC_UI_R0_ENABLED === "true";
  const { client, profile } = await requireWorkspace();
  const p = await client
    .from("projects")
    .select("commercial_status,is_cancelled,lead_designer_id")
    .eq("id", project)
    .single();
  checkDatabase(p.error);
  if (p.data?.commercial_status !== "Closed")
    return (
      <section className="surface live-form">
        <h2>Supplier & Logistics</h2>
        <p>
          Operational logistics details become available after commercial
          closure.
        </p>
      </section>
    );
  const [records, history, handoff, monitoring] = await Promise.all([
    client
      .from("project_logistics")
      .select("*")
      .eq("project_id", project)
      .order("created_at"),
    client
      .from("logistics_events")
      .select("*")
      .eq("project_id", project)
      .order("occurred_at"),
    client.rpc("get_commercial_handoff", { p_project: project }),
    projectMonitoringSummary(project),
  ]);
  for (const r of [records, history, handoff, monitoring])
    checkDatabase(r.error);
  const h = handoff.data as CommercialHandoff,
    held = monitoring.data?.[0]?.state === "On Hold";
  const manager =
    profile.role === "system_administrator" ||
    (profile.role === "lead_designer" &&
      p.data?.lead_designer_id === profile.id);
  const completion =
    process.env.ONE_ODC_INSTALLATIONS_ENABLED === "true"
      ? await client
          .from("projects")
          .select("is_operationally_completed")
          .eq("id", project)
          .single()
      : { data: null, error: null };
  checkDatabase(completion.error);
  const completed = completion.data?.is_operationally_completed === true;
  const permitted = manager || profile.role === "operations_admin",
    writable =
      permitted &&
      !p.data?.is_cancelled &&
      !completed &&
      (manager || h.status === "Acknowledged");
  const supplierResult = permitted
    ? await client
        .from("suppliers")
        .select("*")
        .eq("active", true)
        .order("name")
    : { data: [], error: null };
  checkDatabase(supplierResult.error);
  const suppliers = (supplierResult.data ?? []) as Supplier[];
  const Frame = rebuild ? OperationsFrame : Fragment;
  return (
    <Frame>
      <section
        className="surface live-form logistics-workspace"
        aria-label="Supplier and logistics workspace"
      >
        <h2>Supplier & Logistics</h2>
        <details>
          <OperationSummary>
            Logistics terms and financial boundaries
          </OperationSummary>
          <p>
            RFP means Request for Payment, tracked only; requests and approvals
            occur outside One ODC. Landed means arrival in the destination
            country. Delivery does not complete installation.
          </p>
        </details>
        {!rebuild && (
          <p>
            Current handoff: {h.status}. Raw and supplier payments remain
            consolidated Project-level records.
          </p>
        )}
        {permitted && (
          <Link href="/dashboard/suppliers">Manage Supplier Masterlist</Link>
        )}
        {!writable && (
          <p>
            {p.data?.is_cancelled
              ? "Project cancelled; logistics history is preserved and changes are frozen."
              : completed
                ? "Operationally completed; reopen the Project before logistics changes."
                : permitted
                  ? "Acknowledge the current handoff before ordinary logistics actions."
                  : "Read-only operational monitoring."}
          </p>
        )}
        {held && (
          <p>
            Project On Hold: new records and status changes are blocked;
            authorized metadata corrections remain available.
          </p>
        )}
        {writable && !held && (
          <OperationEditor enabled={rebuild} title="Add logistics record">
            <LogisticsForm
              rebuild={rebuild}
              id={randomUUID()}
              project={project}
              suppliers={suppliers}
              manager={manager}
            />
          </OperationEditor>
        )}
        {!records.data?.length && <p>No supplier/logistics records yet.</p>}
        <div className="operations-record-grid">
          {((records.data as Logistics[]) ?? []).map((r) => (
            <article
              className="surface live-form operations-record"
              key={r.id}
              id={`logistics-${r.id}`}
              aria-label={`Logistics ${r.id}`}
            >
              <h3>
                {r.supplier_name} · <RecordStatus>{r.status}</RecordStatus>
              </h3>
              <p>
                {r.brand || "No brand"} · Reference:{" "}
                {r.reference || "Not provided"}
              </p>
              <p className="field-hint">
                Status recorded {formatTime(r.status_at)}
              </p>
              {rebuild ? (
                <LogisticsTracker
                  stages={logisticsStatuses.slice(0, 7)}
                  current={r.status}
                />
              ) : (
                <>
                  <ol
                    className="logistics-progression"
                    aria-label="Logistics stage sequence"
                  >
                    {logisticsStatuses.slice(0, 7).map((stage) => (
                      <li
                        key={stage}
                        aria-current={r.status === stage ? "step" : undefined}
                      >
                        {stage}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {r.held_status && (
                <p className="exception-notice">On Hold from {r.held_status}</p>
              )}
              {((history.data as LogisticsEvent[]) ?? [])
                .filter(
                  (event) =>
                    event.logistics_id === r.id && skippedTransition(event),
                )
                .map((event) => (
                  <p className="exception-notice" key={event.id}>
                    Skipped stages · {skippedTransition(event)} · {event.reason}
                  </p>
                ))}
              <details>
                <OperationSummary>Record reference</OperationSummary>
                <p>
                  Record {r.id} · Updated by {r.updated_by}
                </p>
              </details>
              {(r.remarks || !rebuild) && (
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {r.remarks || "No remarks"}
                </p>
              )}
              {writable && (
                <OperationEditor
                  enabled={rebuild}
                  title="Edit logistics / change status"
                >
                  <LogisticsForm
                    rebuild={rebuild}
                    id={r.id}
                    project={project}
                    suppliers={suppliers}
                    record={r}
                    held={held}
                    manager={manager}
                  />
                </OperationEditor>
              )}
              <details>
                <OperationSummary>
                  Logistics status and audit history
                </OperationSummary>
                <ol>
                  {((history.data as LogisticsEvent[]) ?? [])
                    .filter((e) => e.logistics_id === r.id)
                    .map((e) => (
                      <li key={e.id}>
                        {e.action.replaceAll("_", " ")} ·{" "}
                        {formatTime(e.occurred_at)} · {e.reason}
                        {e.administrative_override
                          ? " · Audited administrative override"
                          : ""}
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
            </article>
          ))}
        </div>
        {permitted && (
          <Link href={`/dashboard/projects/${project}?tab=finance`}>
            View authorized Project payment context
          </Link>
        )}
      </section>
    </Frame>
  );
}
