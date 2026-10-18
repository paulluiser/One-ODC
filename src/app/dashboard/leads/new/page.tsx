import { Scope, Heading } from "@/components/ui-r2/primitives";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/workspace-session";
import { LeadForm } from "@/components/workflow-forms";
import { checkDatabase } from "@/lib/live-data";
import { PageIntro } from "@/components/live-data";
export default async function NewLead() {
  const { profile, client } = await requireRole(["bdm"]);
  const designers = await client.rpc("list_lead_designers");
  checkDatabase(designers.error);
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true")
    return (
      <Scope>
        <Heading
          title="New quotation request"
          description="Start with the client’s brief. Paste links to drawings and other files."
        />
        <LeadForm
          leadDesigners={designers.data ?? []}
          rebuild
          id={randomUUID()}
          bdmName={profile.display_name}
        />
      </Scope>
    );
  return (
    <>
      <PageIntro
        title="New quotation request"
        description="Start with the client's brief. Add file links, then save a draft or submit it for review."
      />
      <LeadForm
        leadDesigners={designers.data ?? []}
        id={randomUUID()}
        bdmName={profile.display_name}
      />
    </>
  );
}
