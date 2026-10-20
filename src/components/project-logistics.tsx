import { OperationsDetailsSheet } from "./operations-details-sheet";
import { LogisticsActionDialog } from "./logistics-action-dialog";
import { operationDetail } from "@/lib/operations-workspace";
import panel from "./installation-dialog.module.css";
import { Truck, FileText, Clock3 } from "lucide-react";
import { OperationsDirectory } from "./operations-directory";
import styles from "./operations-workspace.module.css";
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
  const receipt = await client.rpc("has_operational_receipt", {
    p_project: project,
  });
  checkDatabase(receipt.error);
  const acknowledged = receipt.data === true;
  const held = monitoring.data?.[0]?.state === "On Hold";
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
      ["created", "supplier", "stage", "updated"],
      "created",
    );
  const visibleRecords = (
    (records.data as (Logistics & {
      created_at: string;
      updated_at: string;
    })[]) ?? []
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
          : logisticsSort === "stage"
            ? logisticsStatuses.indexOf(a.status) -
              logisticsStatuses.indexOf(b.status)
            : logisticsSort === "updated"
              ? b.updated_at.localeCompare(a.updated_at)
              : a.created_at.localeCompare(b.created_at)) ||
        a.id.localeCompare(b.id),
    );
  const permitted = manager || profile.role === "operations_admin",
    writable =
      permitted &&
      !p.data?.is_cancelled &&
      !completed &&
      (manager || acknowledged);
  const supplierResult = permitted
    ? await client
        .from("suppliers")
        .select("*")
        .eq("active", true)
        .order("name")
    : { data: [], error: null };
  checkDatabase(supplierResult.error);
  const suppliers = (supplierResult.data ?? []) as Supplier[];
  const selected = operationDetail(query, "logistics");
  const Frame = rebuild && !unified ? OperationsFrame : Fragment;
  return (
    <Frame>
      <section
        className={
          unified
            ? `surface ${styles.section}`
            : "surface live-form logistics-workspace"
        }
        id="operations-logistics"
        tabIndex={-1}
        aria-label="Supplier and logistics workspace"
      >
        {unified ? (
          <header className={`${styles.heading} ${styles.logisticsHeader}`}>
            <h2>Supplier & Logistics</h2>
            {writable && !held && (
              <LogisticsActionDialog
                id={randomUUID()}
                project={project}
                suppliers={suppliers}
                manager={manager}
                administrative={profile.role === "system_administrator"}
                handoffAcknowledged={acknowledged}
              />
            )}
          </header>
        ) : (
          <>
            <h2>Supplier & Logistics</h2>
            <details>
              <OperationSummary>
                Logistics terms and financial boundaries
              </OperationSummary>
              <p>
                RFP means Request for Payment, tracked only; requests and
                approvals occur outside One ODC. Landed means arrival in the
                destination country. Delivery does not complete installation.
              </p>
            </details>
          </>
        )}
        {!rebuild && (
          <p>
            Operational receipt: {acknowledged ? "Acknowledged" : "Pending"}.
            Raw and supplier payments remain consolidated Project-level records.
          </p>
        )}
        {!unified && permitted && (
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
        {!unified && writable && !held && (
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
                  { value: "stage", label: "Current stage" },
                  { value: "updated", label: "Recently updated" },
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
        {unified && (
          <OperationsDirectory
            kind="logistics"
            columns={[
              "Supplier",
              "Current Stage",
              "Requested Date",
              "Expected Date",
              "Status",
              "Updated",
            ]}
            rows={visibleRecords.map((r) => ({
              id: r.id,
              name: r.supplier_name,
              cells: [
                r.supplier_name,
                r.status,
                "Not recorded",
                "Not recorded",
                r.status === "On Hold" || r.status === "Cancelled"
                  ? r.status
                  : "—",
                formatTime(r.updated_at),
              ],
            }))}
          />
        )}
        <div className="operations-record-grid">
          {(rebuild
            ? visibleRecords
            : ((records.data as (Logistics & {
                created_at: string;
                updated_at: string;
              })[]) ?? [])
          )
            .filter((r) => !unified || r.id === selected)
            .map((r) => {
              if (unified) {
                const events = (
                  (history.data as LogisticsEvent[]) ?? []
                ).filter((e) => e.logistics_id === r.id);
                return (
                  <OperationsDetailsSheet
                    key={r.id}
                    kind="logistics"
                    id={r.id}
                    name={r.supplier_name}
                    status={<RecordStatus>{r.status}</RecordStatus>}
                    description={`${r.brand || "Brand not specified"} · Reference: ${r.reference || "Not provided"}`}
                    records={visibleRecords.map((row) => ({
                      id: row.id,
                      name: `${row.supplier_name} · ${row.reference || "No reference"}`,
                    }))}
                  >
                    <section>
                      <h3>
                        <FileText aria-hidden="true" />
                        Record information
                      </h3>
                      <dl className={panel.logisticsFacts}>
                        <div>
                          <dt>Supplier</dt>
                          <dd>{r.supplier_name}</dd>
                        </div>
                        <div>
                          <dt>Supplier reference</dt>
                          <dd>{r.reference || "Not provided"}</dd>
                        </div>
                        <div>
                          <dt>Brand</dt>
                          <dd>{r.brand || "Not specified"}</dd>
                        </div>
                        <div>
                          <dt>Current stage</dt>
                          <dd>
                            <RecordStatus>{r.status}</RecordStatus>
                          </dd>
                        </div>
                        <div>
                          <dt>Status recorded</dt>
                          <dd>{formatTime(r.status_at)}</dd>
                        </div>
                        <div>
                          <dt>Last updated</dt>
                          <dd>{formatTime(r.updated_at)}</dd>
                        </div>
                      </dl>
                    </section>
                    <section>
                      <h3>
                        <Truck aria-hidden="true" />
                        Logistics progress
                      </h3>
                      <ol
                        className={panel.stageSequence}
                        aria-label="Logistics stage sequence"
                      >
                        {logisticsStatuses.slice(0, 7).map((stage, index) => (
                          <li
                            key={stage}
                            aria-current={
                              r.status === stage ? "step" : undefined
                            }
                          >
                            <span>{index + 1}</span>
                            {stage}
                          </li>
                        ))}
                      </ol>
                      <p className="field-hint">
                        Sequence reference only. Earlier or skipped stages are
                        not marked completed.
                      </p>
                      {r.held_status && <p>On Hold from {r.held_status}</p>}
                      {events
                        .filter((e) => skippedTransition(e))
                        .map((e) => (
                          <p key={e.id}>
                            Skipped stages · {skippedTransition(e)} · {e.reason}
                          </p>
                        ))}
                    </section>
                    <section>
                      <h3>
                        <FileText aria-hidden="true" />
                        Record reference & remarks
                      </h3>
                      <p
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {r.remarks || "No remarks recorded."}
                      </p>
                      <details>
                        <OperationSummary>Audit references</OperationSummary>
                        <p>Record ID: {r.id}</p>
                        <p>Supplier ID: {r.supplier_id}</p>
                        <p>Updated by: {r.updated_by}</p>
                      </details>
                    </section>
                    <section>
                      <h3>
                        <Clock3 aria-hidden="true" />
                        Recent activity
                      </h3>
                      {events.length ? (
                        <ol className={panel.recent}>
                          {events
                            .slice()
                            .sort(
                              (a, b) =>
                                b.occurred_at.localeCompare(a.occurred_at) ||
                                b.version - a.version,
                            )
                            .slice(0, 3)
                            .map((e) => (
                              <li key={e.id}>
                                <strong>
                                  {e.action === "status_changed"
                                    ? `Stage changed to ${(e.new_value as { status?: string })?.status || "recorded stage"}`
                                    : e.action === "created"
                                      ? "Record created"
                                      : "Record details updated"}
                                </strong>
                                <time dateTime={e.occurred_at}>
                                  {formatTime(e.occurred_at)}
                                </time>
                                <p>{e.reason}</p>
                              </li>
                            ))}
                        </ol>
                      ) : (
                        <p>No authorized activity recorded.</p>
                      )}
                    </section>
                    {writable && (
                      <LogisticsActionDialog
                        id={r.id}
                        project={project}
                        record={r}
                        suppliers={suppliers}
                        manager={manager}
                        held={held}
                        administrative={profile.role === "system_administrator"}
                        handoffAcknowledged={acknowledged}
                      />
                    )}
                    <Link
                      href={`/dashboard/projects/${project}?tab=activity&section=history&category=Supplier+Update`}
                    >
                      View logistics history in Activity →
                    </Link>
                  </OperationsDetailsSheet>
                );
              }
              return (
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
                            aria-current={
                              r.status === stage ? "step" : undefined
                            }
                          >
                            {stage}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                  {r.held_status && (
                    <p className="exception-notice">
                      On Hold from {r.held_status}
                    </p>
                  )}
                  {((history.data as LogisticsEvent[]) ?? [])
                    .filter(
                      (event) =>
                        event.logistics_id === r.id && skippedTransition(event),
                    )
                    .map((event) => (
                      <p className="exception-notice" key={event.id}>
                        Skipped stages · {skippedTransition(event)} ·{" "}
                        {event.reason}
                      </p>
                    ))}
                  <details>
                    <OperationSummary>Record reference</OperationSummary>
                    <p>
                      Record {r.id} · Updated by {r.updated_by}
                    </p>
                  </details>
                  {(r.remarks || !rebuild) && (
                    <p
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
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
                  {!unified && (
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
                  )}
                  {unified && (
                    <Link
                      href={`/dashboard/projects/${project}?tab=activity&section=history&category=Supplier+Update`}
                    >
                      View logistics history in Activity →
                    </Link>
                  )}
                </article>
              );
            })}
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
