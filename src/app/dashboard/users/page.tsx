import { UserDirectory } from "@/components/ui-r4/directories";
import Link from "next/link";
import { requireRole } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { profileSchema, roleLabels } from "@/lib/phase1";
import { InvitationForm, UserAccessForm } from "@/components/workflow-forms";
import { PageIntro } from "@/components/live-data";
import { loadAccessHistory } from "./history-actions";
export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    role?: string;
    status?: string;
  }>;
}) {
  const { client } = await requireRole(["system_administrator"]);
  const p = await searchParams;
  const page = Math.min(
    100000,
    Math.max(1, Number.parseInt(p.page ?? "1", 10) || 1),
  );
  const query = (p.q ?? "").trim();
  const role =
    p.role && roleLabels[p.role as keyof typeof roleLabels] ? p.role : "";
  const status =
    p.status === "active" || p.status === "inactive" ? p.status : "";
  let profilesQuery = client
    .from("profiles")
    .select("id,display_name,role,active", { count: "exact" });
  if (query) profilesQuery = profilesQuery.ilike("display_name", `%${query}%`);
  if (role) profilesQuery = profilesQuery.eq("role", role);
  if (status) profilesQuery = profilesQuery.eq("active", status === "active");
  const { data, error, count } = await profilesQuery
    .order("created_at", { ascending: false })
    .range((page - 1) * 25, page * 25 - 1);
  checkDatabase(error);
  const profiles = profileSchema.array().parse(data ?? []);
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true") {
    const audit = await loadAccessHistory(1);
    if (audit.error) throw new Error(audit.error);
    return (
      <UserDirectory
        profiles={profiles}
        count={count ?? 0}
        page={page}
        query={query}
        roleFilter={role}
        statusFilter={status}
        configured={
          !!process.env.SUPABASE_SECRET_KEY && !!process.env.NEXT_PUBLIC_APP_URL
        }
        history={audit.events ?? []}
        historyCount={audit.count ?? 0}
      />
    );
  }
  return (
    <>
      <PageIntro
        title="User management"
        description="Invite colleagues, assign roles, and activate or deactivate access. Every change is audited."
      />
      <details className="surface workspace-disclosure">
        <summary>Invite a team member</summary>
        <InvitationForm
          configured={
            !!process.env.SUPABASE_SECRET_KEY &&
            !!process.env.NEXT_PUBLIC_APP_URL
          }
        />
      </details>
      <section className="surface account-directory" aria-label="Team accounts">
        <div className="section-heading">
          <h2>Team accounts</h2>
          <span className="section-kicker">{count ?? 0} accounts</span>
        </div>
        {profiles.map((p) => (
          <details className="account-row" key={p.id}>
            <summary>
              <span>
                <strong>{p.display_name}</strong>
                <small>{roleLabels[p.role]}</small>
              </span>
              <span
                className="record-status"
                data-status={p.active ? "Active" : "Inactive"}
              >
                {p.active ? "Active" : "Inactive"}
              </span>
              <span className="account-edit-label">Manage access</span>
            </summary>
            <UserAccessForm profile={p} />
          </details>
        ))}
      </section>
      <div className="pagination">
        <span>
          {count ?? 0} accounts · Page {page}
        </span>
        {page > 1 && <Link href={`?page=${page - 1}`}>← Previous</Link>}
        {page * 25 < (count ?? 0) && (
          <Link href={`?page=${page + 1}`}>Next →</Link>
        )}
      </div>
    </>
  );
}
