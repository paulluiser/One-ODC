import { Fragment } from "react";
import { FilterBar } from "./filter-bar";
import {
  filterOptions,
  toolbarText,
  toolbarChoice,
  type ToolbarQuery,
} from "@/lib/filter-toolbar";
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
export async function ProjectLogistics({
  project,
  query = {},
}: {
  project: string;
  query?: ToolbarQuery;
}) {
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
  const logisticsQ = toolbarText(query, "logistics_q"),
    logisticsStatus = toolbarChoice(
      query,
      "logistics_status",
      logisticsStatuses,
    ),
    logisticsBrand = toolbarChoice(query, "logistics_brand", [
      "SFY",
      "Stosa",
      "Both",
    ]),
    logisticsSort = toolbarChoice(
      query,
      "logistics_sort",
      ["created", "supplier"],
      "created",
    );
  const visibleRecords = (
    (records.data as (Logistics & { created_at: string })[]) ?? []
  )
    .filter(
      (r) =>
        (!logisticsQ ||
          `${r.supplier_name} ${r.reference}`
            .toLowerCase()
            .includes(logisticsQ.toLowerCase())) &&
        (!logisticsStatus || r.status === logisticsStatus) &&
        (!logisticsBrand || r.brand === logisticsBrand),
    )
    .sort(
      (a, b) =>
        (logisticsSort === "supplier"
          ? a.supplier_name.localeCompare(b.supplier_name)
          : a.created_at.localeCompare(b.created_at)) ||
        a.id.localeCompare(b.id),
    );
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
        {rebuild && (
          <FilterBar
            resultCount={visibleRecords.length}
            values={{
              ...(typeof query.tab === "string" ? { tab: query.tab } : {}),
              ...(typeof query.section === "string"
                ? { section: query.section }
                : {}),
              logistics_q: logisticsQ,
              logistics_status: logisticsStatus,
              logistics_brand: logisticsBrand,
              logistics_sort: logisticsSort,
            }}
            config={{
              label: "Logistics filters",
              search: {
                key: "logistics_q",
                label: "Search logistics",
                placeholder: "Search supplier or reference…",
              },
              sort: {
                key: "logistics_sort",
                label: "Sort logistics",
                defaultValue: "created",
                options: [
                  { value: "created", label: "Creation order" },
                  { value: "supplier", label: "Supplier A–Z" },
                ],
              },
              fields: [
                {
                  key: "logistics_status",
                  label: "Logistics stage",
                  options: [
                    { value: "", label: "All stages" },
                    ...filterOptions(logisticsStatuses),
                  ],
                },
                {
                  key: "logistics_brand",
                  label: "Brand",
                  options: [
                    { value: "", label: "All brands" },
                    ...filterOptions(["SFY", "Stosa", "Both"]),
                  ],
                },
              ],
            }}
          />
        )}
        {!records.data?.length && <p>No supplier/logistics records yet.</p>}
        {rebuild && !!records.data?.length && !visibleRecords.length && (
          <p>No logistics records match these filters.</p>
        )}
        <div className="operations-record-grid">
          {(rebuild
            ? visibleRecords
            : ((records.data as (Logistics & { created_at: string })[]) ?? [])
          ).map((r) => (
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
