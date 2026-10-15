import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Activity,
} from "lucide-react";
import { dashboardPrimary } from "@/lib/workspace-presentation";
import {
  dashboardMetrics,
  dashboardUrl,
  type DashboardData,
} from "@/lib/dashboard";
import { financialAmount } from "@/lib/finance";
import { formatTime } from "@/lib/phase1";
export function RoleDashboard({ data }: { data: DashboardData }) {
  const definitions = dashboardMetrics[data.role],
    selected = definitions.find((m) => m.key === data.view);
  const selectedCount =
    selected?.key === "workload"
      ? data.workload_count
      : (data.metrics[data.view]?.count ?? 0);
  const entries = (
    items: DashboardData["records"],
    empty: string,
    linkRecords = true,
  ) =>
    items.length ? (
      <ul className="dashboard-records">
        {items.map((r) => (
          <li key={r.id}>
            {linkRecords ? (
              <Link href={r.href}>{r.label}</Link>
            ) : (
              <span>
                {data.role === "system_administrator"
                  ? r.label
                      .replace(/[._]/g, " ")
                      .replace(/^./, (c) => c.toUpperCase())
                  : r.label}
              </span>
            )}
            {r.detail && <p>{r.detail}</p>}
            {r.at && <small>{formatTime(r.at)}</small>}
          </li>
        ))}
      </ul>
    ) : (
      <p>{empty}</p>
    );
  const primary = dashboardPrimary[data.role];
  const metricLink = (m: (typeof definitions)[number], compact = false) => {
    const total =
      m.key === "workload"
        ? data.workload_count
        : (data.metrics[m.key]?.count ?? 0);
    return (
      <Link
        className={`metric-card ${compact ? "metric-secondary" : "metric-primary"}`}
        href={dashboardUrl(m.key)}
        key={m.key}
      >
        <div>{m.label}</div>
        <strong>
          {m.currency
            ? financialAmount(data.metrics[m.key]?.amount)
            : String(total)}
        </strong>
        {!compact && (
          <p>
            {m.currency
              ? `${total} Projects with recorded Sale`
              : "View matching records"}
            <ArrowUpRight size={15} aria-hidden="true" />
          </p>
        )}
        {compact && <ArrowUpRight size={15} aria-hidden="true" />}
      </Link>
    );
  };
  return (
    <div className="dashboard-experience">
      <div className="workspace-data-note">
        <span className="live-dot" aria-hidden="true" />
        Live authorized records <span>Updated {formatTime(data.as_of)}</span>
      </div>
      <section
        className={`attention-panel ${data.actions.length ? "has-attention" : "is-clear"}`}
        aria-label="Action required"
      >
        <div className="section-heading">
          <div className="section-title-icon">
            {data.actions.length ? (
              <CircleAlert size={20} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={20} aria-hidden="true" />
            )}
            <h2>Action required</h2>
          </div>
          <span className="count-chip">
            {data.actions.length
              ? `${data.actions.length} recent items`
              : "Queue clear"}
          </span>
        </div>
        {data.actions.length > 0 && (
          <p className="field-hint">
            Your latest attention items. Open a KPI for its full matching list.
          </p>
        )}
        {entries(
          data.actions.slice(0, 4),
          "No action-required items in your current scope.",
        )}
        {data.actions.length > 4 && (
          <details className="attention-more">
            <summary>
              {data.actions.length - 4} more recent attention items
            </summary>
            {entries(data.actions.slice(4), "")}
          </details>
        )}
      </section>
      <section className="dashboard-kpis" aria-label="Role KPIs">
        <div className="section-heading">
          <h2>Workspace overview</h2>
          <span className="section-kicker">Current authorized scope</span>
        </div>
        <div className="primary-metrics">
          {definitions
            .filter((m) => primary.includes(m.key))
            .map((m) => metricLink(m))}
        </div>
        <div className="secondary-metrics">
          {definitions
            .filter((m) => !primary.includes(m.key))
            .map((m) => metricLink(m, true))}
        </div>
      </section>
      {selected && (
        <section
          className="surface live-form"
          aria-label="Matching KPI records"
        >
          <h2>{selected.label}</h2>
          <p>{selected.definition}</p>
          <p>
            {selectedCount} matching{" "}
            {selected.key === "workload" ? "Designers" : "records"} · Page{" "}
            {data.page} · Up to 25 per page
          </p>
          {selected.key === "workload"
            ? null
            : entries(
                data.records,
                "No matching records in this scope.",
                data.view !== "system_activity",
              )}
          <nav aria-label="KPI pagination" className="pagination">
            {data.page > 1 && (
              <Link href={dashboardUrl(data.view, data.page - 1)}>
                ← Previous matching records
              </Link>
            )}
            {data.page * 25 < selectedCount && (
              <Link href={dashboardUrl(data.view, data.page + 1)}>
                Next matching records →
              </Link>
            )}
            <Link href="/dashboard">Dashboard overview</Link>
          </nav>
        </section>
      )}
      <div className="dashboard-lower-grid">
        {!["lead_designer", "operations_admin"].includes(data.role) && (
          <section
            className="workspace-panel update-panel"
            aria-label="Workspace updates"
          >
            <h2>Workspace updates</h2>
            <p className="update-count">
              <strong>{data.unread}</strong>
              <span>unread notifications</span>
            </p>
            <p>
              Review updates from your authorized projects and team workflows.
            </p>
            <Link href="/dashboard/notifications">Open notifications →</Link>
            <Link href="/dashboard/projects">Open project workspace →</Link>
          </section>
        )}
        {data.role === "lead_designer" && (
          <section
            className="workspace-panel workload-panel"
            aria-label="Designer workload"
          >
            <h2>Designer workload</h2>
            <p>
              Distinct unfinished Spaces per assigned Designer. Shared Spaces
              count toward each person’s workload.
            </p>
            {data.workload.length ? (
              <ul className="dashboard-records">
                {data.workload.map((w) => (
                  <li key={w.id}>
                    {w.display_name}: <strong>{w.count} Spaces</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No assigned active design workload.</p>
            )}
            {data.workload_count > 25 && data.view !== "workload" && (
              <Link href={dashboardUrl("workload")}>
                View all Designer workload
              </Link>
            )}
          </section>
        )}
        <section
          className="workspace-panel activity-panel"
          aria-label="Recent relevant activity"
        >
          <div className="section-heading">
            <div className="section-title-icon">
              <Activity size={18} aria-hidden="true" />
              <h2>Recent relevant activity</h2>
            </div>
          </div>
          {entries(
            data.recent.slice(0, 4),
            "No relevant activity yet.",
            data.role !== "system_administrator",
          )}
          {data.recent.length > 4 && (
            <details className="attention-more">
              <summary>{data.recent.length - 4} more activity items</summary>
              {entries(
                data.recent.slice(4),
                "",
                data.role !== "system_administrator",
              )}
            </details>
          )}
          <Link
            href={
              data.role === "system_administrator"
                ? "/dashboard/users"
                : "/dashboard/notifications"
            }
          >
            {data.role === "system_administrator"
              ? "Manage account access"
              : `Notifications · ${data.unread} unread`}
          </Link>
        </section>
        {data.role === "operations_admin" && (
          <section className="workspace-panel pipeline-panel">
            <h2>Your project pipeline</h2>
            <p>
              Pre-closure assignments retain their limited pipeline preview.
              Operational KPIs include only authorized commercially Closed
              Projects.
            </p>
            <Link href="/dashboard/projects">View assigned projects</Link>
          </section>
        )}
      </div>
      <section className="workspace-methodology">
        <details>
          <summary>KPI definitions and counting rules</summary>
          <p>
            Calendar boundaries use Asia/Manila unless a Project has its own
            timezone. Counts are totals of the defined scope, not percentages.
          </p>
          <p>
            Each count is a distinct matching record count (numerator); there is
            no denominator or percentage unless explicitly stated. Current state
            unless a time window is specified. Cancelled scope is excluded from
            active workload. Supporting assignments use existence checks and
            cannot multiply Project/Space counts. Financial sums use PostgreSQL
            decimal arithmetic.
          </p>
          <dl>
            {definitions.map((m) => (
              <div key={m.key}>
                <dt>{m.label}</dt>
                <dd>{m.definition}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
    </div>
  );
}
