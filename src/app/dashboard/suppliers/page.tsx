import Link from "next/link";
import { ContextPanel } from "@/components/context-panel";
import { RecordTable, RecordStatus } from "@/components/record-table";
import { projectSearchPattern } from "@/lib/project-workspace";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime } from "@/lib/phase1";
import { LogisticsForm } from "@/components/logistics-form";
import type { Supplier } from "@/lib/logistics";
export default async function Suppliers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await requireRole([
    "operations_admin",
    "lead_designer",
    "system_administrator",
  ]);
  if (process.env.ONE_ODC_LOGISTICS_ENABLED !== "true")
    return (
      <section className="surface">
        <h1>Supplier Masterlist</h1>
        <p>This module is not enabled.</p>
      </section>
    );
  const query = await searchParams;
  const search =
    typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";
  const page = Math.max(
    1,
    Math.min(
      10000,
      Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) ||
        1,
    ),
  );
  const sort =
    query.sort === "updated"
      ? "updated"
      : query.sort === "name_desc"
        ? "name_desc"
        : "name";
  let request = client
    .from("suppliers")
    .select("*", { count: "exact" })
    .order(sort === "updated" ? "updated_at" : "name", {
      ascending: sort === "name",
    })
    .order("id")
    .range((page - 1) * 50, page * 50 - 1);
  if (search) request = request.ilike("name", projectSearchPattern(search));
  const r = await request;
  checkDatabase(r.error);
  const events = r.data?.length
    ? await client
        .from("supplier_events")
        .select("*")
        .in(
          "supplier_id",
          r.data.map((s) => s.id),
        )
        .order("occurred_at", { ascending: false })
        .limit(500)
    : { data: [], error: null };
  checkDatabase(events.error);
  return (
    <>
      <section className="surface live-form">
        <h1>Supplier Masterlist</h1>
        <p>
          Centralized supplier records. Inactive suppliers remain in history and
          cannot be selected for new logistics records.
        </p>
        <form className="supplier-filters" action="/dashboard/suppliers">
          <label className="live-field" htmlFor="supplier-search">
            Search supplier name
            <input
              id="supplier-search"
              name="q"
              maxLength={200}
              defaultValue={search}
            />
          </label>
          <label className="live-field">
            Sort suppliers
            <select name="sort" defaultValue={sort}>
              <option value="name">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="updated">Recently updated</option>
            </select>
          </label>
          <button className="button button-outline">Search</button>
        </form>
        <p>
          Page {page} · {r.count ?? 0} matching suppliers
        </p>
        <nav aria-label="Supplier pages">
          {page > 1 && (
            <Link
              href={`/dashboard/suppliers?q=${encodeURIComponent(search)}&sort=${sort}&page=${page - 1}`}
            >
              Previous
            </Link>
          )}{" "}
          {page * 50 < (r.count ?? 0) && (
            <Link
              href={`/dashboard/suppliers?q=${encodeURIComponent(search)}&sort=${sort}&page=${page + 1}`}
            >
              Next
            </Link>
          )}
        </nav>
        <ContextPanel
          title="Add supplier"
          description="Create a supplier record. Changes retain their audit history."
        >
          <LogisticsForm id={randomUUID()} />
        </ContextPanel>
      </section>
      {!r.data?.length && <p className="surface">No suppliers recorded.</p>}
      {!!r.data?.length && (
        <section className="surface supplier-directory">
          <RecordTable label="Supplier directory">
            <table className="live-table supplier-table">
              <caption className="sr-only">Supplier Masterlist</caption>
              <thead>
                <tr>
                  <th scope="col">Supplier / brand</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {((r.data as Supplier[]) ?? []).map((s) => (
                  <tr key={s.id} aria-label={`Supplier ${s.name}`}>
                    <th scope="row">
                      {s.name}
                      <span className="cell-secondary">
                        {s.brand || "No brand"}
                      </span>
                    </th>
                    <td>
                      {s.contact_person || "Not provided"}
                      <span className="cell-secondary contact-copy">
                        {s.contact_details}
                      </span>
                    </td>
                    <td>
                      <RecordStatus>
                        {s.active ? "Active" : "Inactive"}
                      </RecordStatus>
                    </td>
                    <td>{formatTime(s.updated_at)}</td>
                    <td>
                      <ContextPanel
                        title={`Edit supplier: ${s.name}`}
                        triggerLabel="Edit supplier"
                        description="Edit master data without changing historical project associations."
                      >
                        <LogisticsForm id={s.id} supplier={s} />
                      </ContextPanel>
                      <details>
                        <summary>Supplier audit history</summary>
                        <p>Supplier ID: {s.id}</p>
                        <ol>
                          {events.data
                            ?.filter((e) => e.supplier_id === s.id)
                            .map((e) => (
                              <li key={e.id}>
                                {formatTime(e.occurred_at)} · {e.reason}
                                <details>
                                  <summary>Preserved values and actor</summary>
                                  <p>Actor {e.actor_id}</p>
                                  <pre className="history-json">
                                    {JSON.stringify(
                                      {
                                        previous: e.previous_value,
                                        current: e.new_value,
                                      },
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </details>
                              </li>
                            ))}
                        </ol>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RecordTable>
        </section>
      )}
    </>
  );
}
