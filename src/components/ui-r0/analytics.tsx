import Link from "next/link";
import {
  ArrowUpRight,
  SlidersHorizontal,
  FolderOpen,
  CheckCheck,
  Layers3,
  Clock3,
} from "lucide-react";
import {
  analyticsDefinitions,
  analyticsStages,
  analyticsUrl,
  collectionRate,
  rate,
  type AnalyticsData,
  type AnalyticsFilters,
} from "../../lib/analytics";
import { financialAmount } from "../../lib/finance";
import { formatTime } from "../../lib/phase1";
import { Panel, SectionHeading, StatTile, Empty } from "./primitives";
import styles from "./ui-r0.module.css";
import r1 from "./ui-r1.module.css";
export function RebuildAnalytics({
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
  ];

  const primaryLabels = [
    "Active projects",
    "Currently completed projects",
    "Projects with a completion in range",
    data.role === "operations_admin"
      ? "Installation completion"
      : "Space design completion",
  ];
  const financialLabels = [
    "Current authorized Sale",
    "Current client collections",
    "Collection progress",
  ];
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
      <Panel label={title} className={r1.chart}>
        <SectionHeading
          title={title}
          description="Select a label to open matching records."
        />
        {groups.length ? (
          <ul className={`${r1.bars} ${monthly ? r1.months : ""}`}>
            {groups.map((g) => {
              const label =
                key === "workload"
                  ? g.bucket.split(" · ")[0]
                  : monthly
                    ? new Intl.DateTimeFormat("en", {
                        month: "short",
                        year: "2-digit",
                        timeZone: "UTC",
                      }).format(new Date(`${g.bucket}-01T00:00:00Z`))
                    : g.bucket;
              return (
                <li key={g.bucket}>
                  <Link
                    href={analyticsUrl(filters, key, g.bucket)}
                    aria-label={`${label}: ${g.count} matching records`}
                  >
                    <span>{label}</span>
                    <strong>{g.count}</strong>
                  </Link>
                  <div className={r1.track} aria-hidden="true">
                    <span
                      style={
                        monthly
                          ? { height: `${(g.count / max) * 100}%` }
                          : { width: `${(g.count / max) * 100}%` }
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            title="No matching records"
            description="This chart will populate when records meet the selected filters."
          />
        )}
      </Panel>
    );
  };
  return (
    <div className={r1.analytics}>
      <section className={styles.welcome} aria-label="Analytics introduction">
        <div>
          <span className={styles.eyebrow}>PERFORMANCE, WITH PERSPECTIVE</span>
          <h2>Project analytics</h2>
          <p>Understand progress across your authorized workspace.</p>
        </div>
        <Link className={styles.textLink} href="/dashboard">
          Back to dashboard
          <ArrowUpRight size={15} />
        </Link>
      </section>
      <details
        className={r1.filter}
        open={!!(filters.stage || filters.brand || filters.stakeholder)}
      >
        <summary>
          <SlidersHorizontal size={17} aria-hidden="true" />
          Filters
          <span>
            {filters.from} — {filters.to}
            {filters.stage ? ` · ${filters.stage}` : ""}
            {filters.brand ? ` · ${filters.brand}` : ""}
            {filters.stakeholder ? " · Assigned stakeholder" : ""}
          </span>
        </summary>
        <form action="/dashboard/analytics" aria-label="Analytics filters">
          <div className={r1.filterFields}>
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
            <div className={r1.filterActions}>
              <button type="submit">Apply filters</button>
              <Link className={styles.textLink} href="/dashboard/analytics">
                Reset
              </Link>
            </div>
          </div>
        </form>
      </details>
      {data.role === "operations_admin" && (
        <p className={styles.smallPrint}>
          Only assigned Closed Projects enter these analytics. Originating-lead
          brand filtering is unavailable for your role.
        </p>
      )}
      <section className={styles.stats} aria-label="Analytics KPIs">
        {cards
          .filter((m) => primaryLabels.includes(m.label))
          .map((m, i) => (
            <StatTile
              key={m.label}
              label={m.label}
              value={m.value ?? count(m.key)}
              href={analyticsUrl(filters, m.key)}
              description="Open matching records"
              icon={[FolderOpen, CheckCheck, Clock3, Layers3][i]}
              accent={i === 0}
            />
          ))}
      </section>
      {filters.view && (
        <Panel label="Matching analytics records">
          <SectionHeading
            title="Matching analytics records"
            description={`${data.selected_count} matching records · Page ${filters.page}`}
            action={
              <Link className={styles.textLink} href={analyticsUrl(filters)}>
                Close results
              </Link>
            }
          />
          {data.records.length ? (
            <ul className={r1.records}>
              {data.records.map((r, i) => (
                <li key={`${r.id}-${i}`}>
                  <Link href={r.href}>
                    <strong>{r.label}</strong>
                    <ArrowUpRight size={16} />
                  </Link>
                  <p>{r.detail}</p>
                  {r.at && <small>{formatTime(r.at)}</small>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="No matching records"
              description="Adjust the filters to explore another part of your authorized scope."
            />
          )}
          <nav
            className={styles.resultPagination}
            aria-label="Analytics record pages"
          >
            {filters.page > 1 && (
              <Link
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
        </Panel>
      )}
      {commercial && (
        <Panel label="Commercial balances">
          <SectionHeading
            title="Commercial balances"
            description="Current balances for projects in this cohort; not period revenue."
          />
          <div className={r1.metricFacts}>
            {cards
              .filter((m) => financialLabels.includes(m.label))
              .map((m) => (
                <Link href={analyticsUrl(filters, m.key)} key={m.label}>
                  <span>{m.label}</span>
                  <strong>{m.value}</strong>
                </Link>
              ))}
          </div>
        </Panel>
      )}
      <div className={r1.chartGrid}>
        {chart("projects", "Current lifecycle distribution")}
        {chart("completions", "Operational completions by month", true)}
      </div>
      <details className={r1.more}>
        <summary>More performance metrics</summary>
        <Panel label="Supporting analytics metrics">
          <div className={r1.metricFacts}>
            {cards
              .filter(
                (m) =>
                  !primaryLabels.includes(m.label) &&
                  !financialLabels.includes(m.label),
              )
              .map((m) => (
                <Link href={analyticsUrl(filters, m.key)} key={m.label}>
                  <span>{m.label}</span>
                  <strong>{m.value ?? count(m.key)}</strong>
                </Link>
              ))}
          </div>
        </Panel>
      </details>
      <details className={r1.more}>
        <summary>Explore design, delivery & commercial charts</summary>
        <div className={r1.chartGrid}>
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
              {chart("installations", "Installation status distribution")}
            </>
          )}
        </div>
      </details>
      <footer className={styles.dataFoot}>
        <span>
          Authorized workspace data · Updated {formatTime(data.as_of)}
        </span>
        <span>
          Inclusive dates · Current work uses creation dates; completion and
          closure use event dates.
        </span>
        <details>
          <summary>Calculation definitions and limitations</summary>
          {analyticsDefinitions.map((d) => (
            <p key={d}>{d}</p>
          ))}
        </details>
      </footer>
    </div>
  );
}
