import Link from "next/link";
import { dashboardOptions, dashboardSchema } from "@/lib/dashboard";
import { RoleDashboard } from "@/components/role-dashboard";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { leadSchema, mayReview, roleLabels } from "@/lib/phase1";
import { PageIntro, LeadTable } from "@/components/live-data";
import { Button } from "@/components/ui/button";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ restricted?: string; view?: string; page?: string }>;
}) {
  const { client, profile } = await requireWorkspace();
  const params = await searchParams;
  if (process.env.ONE_ODC_DASHBOARDS_ENABLED === "true") {
    const options = dashboardOptions(profile.role, params.view, params.page);
    const result = await client.rpc("role_dashboard", {
      p_view: options.view,
      p_page: options.page,
    });
    checkDatabase(result.error);
    const data = dashboardSchema.parse(result.data);
    return (
      <>
        <PageIntro
          title={`Welcome, ${profile.display_name}.`}
          description={`${roleLabels[profile.role]} · Your live project workspace.`}
        >
          {profile.role === "bdm" && (
            <Button asChild>
              <Link href="/dashboard/leads/new">New quotation request</Link>
            </Button>
          )}
        </PageIntro>
        {params.restricted && (
          <p className="form-error" role="alert">
            Your role does not permit access to that page.
          </p>
        )}
        {process.env.ONE_ODC_ANALYTICS_ENABLED === "true" && (
          <p className="dashboard-analytics-link">
            <Link className="text-link" href="/dashboard/analytics">
              Project analytics →
            </Link>
          </p>
        )}
        <RoleDashboard data={data} />
      </>
    );
  }
  let activeProjects = client
    .from("projects")
    .select("id", { count: "exact", head: true });
  if (process.env.ONE_ODC_MONITORING_ENABLED === "true")
    activeProjects = activeProjects.eq("is_cancelled", false);
  if (process.env.ONE_ODC_INSTALLATIONS_ENABLED === "true")
    activeProjects = activeProjects.eq("is_operationally_completed", false);
  const [leads, projects, notifications] = await Promise.all([
    client
      .from("leads")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(6),
    activeProjects,
    client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);
  for (const result of [leads, projects, notifications])
    checkDatabase(result.error);
  const records = leadSchema.array().parse(leads.data ?? []);
  return (
    <>
      <PageIntro
        title={`Welcome, ${profile.display_name}.`}
        description={`${roleLabels[profile.role]} · Your live project workspace.`}
      >
        {profile.role === "bdm" && (
          <Button asChild>
            <Link href="/dashboard/leads/new">New quotation request</Link>
          </Button>
        )}
      </PageIntro>
      {params.restricted && (
        <p className="form-error" role="alert">
          Your role does not permit access to that page.
        </p>
      )}
      <div className="metric-grid live-metrics">
        {[
          {
            name: "Accessible leads",
            count: leads.count ?? 0,
            href: "/dashboard/leads",
          },
          {
            name:
              process.env.ONE_ODC_MONITORING_ENABLED === "true"
                ? "Active assigned projects"
                : "Assigned projects",
            count: projects.count ?? 0,
            href: "/dashboard/projects",
          },
          {
            name: "Unread notifications",
            count: notifications.count ?? 0,
            href: "/dashboard/notifications",
          },
        ]
          .filter(
            (m) =>
              m.href !== "/dashboard/leads" ||
              profile.role === "bdm" ||
              mayReview(profile.role),
          )
          .map((m) => (
            <Link className="metric-card" href={m.href} key={m.name}>
              <div>{m.name}</div>
              <strong>{m.count}</strong>
              <p>View records →</p>
            </Link>
          ))}
      </div>
      {(profile.role === "bdm" || mayReview(profile.role)) && (
        <>
          <div className="live-section-title">
            <h2>
              {mayReview(profile.role)
                ? "Recent lead activity"
                : "Your recent leads"}
            </h2>
            <Link className="text-link" href="/dashboard/leads">
              View all leads →
            </Link>
          </div>
          <LeadTable leads={records} />
        </>
      )}
      {profile.role === "operations_admin" && (
        <section className="surface settings-section">
          <h2>Your project pipeline</h2>
          <p>
            Before commercial closure, assigned projects show only their
            approved pipeline preview. Lead details, commercial pricing,
            designs, and attachments are not exposed.
          </p>
          <Link className="text-link" href="/dashboard/projects">
            View assigned projects →
          </Link>
        </section>
      )}
    </>
  );
}
