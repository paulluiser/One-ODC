import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { Supplier } from "../../lib/logistics";
import { formatTime, roleLabels, type Profile } from "../../lib/phase1";
import { LogisticsForm } from "../logistics-form";
import { InvitationForm, UserAccessForm } from "../workflow-forms";
import { RecordTable } from "../record-table";
import { Status } from "../ui-r2/primitives";
import {
  OperationsFrame,
  OperationEditor,
  OperationSummary,
} from "./primitives";
import styles from "./ui-r4.module.css";
import { AccessTools } from "./access-tools";
type SupplierEvent = {
  id: string;
  supplier_id: string;
  actor_id: string;
  reason: string;
  occurred_at: string;
  previous_value: unknown;
  new_value: unknown;
};
export function SupplierDirectory({
  suppliers,
  events,
  search,
  sort,
  page,
  count,
}: {
  suppliers: Supplier[];
  events: SupplierEvent[];
  search: string;
  sort: string;
  page: number;
  count: number;
}) {
  return (
    <OperationsFrame
      title="Supplier Masterlist"
      description="Supplier contacts and availability, in one directory."
      action={
        <OperationEditor title="Add supplier" enabled>
          <LogisticsForm rebuild id={randomUUID()} />
        </OperationEditor>
      }
    >
      <section className="surface live-form">
        <form className={styles.filters} action="/dashboard/suppliers">
          <label htmlFor="supplier-search">
            Search supplier name
            <input
              id="supplier-search"
              name="q"
              maxLength={200}
              defaultValue={search}
            />
          </label>
          <label htmlFor="supplier-sort">
            Sort suppliers
            <select id="supplier-sort" name="sort" defaultValue={sort}>
              <option value="name">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="updated">Recently updated</option>
            </select>
          </label>
          <button className="button button-primary">Search</button>
          <Link className="button button-outline" href="/dashboard/suppliers">
            Clear
          </Link>
        </form>
        <div className={styles.toolbar}>
          <p>
            {count} matching suppliers · Page {page}
          </p>
          <nav aria-label="Supplier pages">
            {page > 1 && (
              <Link
                href={`?q=${encodeURIComponent(search)}&sort=${sort}&page=${page - 1}`}
              >
                Previous
              </Link>
            )}{" "}
            {page * 50 < count && (
              <Link
                href={`?q=${encodeURIComponent(search)}&sort=${sort}&page=${page + 1}`}
              >
                Next
              </Link>
            )}
          </nav>
        </div>
      </section>
      <section className="surface live-form" aria-label="Supplier directory">
        {!suppliers.length ? (
          <>
            <h2>No suppliers found</h2>
            <p>Adjust your search or add an authorized supplier.</p>
          </>
        ) : (
          <RecordTable label="Supplier directory table">
            <table className={styles.directory}>
              <caption className="sr-only">Supplier Masterlist</caption>
              <thead>
                <tr>
                  <th scope="col">Supplier / brand</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Status</th>
                  <th scope="col">Manage</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} aria-label={`Supplier ${s.name}`}>
                    <th scope="row">
                      {s.name}
                      <small>{s.brand || "No brand association"}</small>
                    </th>
                    <td>
                      {s.contact_person || "Contact not provided"}
                      <small style={{ whiteSpace: "pre-wrap" }}>
                        {s.contact_details}
                      </small>
                    </td>
                    <td>
                      <Status>{s.active ? "Active" : "Inactive"}</Status>
                      <small>Updated {formatTime(s.updated_at)}</small>
                    </td>
                    <td>
                      <OperationEditor
                        title={`Edit supplier: ${s.name}`}
                        enabled
                        menu
                      >
                        <LogisticsForm rebuild id={s.id} supplier={s} />
                      </OperationEditor>
                      <details>
                        <OperationSummary>
                          Supplier audit history
                        </OperationSummary>
                        {s.remarks && <p>{s.remarks}</p>}
                        <ol className={styles.history}>
                          {events
                            .filter((e) => e.supplier_id === s.id)
                            .map((e) => (
                              <li key={e.id}>
                                <strong>{e.reason}</strong>
                                <small>{formatTime(e.occurred_at)}</small>
                                <details>
                                  <OperationSummary>
                                    Preserved values and actor
                                  </OperationSummary>
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
                        <details>
                          <OperationSummary>
                            Supplier reference
                          </OperationSummary>
                          <p>{s.id}</p>
                        </details>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RecordTable>
        )}
      </section>
    </OperationsFrame>
  );
}
export function UserDirectory({
  profiles,
  count,
  page,
  configured,
  history,
  historyCount = history.length,
  query = "",
  roleFilter = "",
  statusFilter = "",
}: {
  profiles: Profile[];
  count: number;
  page: number;
  configured: boolean;
  historyCount?: number;
  history: {
    id: string;
    entity_id: string;
    action: string;
    actor_id: string;
    occurred_at: string;
  }[];
  query?: string;
  roleFilter?: string;
  statusFilter?: string;
}) {
  return (
    <OperationsFrame
      title="User management"
      description="Manage invitation-only access and existing team roles."
      action={
        <div className={styles.accessActions}>
          <AccessTools history={history} count={historyCount} />
          <OperationEditor
            title="Invite a team member"
            enabled
            description="Invite a colleague using the existing provisioning workflow."
          >
            <InvitationForm configured={configured} rebuild />
          </OperationEditor>
        </div>
      }
    >
      <section className="surface live-form">
        <form className={styles.filters} action="/dashboard/users">
          <label htmlFor="user-search">
            Search team accounts
            <input
              id="user-search"
              name="q"
              defaultValue={query}
              placeholder="Search by name"
              maxLength={200}
            />
          </label>
          <label htmlFor="user-role">
            Role
            <select id="user-role" name="role" defaultValue={roleFilter}>
              <option value="">All roles</option>
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="user-status">
            Status
            <select id="user-status" name="status" defaultValue={statusFilter}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <button className="button button-primary">Filter</button>
          <Link className="button button-outline" href="/dashboard/users">
            Clear
          </Link>
        </form>
        <div className={styles.toolbar}>
          <h2>Team accounts</h2>
          <p>
            {count} accounts · Page {page}
          </p>
        </div>
        {!configured && (
          <p role="status">
            Invitations are unavailable in this preview. Existing account access
            management remains available.
          </p>
        )}
        <RecordTable label="Team accounts">
          <table className={styles.directory}>
            <caption className="sr-only">Team accounts and access</caption>
            <thead>
              <tr>
                <th scope="col">Team member</th>
                <th scope="col">Role</th>
                <th scope="col">Access</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.display_name}</th>
                  <td>{roleLabels[p.role]}</td>
                  <td>
                    <Status>{p.active ? "Active" : "Inactive"}</Status>
                  </td>
                  <td>
                    <OperationEditor
                      title={`Manage access: ${p.display_name}`}
                      enabled
                      menu
                      description="Role and activation changes require a reason and are audited."
                    >
                      <UserAccessForm profile={p} rebuild />
                    </OperationEditor>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </RecordTable>
        {!profiles.length && <p>No accounts on this page.</p>}
        <nav className={styles.toolbar} aria-label="Account pages">
          {page > 1 && (
            <Link
              href={`?q=${encodeURIComponent(query)}&role=${roleFilter}&status=${statusFilter}&page=${page - 1}`}
            >
              Previous
            </Link>
          )}
          {page * 25 < count && (
            <Link
              href={`?q=${encodeURIComponent(query)}&role=${roleFilter}&status=${statusFilter}&page=${page + 1}`}
            >
              Next
            </Link>
          )}
        </nav>
      </section>
    </OperationsFrame>
  );
}
