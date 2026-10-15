import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { SavedResources } from "./resource-links";
import { ProjectResourceForm } from "./project-resource-form";
import {
  LeadAttachments,
  type StoredAttachment,
  type StoredVersion,
} from "./lead-attachments";
export async function ProjectResources({
  project,
  manager,
  primaryBdm,
}: {
  project: string;
  manager: boolean;
  primaryBdm: boolean;
}) {
  const { client, profile } = await requireWorkspace();
  const [lifecycle, r, slots] = await Promise.all([
    client.from("projects").select("is_cancelled").eq("id", project).single(),
    client.rpc("project_resources", { p_project: project }),
    client.rpc("get_attachment_slots", { p_project: project }),
  ]);
  checkDatabase(lifecycle.error);
  const cancelled = lifecycle.data?.is_cancelled ?? true;
  checkDatabase(r.error);
  const details = r.data;
  const attached = await client
    .from("attachments")
    .select("id,archived_at")
    .or(`project_id.eq.${project},lead_id.eq.${details.lead_id}`);
  checkDatabase(attached.error);
  const versions = attached.data?.length
    ? await client
        .from("attachment_versions")
        .select("*")
        .in(
          "attachment_id",
          attached.data.map((a) => a.id),
        )
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [], error: null };
  checkDatabase(versions.error);
  checkDatabase(slots.error);
  return (
    <>
      <section className="surface live-form">
        <h2>Notes</h2>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {details.notes || "No notes"}
        </p>
        <SavedResources links={details.resource_links} />
      </section>
      {!cancelled && (manager || primaryBdm) && (
        <details className="surface workspace-disclosure">
          <summary>Edit Notes and resources</summary>
          <ProjectResourceForm
            project={project}
            version={details.version}
            notes={details.notes}
            links={details.resource_links}
          />
        </details>
      )}
      <details className="surface workspace-disclosure">
        <summary>Project files and versions</summary>
        <LeadAttachments
          leadId=""
          projectId={project}
          editable={!cancelled}
          userId={profile.id}
          attachments={(attached.data ?? []) as StoredAttachment[]}
          versions={(versions.data ?? []) as StoredVersion[]}
          slots={slots.data}
        />
      </details>
    </>
  );
}
