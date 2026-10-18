import { ProjectDirectory } from "@/components/ui-r2/directories";
import type { Monitoring } from "@/lib/monitoring";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { PageIntro, ProjectTable } from "@/components/live-data";
import {
  commercialStages,
  projectColumns,
  projectSchema,
  projectDirectoryOptions,
  projectDirectoryUrl,
  projectSearchPattern,
} from "@/lib/project-workspace";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client, profile } = await requireWorkspace();
  const parameters = await searchParams;
  const options = projectDirectoryOptions(parameters);
  let query = client
    .from("projects")
    .select(projectColumns, { count: "exact" });
  if (options.favorites) {
    const favorites = await client
      .from("project_shortcuts")
      .select("project_id")
      .eq("user_id", profile.id)
      .eq("favorite", true);
    checkDatabase(favorites.error);
    query = query.in(
      "id",
      favorites.data?.length
        ? favorites.data.map((record) => record.project_id)
        : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  if (options.q)
    query = query.ilike(options.searchBy, projectSearchPattern(options.q));
  if (options.stage) query = query.eq("commercial_status", options.stage);
  query = query
    .order(options.sort === "name" ? "name" : "created_at", {
      ascending: options.sort === "name",
    })
    .order("id", { ascending: true })
    .range((options.page - 1) * 25, options.page * 25 - 1);
  const { data, error, count } = await query;
  if (error?.code === "PGRST103" && options.page > 1)
    redirect(
      `${projectDirectoryUrl(options, 1)}&view=${parameters.view === "grid" ? "grid" : "list"}${typeof parameters.columns === "string" ? `&columns=${encodeURIComponent(parameters.columns)}` : ""}`,
    );
  checkDatabase(error);
  const projects = projectSchema.array().parse(data ?? []);
  let monitoring: Record<string, Monitoring> | undefined;
  if (process.env.ONE_ODC_MONITORING_ENABLED === "true") {
    const summaries = await client.rpc("monitoring_summary", {
      p_projects: projects.map((p) => p.id),
    });
    checkDatabase(summaries.error);
    monitoring = Object.fromEntries(
      (summaries.data as Monitoring[]).map((m) => [m.project_id, m]),
    );
  }
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true") {
    // One authenticated, RLS-protected lookup for names; no team/design reads for Ops previews.
    const names =
      profile.role !== "operations_admin" && projects.length
        ? await client
            .from("profiles")
            .select("id,display_name")
            .in("id", [...new Set(projects.map((p) => p.lead_designer_id))])
        : { data: [], error: null };
    checkDatabase(names.error);
    return (
      <ProjectDirectory
        columns={
          typeof parameters.columns === "string"
            ? parameters.columns
            : undefined
        }
        view={parameters.view === "grid" ? "grid" : "list"}
        projects={projects}
        options={options}
        count={count ?? 0}
        monitoring={monitoring}
        ops={profile.role === "operations_admin"}
        leads={Object.fromEntries(
          (names.data ?? []).map((p) => [p.id, p.display_name]),
        )}
      />
    );
  }
  const filtered = !!options.q || !!options.stage || options.favorites;
  return (
    <>
      <PageIntro
        title={
          profile.role === "operations_admin" ? "Project pipeline" : "Projects"
        }
        description={
          profile.role === "operations_admin"
            ? "Limited pipeline previews for your assigned projects."
            : "Projects created from accepted leads and scoped to your assignments."
        }
      />
      <form
        key={projectDirectoryUrl(options, 1)}
        className="list-controls"
        method="get"
      >
        <div className="live-field">
          <label htmlFor="q">Search projects</label>
          <input id="q" name="q" defaultValue={options.q} maxLength={200} />
        </div>
        <div className="live-field">
          <label htmlFor="by">Search by</label>
          <select id="by" name="by" defaultValue={options.searchBy}>
            <option value="name">Project name</option>
            <option value="reference">Reference</option>
          </select>
        </div>
        <div className="live-field">
          <label htmlFor="stage">Commercial stage</label>
          <select id="stage" name="stage" defaultValue={options.stage}>
            <option value="">All stages</option>
            {commercialStages.map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </div>
        <div className="live-field">
          <label htmlFor="sort">Sort projects</label>
          <select id="sort" name="sort" defaultValue={options.sort}>
            <option value="newest">Newest first</option>
            <option value="name">Project name</option>
          </select>
        </div>
        <Button type="submit">Apply filters</Button>
        {filtered && (
          <Link className="button button-outline" href="/dashboard/projects">
            Clear filters
          </Link>
        )}
      </form>
      {projects.length || !filtered ? (
        <ProjectTable projects={projects} monitoring={monitoring} />
      ) : (
        <section className="surface empty-state">
          <h2>No matching projects</h2>
          <p>
            Try a different search or stage. Results are limited to projects you
            can access.
          </p>
        </section>
      )}
      <nav className="pagination" aria-label="Project pages">
        <span>
          {count ?? 0} {filtered ? "matching " : ""}projects · Page{" "}
          {options.page}
        </span>
        {options.page > 1 && (
          <Link href={projectDirectoryUrl(options, options.page - 1)}>
            ← Previous
          </Link>
        )}
        {options.page * 25 < (count ?? 0) && (
          <Link href={projectDirectoryUrl(options, options.page + 1)}>
            Next →
          </Link>
        )}
      </nav>
    </>
  );
}
