import { Scope, Heading } from "@/components/ui-r2/primitives";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/workspace-session";
import { LeadForm } from "@/components/workflow-forms";
import { PageIntro } from "@/components/live-data";
export default async function NewLead() {
  const { profile } = await requireRole(["bdm"]);
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true")
    return (
      <Scope>
        <Heading
          title="New quotation request"
          description="Start with the client’s brief. Save your draft before adding private files."
        />
        <LeadForm
          rebuild
          resourcesEnabled={process.env.ONE_ODC_RESOURCES_ENABLED === "true"}
          id={randomUUID()}
          bdmName={profile.display_name}
        />
      </Scope>
    );
  return (
    <>
      <PageIntro
        title="New quotation request"
        description="Start with the client's brief. Save a draft or submit it for review."
      />
      <LeadForm
        resourcesEnabled={process.env.ONE_ODC_RESOURCES_ENABLED === "true"}
        id={randomUUID()}
        bdmName={profile.display_name}
      />
    </>
  );
}
