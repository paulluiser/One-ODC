import { leadSupplierOptions } from "@/lib/lead-suppliers";
import { Scope, Heading } from "@/components/ui-r2/primitives";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/workspace-session";
import { LeadForm } from "@/components/workflow-forms";
import { checkDatabase } from "@/lib/live-data";
import { PageIntro } from "@/components/live-data";
export default async function NewLead() {
  const { profile, client } = await requireRole([
    "bdm",
    "system_administrator",
  ]);
  const suppliers = await leadSupplierOptions(client);
  const designers = await client.rpc("list_lead_designers");
  checkDatabase(designers.error);
  const bdms =
    profile.role === "system_administrator"
      ? await client
          .from("profiles")
          .select("id,display_name,role")
          .eq("active", true)
          .eq("role", "bdm")
          .order("display_name")
      : null;
  checkDatabase(bdms?.error ?? null);
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true")
    return (
      <Scope>
        <Heading
          title="New quotation request"
          description="Capture the client brief and assign it for review."
        />
        <LeadForm
          bdms={bdms?.data?.filter((p: { role: string }) => p.role === "bdm")}
          suppliers={suppliers}
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
        bdms={bdms?.data?.filter((p: { role: string }) => p.role === "bdm")}
        suppliers={suppliers}
        leadDesigners={designers.data ?? []}
        id={randomUUID()}
        bdmName={profile.display_name}
      />
    </>
  );
}
