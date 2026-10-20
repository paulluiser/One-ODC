"use client";
/* eslint jsx-a11y/no-noninteractive-tabindex: ["error", {"roles": ["region"]}] -- The labeled scroll region needs keyboard scrolling. */
import { DiscussionBadge } from "../productivity/discussion-sync";
import {
  useEffect,
  useRef,
  useTransition,
  useOptimistic,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  directoryColumns,
  visibleDirectoryColumns,
  type ProjectDirectoryRow,
  type DirectoryColumn,
} from "@/lib/project-directory-view";
import { Status } from "./primitives";
import { DirectoryTable } from "./directory-table";
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
        <span className={styles.projectName}>
          <DiscussionBadge project={row.id} dot />
          <FullText
            text={row.name}
            tooltipId={`project-${row.id}-tooltip`}
            tooltipText={`${row.name} · Lead Designer: ${row.designer} · Operations: ${row.operations}`}
          />
        </span>
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
    <div data-project-view="list">
      <DirectoryTable
        label="Project directory table"
        caption="Authorized projects. Operations lifecycle and design progress are separate from commercial stage. Scroll horizontally for additional columns."
        primaryKey="project"
        columns={shown.map((c) => ({
          ...c,
          ...(c.key === "project"
            ? {
                sortHref: sortUrl,
                sortDirection: sorted
                  ? ("ascending" as const)
                  : ("none" as const),
              }
            : {}),
        }))}
        rows={rows.map((row) => ({
          id: row.id,
          href: `/dashboard/projects/${row.id}`,
          label: `${row.name}, ${row.reference}`,
          descriptionId: `project-${row.id}-tooltip`,
          cells: Object.fromEntries(
            shown.map((c) => [
              c.key,
              <Value key={c.key} row={row} column={c.key} />,
            ]),
          ),
          mobileTitle: (
            <span className={styles.project}>
              <span className={styles.projectName}>
                <DiscussionBadge project={row.id} dot />
                <span>{row.name}</span>
              </span>
              <small title={row.reference}>{row.reference}</small>
            </span>
          ),
        }))}
      />
    </div>
  );
}
