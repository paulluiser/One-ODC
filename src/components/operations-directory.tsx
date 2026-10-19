"use client";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RecordStatus } from "./record-table";
import styles from "./operations-workspace.module.css";
type Row = { id: string; name: string; cells: string[] };
export function OperationsDirectory({
  kind,
  columns,
  rows,
}: {
  kind: "installation" | "logistics";
  columns: string[];
  rows: Row[];
}) {
  const path = usePathname(),
    query = useSearchParams(),
    router = useRouter(),
    key = `${kind}_detail`;
  const url = (id: string | null) => {
    const next = new URLSearchParams(query.toString());
    next.set("tab", "operations");
    next.delete(
      kind === "installation" ? "logistics_detail" : "installation_detail",
    );
    next.delete("section");
    if (id) next.set(key, id);
    else next.delete(key);
    return `${path}?${next}#${id ? `${kind}-${id}` : `operations-${kind}`}`;
  };
  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.match(
        new RegExp(`^#${kind}-([0-9a-f-]{36})$`, "i"),
      )?.[1];
      if (id && query.get(key) !== id && rows.some((r) => r.id === id)) {
        const next = new URLSearchParams(query.toString());
        next.set(key, id);
        next.set("tab", "operations");
        next.delete(
          kind === "installation" ? "logistics_detail" : "installation_detail",
        );
        next.delete("section");
        router.replace(`${path}?${next}#${kind}-${id}`, { scroll: false });
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [kind, key, path, query, rows, router]);
  const cell = (value: string, index: number) =>
    index === (kind === "installation" ? 2 : 1) ? (
      <RecordStatus>{value}</RecordStatus>
    ) : (
      value
    );
  return (
    <>
      <div
        className={styles.scroll}
        role="region"
        aria-label={`${kind} directory`}
      >
        <table className={styles.table}>
          <caption className="sr-only">
            Open a record to view details and authorized actions.
          </caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th scope="col" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-selected={query.get(key) === r.id}>
                {r.cells.map((c, i) => (
                  <td key={columns[i]}>
                    {i === 0 ? (
                      <Link
                        href={url(r.id)}
                        scroll={false}
                        data-installation-id={
                          kind === "installation" ? r.id : undefined
                        }
                        data-logistics-id={
                          kind === "logistics" ? r.id : undefined
                        }
                        aria-label={`Open ${kind} ${r.name}`}
                      >
                        {c}
                      </Link>
                    ) : (
                      cell(c, i)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.mobile}>
        {rows.map((r) => (
          <Link
            href={url(r.id)}
            scroll={false}
            data-installation-id={kind === "installation" ? r.id : undefined}
            data-logistics-id={kind === "logistics" ? r.id : undefined}
            key={r.id}
            className={styles.mobileRow}
            aria-label={`Open ${kind} ${r.name}`}
          >
            <strong>{r.cells[0]}</strong>
            <dl>
              {r.cells.slice(1).map((v, i) => (
                <div key={columns[i + 1]}>
                  <dt>{columns[i + 1]}</dt>
                  <dd>{cell(v, i + 1)}</dd>
                </div>
              ))}
            </dl>
          </Link>
        ))}
      </div>
    </>
  );
}
