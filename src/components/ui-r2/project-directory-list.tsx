"use client";
/* eslint jsx-a11y/no-noninteractive-tabindex: ["error", {"roles": ["region"]}] -- The labeled scroll region needs keyboard scrolling. */
import Link from "next/link";
import {
  useEffect,
  useRef,
  useTransition,
  useOptimistic,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownAZ,
  ChevronRight,
  Columns3,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  directoryColumns,
  visibleDirectoryColumns,
  type ProjectDirectoryRow,
  type DirectoryColumn,
} from "@/lib/project-directory-view";
import { Status } from "./primitives";
import styles from "./project-directory-list.module.css";

export function ProjectColumnMenu() {
  const params = useSearchParams(),
    pathname = usePathname(),
    router = useRouter();
  const visible = visibleDirectoryColumns(params.get("columns") ?? undefined);
  const [selectedColumns, setSelectedColumns] = useOptimistic(visible);
  const menu = useRef<HTMLDetailsElement>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className={styles.menu} ref={menu}>
      <summary aria-label="Choose project columns">
        <Columns3 size={16} aria-hidden="true" />
        Columns
      </summary>
      <div
        className={styles.menuPanel}
        aria-label="Visible project columns"
        aria-busy={pending}
      >
        <strong>Visible columns</strong>
        <p>Project and open action always stay visible.</p>
        {directoryColumns.map((c) => (
          <label key={c.key}>
            <input
              type="checkbox"
              checked={selectedColumns.includes(c.key)}
              disabled={c.key === "project" || pending}
              onChange={(event) => {
                const next = new URLSearchParams(params.toString());
                const selected = new Set(selectedColumns);
                if (event.target.checked) selected.add(c.key);
                else selected.delete(c.key);
                next.set(
                  "columns",
                  directoryColumns
                    .filter((c) => selected.has(c.key))
                    .map((c) => c.key)
                    .join(","),
                );
                startTransition(() => {
                  setSelectedColumns(
                    directoryColumns
                      .filter((c) => selected.has(c.key))
                      .map((c) => c.key),
                  );
                  router.replace(`${pathname}?${next}`, { scroll: false });
                });
              }}
            />
            {c.label}
          </label>
        ))}
      </div>
    </details>
  );
}
function FullText({
  text,
  children,
  tooltipText = text,
  tooltipId,
}: {
  text: string;
  children?: ReactNode;
  tooltipText?: string;
  tooltipId?: string;
}) {
  return (
    <span className={styles.textWrap} title={text}>
      <span className={styles.truncated}>{children ?? text}</span>
      <span className={styles.tooltip} role="tooltip" id={tooltipId}>
        {tooltipText}
      </span>
    </span>
  );
}
function Value({
  row,
  column,
}: {
  row: ProjectDirectoryRow;
  column: DirectoryColumn;
}) {
  if (column === "project")
    return (
      <span className={styles.project}>
        <FullText
          text={row.name}
          tooltipId={`project-${row.id}-tooltip`}
          tooltipText={`${row.name} · Lead Designer: ${row.designer} · Operations: ${row.operations}`}
        />
        <small title={row.reference}>{row.reference}</small>
      </span>
    );
  if (column === "stage") return <Status>{row.stage}</Status>;
  if (column === "progress")
    return row.progress === null ? (
      <span className={styles.muted}>Not available</span>
    ) : (
      <span className={styles.progress}>
        <span>{row.progress}%</span>
        <progress
          value={row.progress}
          max={100}
          aria-label={`${row.name} design progress`}
        />
      </span>
    );
  if (column === "attention")
    return (
      <span className={styles.attention} data-risk={row.attention}>
        {row.attention === "Overdue" || row.attention === "At Risk" ? (
          <AlertCircle size={14} aria-hidden="true" />
        ) : row.attention === "On Track" ? (
          <CheckCircle2 size={14} aria-hidden="true" />
        ) : null}
        {row.attention}
      </span>
    );
  return <FullText text={row[column]} />;
}
export function ProjectDirectoryList({
  rows,
  columns,
  sortUrl,
  sorted,
}: {
  rows: ProjectDirectoryRow[];
  columns: DirectoryColumn[];
  sortUrl: string;
  sorted: boolean;
}) {
  const shown = directoryColumns.filter((c) => columns.includes(c.key));
  return (
    <div data-project-view="list" className={styles.directory}>
      {/* Keyboard focus enables horizontal and vertical scrolling without a pointer. */}
      <div
        className={styles.scroll}
        role="region"
        aria-label="Project directory table"
        tabIndex={0}
      >
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Authorized projects. Operations lifecycle and design progress are
            separate from commercial stage. Scroll horizontally for additional
            columns.
          </caption>
          <thead>
            <tr>
              {shown.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  data-column={c.key}
                  aria-sort={
                    c.key === "project"
                      ? sorted
                        ? "ascending"
                        : "none"
                      : undefined
                  }
                >
                  {c.key === "project" ? (
                    <Link href={sortUrl} title="Sort projects by name">
                      <span>{c.label}</span>
                      <ArrowDownAZ size={14} aria-hidden="true" />
                    </Link>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              <th scope="col">
                <span className={styles.srOnly}>Open project</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {shown.map((c) => (
                  <td key={c.key} data-column={c.key}>
                    <Link
                      prefetch={false}
                      href={`/dashboard/projects/${row.id}`}
                      tabIndex={c.key === "project" ? 0 : -1}
                      aria-describedby={
                        c.key === "project"
                          ? `project-${row.id}-tooltip`
                          : undefined
                      }
                      aria-label={
                        c.key === "project"
                          ? `Open ${row.name}, ${row.reference}`
                          : undefined
                      }
                    >
                      <Value row={row} column={c.key} />
                    </Link>
                  </td>
                ))}
                <td>
                  <Link
                    prefetch={false}
                    href={`/dashboard/projects/${row.id}`}
                    tabIndex={-1}
                    aria-label={`Open ${row.name}`}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.mobile}>
        {rows.map((row) => (
          <Link
            prefetch={false}
            href={`/dashboard/projects/${row.id}`}
            className={styles.mobileRow}
            key={row.id}
          >
            <div className={styles.mobileHeading}>
              <span className={styles.project}>
                <span>{row.name}</span>
                <small title={row.reference}>{row.reference}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </div>
            <dl>
              {shown
                .filter((c) => c.key !== "project")
                .map((c) => (
                  <div key={c.key}>
                    <dt>{c.label}</dt>
                    <dd>
                      <Value row={row} column={c.key} />
                    </dd>
                  </div>
                ))}
            </dl>
          </Link>
        ))}
      </div>
    </div>
  );
}
