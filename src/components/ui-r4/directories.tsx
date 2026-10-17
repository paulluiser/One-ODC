import Link from "next/link";
import { FilterBar } from "../filter-bar";
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
  status = "",
  page,
  count,
}: {
  suppliers: Supplier[];
  events: SupplierEvent[];
  search: string;
  sort: string;
  status?: string;
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
        <FilterBar
          resultCount={count}
          values={{ q: search, sort, status }}
          config={{
            label: "Supplier filters",
            search: {
              key: "q",
              label: "Search suppliers",
              placeholder: "Search supplier name…",
            },
            sort: {
              key: "sort",
              label: "Sort suppliers",
              defaultValue: "name",
              options: [
                { value: "name", label: "Name A–Z" },
                { value: "name_desc", label: "Name Z–A" },
                { value: "updated", label: "Recently updated" },
              ],
            },
            fields: [
              {
                key: "status",
                label: "Availability",
                options: [
                  { value: "", label: "All suppliers" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ],
              },
            ],
          }}
        />
        <div className={styles.toolbar}>
          <p>
            {count} matching suppliers · Page {page}
          </p>
          <nav aria-label="Supplier pages">
            {page > 1 && (
              <Link
                href={`?q=${encodeURIComponent(search)}&sort=${sort}&status=${status}&page=${page - 1}`}
              >
                Previous
              </Link>
            )}{" "}
            {page * 50 < count && (
              <Link
                href={`?q=${encodeURIComponent(search)}&sort=${sort}&status=${status}&page=${page + 1}`}
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
  sort = "newest",
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
  sort?: string;
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
        <FilterBar
          resultCount={count}
          values={{ q: query, role: roleFilter, status: statusFilter, sort }}
          config={{
            label: "Team access filters",
            sort: {
              key: "sort",
              label: "Sort team accounts",
              defaultValue: "newest",
              options: [
                { value: "newest", label: "Newest first" },
                { value: "name", label: "Name A–Z" },
              ],
            },
            search: {
              key: "q",
              label: "Search team accounts",
              placeholder: "Search team member name…",
            },
            fields: [
              {
                key: "role",
                label: "Role",
                options: [
                  { value: "", label: "All roles" },
                  ...Object.entries(roleLabels).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ],
              },
              {
                key: "status",
                label: "Access",
                options: [
                  { value: "", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ],
              },
            ],
          }}
        />
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
              href={`?q=${encodeURIComponent(query)}&role=${roleFilter}&status=${statusFilter}&sort=${sort}&page=${page - 1}`}
            >
              Previous
            </Link>
          )}
          {page * 25 < count && (
            <Link
              href={`?q=${encodeURIComponent(query)}&role=${roleFilter}&status=${statusFilter}&sort=${sort}&page=${page + 1}`}
            >
              Next
            </Link>
          )}
        </nav>
      </section>
    </OperationsFrame>
  );
}
