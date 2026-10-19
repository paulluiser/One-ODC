import Link from "next/link";
import {
  FolderOpen,
  CheckCheck,
  FileText,
  Layers3,
  ArrowUpRight,
} from "lucide-react";
import {
  analyticsUrl,
  collectionRate,
  rate,
  type AnalyticsData,
  type AnalyticsFilters,
} from "@/lib/analytics";
import type { AnalyticsProject } from "@/lib/analytics-projects";
import { financialAmount } from "@/lib/finance";
import { formatTime } from "@/lib/phase1";
import {
  AnalyticsFilterPanel,
  type AnalyticsFilterRecovery,
} from "./analytics-filters";
import { AnalyticsProjectTable } from "./analytics-project-table";
import styles from "./analytics-workspace.module.css";
export function RebuildAnalytics({
  data,
  filters,
  recovery,
  projects,
}: {
  data: AnalyticsData;
  filters: AnalyticsFilters;
  recovery?: AnalyticsFilterRecovery;
  projects: AnalyticsProject[];
}) {
  const count = (key: string) => data.metrics[key]?.count ?? 0;
  const commercial = ["bdm", "lead_designer", "system_administrator"].includes(
    data.role,
  );
  const spaceCount = count("spaces"),
    completedSpaces =
      data.groups.find((g) => g.key === "spaces" && g.bucket === "Completed")
        ?.count ?? 0;
  const kpis = [
    {
      label: "Active projects",
      value: String(count("active_projects")),
      href: analyticsUrl(filters, "active_projects") + "#matching-records",
      icon: FolderOpen,
      note: "Open operational cycles · includes on hold",
    },
    {
      label: "Completed projects",
      value: String(count("completed_projects")),
      href: analyticsUrl(filters, "completed_projects") + "#matching-records",
      icon: CheckCheck,
      note: "Currently operationally completed",
    },
    {
      label: "For quotation",
      value: String(
        projects.filter((p) => p.commercial === "For Quotation").length,
      ),
      href:
        analyticsUrl(filters) +
        "&project_stage=For+Quotation#project-breakdown",
      icon: FileText,
      note: "Current commercial stage",
    },
    {
      label: "Space design completion",
      value:
        data.role === "operations_admin"
          ? "Not available"
          : rate(completedSpaces, spaceCount),
      href:
        data.role === "operations_admin"
          ? null
          : analyticsUrl(filters, "spaces") + "#matching-records",
      icon: Layers3,
      note:
        data.role === "operations_admin"
          ? "Unavailable for your role"
          : "Completed / non-cancelled spaces",
    },
  ];
  const lifecycle = [
    "Active",
    "On Hold",
    "Operationally Completed",
    "Cancelled",
    "Not available",
  ]
    .map((bucket) => ({
      bucket,
      count: projects.filter((p) => p.lifecycle === bucket).length,
    }))
    .filter((g) => g.count);
  const months: { bucket: string; count: number }[] = [];
  const cursor = new Date(`${filters.from.slice(0, 7)}-01T00:00:00Z`);
  while (cursor.toISOString().slice(0, 7) <= filters.to.slice(0, 7)) {
    const bucket = cursor.toISOString().slice(0, 7);
    months.push({
      bucket,
      count:
        data.groups.find((g) => g.key === "completions" && g.bucket === bucket)
          ?.count ?? 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const max = Math.max(1, ...months.map((g) => g.count));
  const matching = !!filters.view;
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <h1>Project analytics</h1>
          <p>Key insights across your authorized workspace.</p>
        </div>
        <AnalyticsFilterPanel
          data={data}
          filters={filters}
          recovery={recovery}
        />
      </header>
      <section className={styles.kpis} aria-label="Analytics KPIs">
        {kpis.map((k, i) => {
          const contents = (
            <>
              <span className={styles.kpiLabel}>
                <k.icon size={18} aria-hidden="true" />
                {k.label}
                {k.href && (
                  <ArrowUpRight
                    size={16}
                    className={styles.kpiArrow}
                    aria-hidden="true"
                  />
                )}
              </span>
              <strong>{k.value}</strong>
              <small>{k.note}</small>
            </>
          );
          return k.href ? (
            <Link
              className={`${styles.kpi} ${i === 0 ? styles.accent : ""}`}
              href={k.href}
              key={k.label}
            >
              {contents}
            </Link>
          ) : (
            <article className={styles.kpi} key={k.label}>
              {contents}
            </article>
          );
        })}
      </section>
      <div className={styles.charts}>
        <section
          className={styles.panel}
          aria-label="Project status distribution"
        >
          <h2>Project status distribution</h2>
          <p className={styles.note}>Share of projects by lifecycle stage.</p>
          {lifecycle.length ? (
            <ul className={styles.horizontal}>
              {lifecycle.map((g) => (
                <li key={g.bucket}>
                  <Link
                    href={
                      analyticsUrl(filters) +
                      `&project_lifecycle=${encodeURIComponent(g.bucket)}#project-breakdown`
                    }
                  >
                    {g.bucket === "Operationally Completed"
                      ? "Completed"
                      : g.bucket}
                  </Link>
                  <progress
                    max={projects.length}
                    value={g.count}
                    aria-label={`${g.bucket}: ${g.count} projects`}
                  />
                  <strong>{g.count}</strong>
                  <small>{rate(g.count, projects.length)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              No projects in this reporting period.
            </p>
          )}
        </section>
        <section
          className={styles.panel}
          aria-label="Operational completions by month"
        >
          <h2>Operational completions by month</h2>
          <p className={styles.note}>
            Latest recorded operational completion per project, by completion
            date.
          </p>
          {months.some((g) => g.count) ? (
            <div className={styles.monthScroll}>
              <div
                className={styles.monthChart}
                style={{ minWidth: Math.max(300, months.length * 38 + 24) }}
              >
                <div className={styles.gridLines} aria-hidden="true">
                  {[max, max / 2, 0].map((v, i) => (
                    <span key={i}>{v}</span>
                  ))}
                </div>
                <div className={styles.monthBars}>
                  {months.map((g) => (
                    <Link
                      href={
                        analyticsUrl(filters, "completions", g.bucket) +
                        "#matching-records"
                      }
                      key={g.bucket}
                      aria-label={`${g.bucket}: ${g.count} completed projects`}
                    >
                      <strong>{g.count}</strong>
                      <span
                        className={styles.bar}
                        style={{ height: `${(g.count / max) * 140}px` }}
                      />
                      <span>
                        {new Intl.DateTimeFormat("en", {
                          month: "short",
                          year: "2-digit",
                          timeZone: "UTC",
                        }).format(new Date(`${g.bucket}-01T00:00:00Z`))}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className={styles.empty}>
              No operational completions in the selected period.
            </p>
          )}
        </section>
      </div>
      <AnalyticsProjectTable projects={projects} />
      {matching && (
        <section
          className={styles.panel}
          aria-label="Matching analytics records"
          id="matching-records"
        >
          <div className={styles.matchHeading}>
            <h2>Matching analytics records</h2>
            <Link href={analyticsUrl(filters)}>Close results</Link>
          </div>
          <p className={styles.note}>
            {data.selected_count} matching records · Page {filters.page}
          </p>
          {data.records.length ? (
            <ul className={styles.matches}>
              {data.records.map((r, i) => (
                <li key={`${r.id}-${i}`}>
                  <Link href={r.href}>{r.label}</Link>
                  <span>{r.detail}</span>
                  {r.at && <small>{formatTime(r.at)}</small>}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No matching records.</p>
          )}
          <nav
            className={styles.pagination}
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
                Previous
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
                Next
              </Link>
            )}
          </nav>
        </section>
      )}
      <footer className={styles.footer}>
        {commercial && (
          <nav aria-label="Commercial analytics">
            <Link href={analyticsUrl(filters, "sale")}>
              Current Sale: {financialAmount(data.metrics.sale?.amount)}
            </Link>
            <Link href={analyticsUrl(filters, "collections")}>
              Client collections:{" "}
              {financialAmount(data.metrics.collections?.amount)}
            </Link>
            <Link href={analyticsUrl(filters, "collections")}>
              Collection progress:{" "}
              {collectionRate(
                data.metrics.collections?.amount,
                data.metrics.sale?.amount,
              )}
            </Link>
            <Link href={analyticsUrl(filters, "closed")}>
              Commercial closures
            </Link>
            <Link href={analyticsUrl(filters, "leads")}>Submitted leads</Link>
            <Link href={analyticsUrl(filters, "accepted_leads")}>
              Accepted leads
            </Link>
          </nav>
        )}
        <p>
          Updated {formatTime(data.as_of)} · Inclusive reporting dates. Current
          project metrics use creation dates; completions use recorded
          completion dates. Commercial totals are current cohort balances, not
          period revenue.
        </p>
      </footer>
    </div>
  );
}
