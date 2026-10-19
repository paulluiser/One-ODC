"use client";
import Link from "next/link";
import { Fragment, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import type { AnalyticsProject } from "@/lib/analytics-projects";
import { FilterBar } from "../filter-bar";
import { Status } from "../ui-r2/primitives";
import styles from "./analytics-workspace.module.css";
export function AnalyticsProjectTable({
  projects,
}: {
  projects: AnalyticsProject[];
}) {
  const directory = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const query = useSearchParams(),
    path = usePathname();
  const q = (query.get("project_q") ?? "").trim().toLowerCase(),
    stage = query.get("project_stage") ?? "",
    life = query.get("project_lifecycle") ?? "",
    sort = query.get("project_sort") ?? "name";
  const rows = projects
    .filter(
      (p) =>
        (!q || `${p.name} ${p.reference}`.toLowerCase().includes(q)) &&
        (!stage || p.commercial === stage) &&
        (!life || p.lifecycle === life),
    )
    .sort((a, b) =>
      sort === "progress"
        ? (b.progress ?? -1) - (a.progress ?? -1) ||
          a.name.localeCompare(b.name)
        : sort === "activity"
          ? (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "") ||
            a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
    );
  const size = Number(query.get("project_size") ?? 10);
  const pageSize = [10, 25, 50].includes(size) ? size : 10;
  const requested = Number(query.get("project_page") ?? 1),
    page =
      Number.isInteger(requested) &&
      requested > 0 &&
      (requested - 1) * pageSize < rows.length
        ? requested
        : 1;
  useEffect(() => {
    directory.current?.scrollTo({ top: 0, left: 0 });
  }, [page, pageSize, q, stage, life, sort, projects]);
  const url = (next: number) => {
    const params = new URLSearchParams(query.toString());
    params.set("project_page", String(next));
    return `${path}?${params}`;
  };
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("en-PH", {
          dateStyle: "medium",
          timeZone: "Asia/Manila",
        }).format(new Date(value.length === 10 ? value + "T00:00:00Z" : value))
      : "—";
  return (
    <section
      className={styles.panel}
      aria-label="Projects in this workspace"
      id="project-breakdown"
    >
      <div className={styles.directoryHeading}>
        <div>
          <h2>Projects in this workspace</h2>
          <p className={styles.note}>
            Showing {Math.min(pageSize, rows.length - (page - 1) * pageSize)} of{" "}
            {rows.length} projects. Use search, filters, or pagination to find
            more.
          </p>
        </div>
        <FilterBar
          compact
          unframed
          values={{
            project_q: query.get("project_q") ?? "",
            project_stage: stage,
            project_lifecycle: life,
            project_sort: sort,
          }}
          config={{
            label: "Project breakdown filters",
            search: { key: "project_q", placeholder: "Search projects…" },
            sort: {
              key: "project_sort",
              defaultValue: "name",
              options: [
                { value: "name", label: "Project name" },
                { value: "progress", label: "Design progress" },
                { value: "activity", label: "Latest activity" },
              ],
            },
            paginationKeys: ["project_page"],
            fields: [
              {
                key: "project_stage",
                label: "Commercial stage",
                options: [
                  { value: "", label: "All commercial stages" },
                  ...[
                    "For Quotation",
                    "Under Negotiation",
                    "Closed",
                    "Lost",
                  ].map((value) => ({ value, label: value })),
                ],
              },
              {
                key: "project_lifecycle",
                label: "Project lifecycle",
                options: [
                  { value: "", label: "All lifecycles" },
                  ...[
                    "Active",
                    "On Hold",
                    "Operationally Completed",
                    "Cancelled",
                  ].map((value) => ({ value, label: value })),
                ],
              },
            ],
          }}
        />
      </div>
      {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The independent directory must support keyboard scrolling. */}
      <div
        ref={directory}
        className={`${styles.tableScroll} ${rows.length ? styles.directoryScroll : ""}`}
        role="region"
        aria-label="Scrollable project directory"
        tabIndex={0}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              {[
                "Project name",
                "Commercial stage",
                "Project lifecycle",
                "Design progress",
                "Deadline / Expected handoff",
                "Last activity",
              ].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice((page - 1) * pageSize, page * pageSize).map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/dashboard/projects/${p.id}`} title={p.name}>
                    {p.name}
                  </Link>
                  <small>{p.reference}</small>
                </td>
                <td>
                  <Status>{p.commercial}</Status>
                </td>
                <td>
                  <Status>{p.lifecycle}</Status>
                </td>
                <td>
                  {p.progress === null ? (
                    <span className={styles.muted}>Not available</span>
                  ) : (
                    <span className={styles.progress}>
                      {p.progress.toFixed(1)}%
                      <progress
                        max={100}
                        value={p.progress}
                        aria-label={`${p.name} design progress`}
                      />
                    </span>
                  )}
                </td>
                <td>
                  <span>{date(p.deadline)}</span>
                  <small>Handoff: {date(p.handoff)}</small>
                </td>
                <td title="Last recorded project progress">
                  {date(p.lastActivity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
      {!rows.length && (
        <p className={styles.empty}>No projects match these filters.</p>
      )}
      <div className={styles.directoryFooter}>
        <label className={styles.pageSize}>
          Rows per page
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => {
              const params = new URLSearchParams(query.toString());
              params.set("project_size", event.target.value);
              params.delete("project_page");
              router.push(`${path}?${params}`, { scroll: false });
            }}
          >
            {[10, 25, 50].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <span className={styles.range}>
          {rows.length ? (page - 1) * pageSize + 1 : 0}–
          {Math.min(page * pageSize, rows.length)} of {rows.length} projects
        </span>
        <nav
          className={styles.pageNumbers}
          aria-label="Project breakdown pages"
        >
          {page > 1 ? (
            <Link
              href={url(page - 1)}
              scroll={false}
              aria-label="Previous project page"
            >
              <ChevronLeft size={16} />
            </Link>
          ) : (
            <button disabled aria-label="Previous project page">
              <ChevronLeft size={16} />
            </button>
          )}
          {[
            ...new Set([
              1,
              ...Array.from({ length: 5 }, (_, i) => page - 2 + i),
              Math.ceil(rows.length / pageSize),
            ]),
          ]
            .filter(
              (n) =>
                n > 0 && n <= Math.max(1, Math.ceil(rows.length / pageSize)),
            )
            .sort((a, b) => a - b)
            .map((n, i, array) => (
              <Fragment key={n}>
                {i > 0 && n - array[i - 1] > 1 && <span>…</span>}
                <Link
                  href={url(n)}
                  scroll={false}
                  aria-current={n === page ? "page" : undefined}
                  aria-label={`Project page ${n}`}
                >
                  {n}
                </Link>
              </Fragment>
            ))}
          {page * pageSize < rows.length ? (
            <Link
              href={url(page + 1)}
              scroll={false}
              aria-label="Next project page"
            >
              <ChevronRight size={16} />
            </Link>
          ) : (
            <button disabled aria-label="Next project page">
              <ChevronRight size={16} />
            </button>
          )}
        </nav>
      </div>
    </section>
  );
}
