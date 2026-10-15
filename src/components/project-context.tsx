import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import {
  projectMetrics,
  projectWorkState,
  type Monitoring,
} from "@/lib/monitoring";
import type { Project, Member } from "@/lib/phase1";
export async function ProjectContext({ project }: { project: Project }) {
  const { client, profile } = await requireWorkspace();
  // Pipeline preview deliberately performs no design, origin or team reads.
  if (
    profile.role === "operations_admin" &&
    project.commercial_status !== "Closed"
  )
    return null;
  const r =
    process.env.ONE_ODC_MONITORING_ENABLED === "true"
      ? await client.rpc("monitoring_summary", { p_projects: [project.id] })
      : { data: [], error: null };
  checkDatabase(r.error);
  const m = (r.data as Monitoring[])[0];
  const team =
    profile.role !== "operations_admin"
      ? await client.rpc("project_team", { p_project: project.id })
      : { data: [], error: null };
  checkDatabase(team.error);
  const members = (team.data ?? []) as Member[];
  let brand: string | null = null;
  if (["bdm", "lead_designer", "system_administrator"].includes(profile.role)) {
    const origin = await client
      .from("project_origins")
      .select("lead_id")
      .eq("project_id", project.id)
      .maybeSingle();
    checkDatabase(origin.error);
    if (origin.data) {
      const lead = await client
        .from("leads")
        .select("brand")
        .eq("id", origin.data.lead_id)
        .maybeSingle();
      checkDatabase(lead.error);
      brand = lead.data?.brand || null;
    }
  }
  return (
    <div
      className="project-context"
      role="group"
      aria-label="Project at a glance"
    >
      {brand && (
        <div>
          <span>Brand</span>
          <strong>{brand}</strong>
        </div>
      )}
      <div>
        <span>Lifecycle</span>
        <strong>{m ? projectWorkState(m) : project.commercial_status}</strong>
      </div>
      <div>
        <span>Project deadline</span>
        <strong>{m?.deadline || "Not scheduled"}</strong>
      </div>
      <div>
        <span>Design progress</span>
        <strong>{m ? projectMetrics(m).progress : "Not Available"}</strong>
      </div>
      {profile.role !== "operations_admin" &&
        members.some(
          (x) => x.membership_role === "designer" && x.is_primary,
        ) && (
          <div>
            <span>Primary Designer</span>
            <strong>
              {
                members.find(
                  (x) => x.membership_role === "designer" && x.is_primary,
                )?.display_name
              }
            </strong>
          </div>
        )}
      {m && (
        <div>
          <span>Attention</span>
          <strong>{projectMetrics(m).risk}</strong>
        </div>
      )}
      {profile.role !== "operations_admin" && (
        <div>
          <span>Lead Designer</span>
          <strong>
            {members.find((x) => x.membership_role === "lead_designer")
              ?.display_name || "Not available"}
          </strong>
        </div>
      )}
    </div>
  );
}
