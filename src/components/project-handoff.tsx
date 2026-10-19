import Link from "next/link";
import styles from "./operations-workspace.module.css";
import { Fragment } from "react";
import {
  OperationSummary,
  OperationEditor,
  OperationsFrame,
} from "./ui-r4/primitives";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime } from "@/lib/phase1";
import { financialAmount } from "@/lib/finance";
import type { CommercialHandoff } from "@/lib/handoff";
import { HandoffForm } from "./handoff-form";
export async function ProjectHandoff({
  project,
  unified = false,
}: {
  project: string;
  unified?: boolean;
}) {
  const rebuild = process.env.ONE_ODC_UI_R0_ENABLED === "true";
  const { client } = await requireWorkspace();
  const result = await client.rpc("get_commercial_handoff", {
    p_project: project,
  });
  checkDatabase(result.error);
  const data = result.data as CommercialHandoff;
  if (unified)
    return (
      <section
        className={`surface ${styles.section}`}
        id="operations-handoff"
        tabIndex={-1}
        aria-label="Commercial handoff"
      >
        <header className={styles.heading}>
          <h2>Commercial handoff</h2>
          <Link
            href={`/dashboard/projects/${project}?tab=activity&section=history&category=System+Event`}
          >
            View full handoff history in Activity →
          </Link>
        </header>
        <dl className={styles.facts}>
          <div>
            <dt>Commercial stage</dt>
            <dd>{data.commercial_status}</dd>
          </div>
          <div>
            <dt>Handoff status</dt>
            <dd>{data.status}</dd>
          </div>
          <div>
            <dt>Commercially closed</dt>
            <dd>
              {data.closed_at ? formatTime(data.closed_at) : "Not closed"}
            </dd>
          </div>
          <div>
            <dt>Handoff age</dt>
            <dd>
              {data.age_days === null
                ? "Not applicable"
                : `${data.age_days} calendar days`}
            </dd>
          </div>
        </dl>
        {data.can_close && (
          <OperationEditor
            enabled
            title="Commercial closure"
            description="Confirm the existing Sale and Operations assignment before closing."
          >
            <HandoffForm rebuild data={data} intent="close" />
          </OperationEditor>
        )}
        {data.can_acknowledge && (
          <HandoffForm rebuild data={data} intent="acknowledge" />
        )}
      </section>
    );
  const Frame = rebuild ? OperationsFrame : Fragment;
  return (
    <Frame>
      <section
        className="surface live-form handoff-summary"
        aria-label="Commercial closure and operational handoff"
      >
        <h2>
          {data.sale
            ? "Commercial closure and operational handoff"
            : "Operational handoff"}
        </h2>
        <p>
          Commercial stage: <strong>{data.commercial_status}</strong> · Handoff:{" "}
          <strong>{data.status}</strong>
        </p>
        <p>
          Handoff age:{" "}
          {data.age_days === null
            ? "Not applicable"
            : `${data.age_days} calendar days`}{" "}
        </p>
        {data.closed_at && (
          <p>Commercially closed {formatTime(data.closed_at)}.</p>
        )}
        {data.can_close && (
          <>
            <p>
              Sale prerequisite:{" "}
              {data.sale?.amount === null
                ? "Not recorded"
                : financialAmount(data.sale?.amount)}
              .
            </p>
            <p>
              Primary Operations Admin:{" "}
              {rebuild
                ? data.primary_ops_id
                  ? "Assigned"
                  : "Not assigned — update Project assignments"
                : (data.primary_ops_id ??
                  "Not assigned — ask the Lead Designer or System Administrator to update Project assignments.")}
            </p>
            <OperationEditor
              enabled={rebuild}
              title="Commercial closure"
              description="Confirm the existing Sale and Operations assignment before closing."
            >
              <HandoffForm rebuild={rebuild} data={data} intent="close" />
            </OperationEditor>
          </>
        )}
        {data.can_acknowledge && (
          <HandoffForm rebuild={rebuild} data={data} intent="acknowledge" />
        )}
        <details>
          <OperationSummary>Closure and handoff history</OperationSummary>
          <p className="field-hint">
            Handoff age is measured from original commercial closure to
            acknowledgment; reassignments retain original closure age.
          </p>
          {data.closure && (
            <section aria-label="Commercial closure history">
              <h3>Commercial closure history</h3>
              <p>
                {formatTime(data.closure.closed_at)} · Actor:{" "}
                {data.closure.closed_by} · Sale at closure:{" "}
                {financialAmount(data.closure.sale_amount)}
              </p>
              <p>
                {data.closure.reason}
                {data.closure.administrative_override
                  ? " · Audited administrative closure"
                  : ""}
              </p>
            </section>
          )}
          <h3>Handoff history</h3>
          {data.history.length ? (
            <ol>
              {data.history.map((h) => (
                <li key={h.id}>
                  Handoff {h.number} · {h.status}
                  {h.superseded_at ? " · Reassigned" : " · Current"}
                  <p>
                    Primary Operations Admin: {h.primary_ops_id} · Assigned{" "}
                    {formatTime(h.assigned_at)} by {h.assigned_by}
                  </p>
                  <p>{h.reason}</p>
                  {h.acknowledged_at && (
                    <p>
                      Acknowledged {formatTime(h.acknowledged_at)} by{" "}
                      {h.acknowledged_by}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p>No operational handoff has been recorded.</p>
          )}
          {data.events.length > 0 && (
            <details>
              <OperationSummary>Handoff activity history</OperationSummary>
              <ol>
                {data.events.map((e) => (
                  <li key={e.id}>
                    {e.action} · {formatTime(e.occurred_at)} · Actor:{" "}
                    {e.actor_id} · {e.reason}
                  </li>
                ))}
              </ol>
            </details>
          )}
          <p className="field-hint">
            Commercial closure and acknowledgment do not mark any Space or
            Project as operationally completed. Completion requires the explicit
            operational readiness checklist.
          </p>
        </details>
      </section>
    </Frame>
  );
}
