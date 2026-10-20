import Link from "next/link";
import { FilterBar } from "../filter-bar";
import { roleLabels, type Profile } from "../../lib/phase1";
import { InvitationForm, UserAccessForm } from "../workflow-forms";
import { RecordTable } from "../record-table";
import { Status } from "../ui-r2/primitives";
import { OperationsFrame, OperationEditor } from "./primitives";
import styles from "./ui-r4.module.css";
import { AccessTools } from "./access-tools";
export { SupplierDirectory } from "./supplier-directory";
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
