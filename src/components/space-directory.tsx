"use client";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Status } from "./ui-r2/primitives";
import { directoryDate } from "@/lib/project-directory-view";
import { formatTime } from "@/lib/phase1";
import styles from "./space-directory.module.css";
export type SpaceDirectoryRecord = {
  id: string;
  name: string;
  designer: string;
  status: string;
  readiness?: string;
  deadline: string | null;
  updated: string;
};
export function SpaceDirectory({
  rows,
  selection,
}: {
  rows: SpaceDirectoryRecord[];
  selection?: {
    ids: string[];
    eligible: string[];
    toggle: (id: string, checked: boolean) => void;
    togglePage: (checked: boolean) => void;
  };
}) {
  const path = usePathname(),
    query = useSearchParams(),
    router = useRouter();
  const url = (id: string | null) => {
    const next = new URLSearchParams(query.toString());
    if (id) next.set("space_detail", id);
    else next.delete("space_detail");
    return `${path}?${next}${id ? `#space-${id}` : "#project-spaces"}`;
  };
  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.match(/^#space-([0-9a-f-]{36})$/i)?.[1];
      if (
        id &&
        query.get("space_detail") !== id &&
        rows.some((s) => s.id === id)
      ) {
        const next = new URLSearchParams(query.toString());
        next.set("space_detail", id);
        router.replace(`${path}?${next}#space-${id}`, { scroll: false });
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [path, query, router, rows]);
  const designer = (s: SpaceDirectoryRecord) => (
    <span className={styles.designer}>
      <span className={styles.avatar} aria-hidden="true">
        {s.designer
          .split(/\s+/)
          .slice(0, 2)
          .map((n) => n[0])
          .join("")}
      </span>
      <span>{s.designer}</span>
    </span>
  );
  return (
    <>
      <div
        className={styles.scroll}
        role="region"
        aria-label="Spaces directory"
      >
        <table className={styles.table} data-selectable={!!selection}>
          <caption className="sr-only">
            Project spaces. Open a space name to view details and authorized
            management controls.
          </caption>
          <thead>
            <tr>
              {selection && (
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label="Select all eligible Spaces on this page"
                    checked={
                      rows.some((s) => selection.eligible.includes(s.id)) &&
                      rows
                        .filter((s) => selection.eligible.includes(s.id))
                        .every((s) => selection.ids.includes(s.id))
                    }
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          rows.some((s) => selection.ids.includes(s.id)) &&
                          !rows
                            .filter((s) => selection.eligible.includes(s.id))
                            .every((s) => selection.ids.includes(s.id));
                    }}
                    onChange={(e) => selection.togglePage(e.target.checked)}
                    disabled={
                      !rows.some((s) => selection.eligible.includes(s.id))
                    }
                  />
                </th>
              )}
              {[
                "Space",
                "Assigned Designer",
                "Design status",
                "Post-closure readiness",
                "Deadline",
                "Updated",
              ].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                {selection && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${s.name}`}
                      checked={selection.ids.includes(s.id)}
                      disabled={!selection.eligible.includes(s.id)}
                      onChange={(e) => selection.toggle(s.id, e.target.checked)}
                    />
                  </td>
                )}
                <td>
                  <Link
                    className={styles.name}
                    href={url(s.id)}
                    scroll={false}
                    data-space-id={s.id}
                    aria-label={`Open space ${s.name}`}
                  >
                    {s.name}
                  </Link>
                </td>
                <td>{designer(s)}</td>
                <td>
                  <Status>{s.status}</Status>
                </td>
                <td>{s.readiness || "—"}</td>
                <td>
                  <span className={styles.date}>
                    <CalendarDays size={15} aria-hidden="true" />
                    {directoryDate(s.deadline)}
                  </span>
                </td>
                <td>
                  <time dateTime={s.updated}>{formatTime(s.updated)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.mobile}>
        {rows.map((s) => (
          <article key={s.id} className={styles.mobileSelection}>
            {selection && (
              <label>
                <input
                  type="checkbox"
                  aria-label={`Select ${s.name}`}
                  checked={selection.ids.includes(s.id)}
                  disabled={!selection.eligible.includes(s.id)}
                  onChange={(e) => selection.toggle(s.id, e.target.checked)}
                />
                Select space
              </label>
            )}
            <Link
              href={url(s.id)}
              scroll={false}
              data-space-id={s.id}
              className={styles.mobileRow}
              aria-label={`Open space ${s.name}`}
            >
              <div>
                <strong>{s.name}</strong>
                <Status>{s.status}</Status>
                {s.readiness && <small>Post-closure: {s.readiness}</small>}
              </div>
              {designer(s)}
              <dl>
                <div>
                  <dt>Deadline</dt>
                  <dd>{directoryDate(s.deadline)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>
                    <time dateTime={s.updated}>{formatTime(s.updated)}</time>
                  </dd>
                </div>
              </dl>
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
