"use client";
/* eslint jsx-a11y/no-noninteractive-tabindex: ["error", {"roles": ["region"]}] -- The labeled scroll region needs keyboard scrolling. */
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { ArrowDownAZ, ChevronRight } from "lucide-react";
import styles from "./project-directory-list.module.css";

type Column = {
  key: string;
  label: string;
  width?: number;
  sortHref?: string;
  sortDirection?: "ascending" | "descending" | "none";
};
type Row = {
  id: string;
  href: string;
  label: string;
  cells: Record<string, ReactNode>;
  mobileTitle?: ReactNode;
  descriptionId?: string;
};
export function DirectoryTable({
  columns,
  rows,
  primaryKey,
  label,
  caption,
  onOpen,
}: {
  onOpen?: (id: string) => void;
  columns: Column[];
  rows: Row[];
  primaryKey: string;
  label: string;
  caption: string;
}) {
  const openRow = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (
      onOpen &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      event.button === 0
    ) {
      event.preventDefault();
      onOpen(id);
    }
  };
  return (
    <div className={styles.directory}>
      <div
        className={styles.scroll}
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        <table className={styles.table}>
          <caption className={styles.srOnly}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  data-column={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={column.sortDirection}
                >
                  {column.sortHref ? (
                    <Link href={column.sortHref}>
                      <span>{column.label}</span>
                      <ArrowDownAZ size={14} aria-hidden="true" />
                    </Link>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
              <th scope="col">
                <span className={styles.srOnly}>Open details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.key} data-column={column.key}>
                    <Link
                      prefetch={false}
                      href={row.href}
                      onClick={(event) => openRow(event, row.id)}
                      tabIndex={column.key === primaryKey ? 0 : -1}
                      aria-describedby={
                        column.key === primaryKey
                          ? row.descriptionId
                          : undefined
                      }
                      aria-label={
                        column.key === primaryKey
                          ? `Open ${row.label}`
                          : undefined
                      }
                    >
                      {row.cells[column.key]}
                    </Link>
                  </td>
                ))}
                <td>
                  <Link
                    prefetch={false}
                    href={row.href}
                    onClick={(event) => openRow(event, row.id)}
                    tabIndex={-1}
                    aria-label={`Open ${row.label}`}
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
            href={row.href}
            onClick={(event) => openRow(event, row.id)}
            className={styles.mobileRow}
            key={row.id}
          >
            <div className={styles.mobileHeading}>
              {row.mobileTitle ?? row.cells[primaryKey]}
              <ChevronRight size={18} aria-hidden="true" />
            </div>
            <dl>
              {columns
                .filter((column) => column.key !== primaryKey)
                .map((column) => (
                  <div key={column.key}>
                    <dt>{column.label}</dt>
                    <dd>{row.cells[column.key]}</dd>
                  </div>
                ))}
            </dl>
          </Link>
        ))}
      </div>
    </div>
  );
}
