import Link from "next/link";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";
import { analyticsMetricGroup } from "@/lib/workspace-presentation";
import {
  analyticsDefinitions,
  analyticsStages,
  analyticsUrl,
  collectionRate,
  rate,
  type AnalyticsData,
  type AnalyticsFilters,
} from "@/lib/analytics";
import { financialAmount } from "@/lib/finance";
import { formatTime } from "@/lib/phase1";
export function ProjectAnalytics({
  data,
  filters,
}: {
  data: AnalyticsData;
  filters: AnalyticsFilters;
}) {
  const count = (key: string) => data.metrics[key]?.count ?? 0;
  const bucketCount = (key: string, bucket: string) =>
    data.groups.find((g) => g.key === key && g.bucket === bucket)?.count ?? 0;
  const commercial = ["bdm", "lead_designer", "system_administrator"].includes(
    data.role,
  );
  const operational = [
    "operations_admin",
    "lead_designer",
    "system_administrator",
  ].includes(data.role);
  const chart = (key: string, title: string, monthly = false) => {
    const recorded = data.groups.filter((g) => g.key === key);
    const groups = monthly
      ? (() => {
          const rows: typeof recorded = [];
          const month = new Date(`${filters.from.slice(0, 7)}-01T00:00:00Z`);
          while (month.toISOString().slice(0, 7) <= filters.to.slice(0, 7)) {
            const bucket = month.toISOString().slice(0, 7);
            rows.push(
              recorded.find((g) => g.bucket === bucket) ?? {
                key,
                bucket,
                count: 0,
                amount: null,
              },
            );
            month.setUTCMonth(month.getUTCMonth() + 1);
          }
          return rows;
        })()
      : recorded;
    const max = Math.max(1, ...groups.map((g) => g.count));
    return (
      <section className="workspace-panel analytics-chart" aria-label={title}>
        <h2>{title}</h2>
        {groups.length ? (
          <ul className={`analytics-bars ${monthly ? "monthly-bars" : ""}`}>
            {groups.map((g) => (
              <li key={g.bucket}>
                <Link href={analyticsUrl(filters, key, g.bucket)}>
                  {key === "workload"
                    ? g.bucket.split(" · ")[0]
                    : monthly
                      ? new Intl.DateTimeFormat("en", {
                          month: "short",
                          year: "2-digit",
                          timeZone: "UTC",
                        }).format(new Date(`${g.bucket}-01T00:00:00Z`))
                      : g.bucket}
                  <span>{g.count}</span>
                </Link>
                <div className="analytics-track" aria-hidden="true">
                  <span
                    style={
                      monthly
                        ? { height: `${(g.count / max) * 100}%`, width: "100%" }
                        : { width: `${(g.count / max) * 100}%` }
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No matching records.</p>
        )}
      </section>
    );
  };
  const cards: { key: string; label: string; value?: string }[] = [
    { key: "active_projects", label: "Active projects" },
    { key: "completed_projects", label: "Currently completed projects" },
    { key: "completions", label: "Projects with a completion in range" },
    {
      key: "completions",
      label: "Average operational duration",
      value: count("completions")
        ? `${(Number(data.metrics.completions.amount) / count("completions")).toFixed(1)} days`
        : "Not Available",
    },
    ...(data.role !== "operations_admin"
      ? [
          {
            key: "spaces",
            label: "Space design completion",
            value: rate(bucketCount("spaces", "Completed"), count("spaces")),
          },
        ]
      : []),
    ...(commercial
      ? [
          { key: "leads", label: "Leads first submitted" },
          { key: "accepted_leads", label: "Accepted leads in cohort" },
          {
            key: "leads",
            label: "Lead conversion",
            value: rate(count("accepted_leads"), count("leads")),
          },
          { key: "closed", label: "Commercially closed in range" },
          {
            key: "sale",
            label: "Current authorized Sale",
            value: financialAmount(data.metrics.sale?.amount),
          },
          {
            key: "collections",
            label: "Current client collections",
            value: financialAmount(data.metrics.collections?.amount),
          },
          {
            key: "collections",
            label: "Collection progress",
            value: collectionRate(
              data.metrics.collections?.amount,
              data.metrics.sale?.amount,
            ),
          },
        ]
      : []),
    ...(operational
      ? [
          { key: "handoffs", label: "Pending primary handoffs" },
          {
            key: "outstanding_installations",
            label: "Outstanding installation tasks",
          },
          { key: "stalled_logistics", label: "Stalled logistics" },
          {
            key: "installations",
            label: "Installation completion",
            value: rate(
              bucketCount("installations", "Completed"),
              count("installations") -
                bucketCount("installations", "Not Applicable"),
            ),
          },
        ]
      : []),
  ].filter((card) => !card.key.includes("installation"));
  const primaryLabels = [
    "Active projects",
    "Currently completed projects",
    "Projects with a completion in range",
    data.role === "operations_admin"
      ? "Installation completion"
      : "Space design completion",
    ...(commercial ? ["Current authorized Sale"] : []),
  ];
  return (
    <div className="analytics-experience">
      <details
        className="surface analytics-filter-disclosure"
        open={!!(filters.stage || filters.brand || filters.stakeholder)}
      >
        <summary>
          <SlidersHorizontal size={16} aria-hidden="true" /> Filters{" "}
          <span>
            {filters.from} — {filters.to}
            {filters.stage ? ` · ${filters.stage}` : ""}
            {filters.brand ? ` · ${filters.brand}` : ""}
            {filters.stakeholder ? " · Assigned stakeholder" : ""}
          </span>
        </summary>
        <form
          className="settings-section analytics-filters"
          action="/dashboard/analytics"
          aria-label="Analytics filters"
        >
          <div className="filter-heading">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <h2>Filter workspace</h2>
            <span>Inclusive date range</span>
          </div>
          <div className="filter-fields">
            <label>
              From
              <input
                name="from"
                type="date"
                required
                defaultValue={filters.from}
              />
            </label>
            <label>
              Through
              <input name="to" type="date" required defaultValue={filters.to} />
            </label>
            <label>
              Current project stage
              <select
                name="stage"
                aria-label="Current project stage"
                defaultValue={filters.stage}
              >
                <option value="">All stages</option>
                {analyticsStages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Brand
              <select
                name="brand"
                aria-label="Brand"
                defaultValue={filters.brand}
                disabled={data.role === "operations_admin"}
              >
                <option value="">All authorized brands</option>
                {["SFY", "Stosa", "Both"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Assigned stakeholder
              <select
                name="stakeholder"
                aria-label="Assigned stakeholder"
                defaultValue={filters.stakeholder}
              >
                <option value="">All authorized stakeholders</option>
                {data.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-primary" type="submit">
              Apply filters
            </button>
            <Link className="text-link" href="/dashboard/analytics">
              Reset
            </Link>
          </div>
        </form>
      </details>
      <p className="workspace-data-note">
        <span className="live-dot" aria-hidden="true" />
        Updated {formatTime(data.as_of)}
        <span>
          Current work uses project creation dates; completion and closure use
          event dates.
        </span>
      </p>
      {data.role === "operations_admin" && (
        <p className="field-hint">
          Only assigned Closed Projects enter these analytics. Originating-lead
          brand filtering is unavailable for your role.
        </p>
      )}
      <section className="analytics-kpis" aria-label="Analytics KPIs">
        <div className="section-heading">
          <h2>Performance overview</h2>
          <span className="section-kicker">Your filtered scope</span>
        </div>
        <div className="primary-metrics">
          {cards
            .filter((m) => primaryLabels.includes(m.label))
            .map((m, i) => (
              <Link
                className={`metric-card metric-primary ${m.key === "sale" ? "metric-financial" : ""}`}
                key={`${m.key}-${i}`}
                href={analyticsUrl(filters, m.key)}
              >
                <div>{m.label}</div>
                <strong>{m.value ?? String(count(m.key))}</strong>
                <p>
                  View matching records
                  <ArrowUpRight size={15} aria-hidden="true" />
                </p>
              </Link>
            ))}
        </div>
        <div className="analytics-stat-groups">
          {["Projects", "Design", "Commercial", "Operations"].map((group) => {
            const metrics = cards.filter(
              (m) =>
                !primaryLabels.includes(m.label) &&
                analyticsMetricGroup(m.key) === group,
            );
            return (
              metrics.length > 0 && (
                <section
                  className="stat-group"
                  key={group}
                  aria-label={`${group} statistics`}
                >
                  <h3>{group}</h3>
                  <div className="secondary-metrics">
                    {metrics.map((m, i) => (
                      <Link
                        className="metric-card metric-secondary"
                        key={`${m.key}-${i}`}
                        href={analyticsUrl(filters, m.key)}
                      >
                        <div>{m.label}</div>
                        <strong>{m.value ?? String(count(m.key))}</strong>
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                </section>
              )
            );
          })}
        </div>
      </section>
      {filters.view && (
        <section
          className="surface settings-section"
          aria-label="Matching analytics records"
        >
          <h2>Matching analytics records</h2>
          <p>
            {data.selected_count} matching records · Page {filters.page}
          </p>
          {data.records.length ? (
            <ul className="dashboard-records">
              {data.records.map((r, i) => (
                <li key={`${r.id}-${i}`}>
                  <Link href={r.href}>{r.label}</Link>
                  <p>{r.detail}</p>
                  {r.at && <small>{formatTime(r.at)}</small>}
                </li>
              ))}
            </ul>
          ) : (
            <p>No matching records.</p>
          )}
          <nav aria-label="Analytics record pages">
            {filters.page > 1 && (
              <Link
                className="text-link"
                href={analyticsUrl(
                  filters,
                  filters.view,
                  filters.bucket,
                  filters.page - 1,
                )}
              >
                Previous page
              </Link>
            )}
            {filters.page * 25 < data.selected_count && (
              <Link
                className="text-link"
                href={analyticsUrl(
                  filters,
                  filters.view,
                  filters.bucket,
                  filters.page + 1,
                )}
              >
                Next page
              </Link>
            )}
          </nav>
        </section>
      )}
      <div className="section-heading chart-section-heading">
        <div>
          <h2>Project performance</h2>
          <p className="field-hint">
            Select any chart label to open matching records. Labels and counts
            provide the accessible chart data.
          </p>
        </div>
      </div>
      <div className="analytics-chart-grid">
        {chart("projects", "Current lifecycle distribution")}
        {chart("completions", "Operational completions by month", true)}
        {chart("completion_timing", "On-time versus overdue completion")}
        {["lead_designer", "system_administrator"].includes(data.role) && (
          <>
            {chart("risk", "Current project risk")}
            {chart("workload", "Designer workload distribution")}
          </>
        )}
        {commercial && chart("closed", "Commercial closures by month", true)}
        {operational && (
          <>
            {chart("handoffs", "Pending handoff aging")}
            {chart("logistics", "Logistics status distribution")}
          </>
        )}
      </div>
      <details className="workspace-methodology">
        <summary>Calculation definitions and limitations</summary>
        {analyticsDefinitions.map((d) => (
          <p key={d}>{d}</p>
        ))}
        <p>
          Historical risk trends: Not Available. Logistics delivery deadline
          delays: Not Available.
        </p>
      </details>
    </div>
  );
}
