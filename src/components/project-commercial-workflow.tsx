import type { ReactNode } from "react";
import menuStyles from "./project-workspace/workspace.module.css";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { CommercialStageForm } from "./commercial-stage-form";
export async function ProjectCommercialWorkflow({
  project,
  compact = false,
  teamAction,
}: {
  project: string;
  compact?: boolean;
  teamAction?: ReactNode;
}) {
  if (
    process.env.ONE_ODC_UI_R0_ENABLED !== "true" ||
    !z.uuid().safeParse(project).success
  )
    return null;
  const { client, profile } = await requireWorkspace();
  const r = await client
    .from("projects")
    .select(
      "commercial_status,lead_designer_id,awaiting_handoff,lost_reason,is_cancelled,is_operationally_completed",
    )
    .eq("id", project)
    .maybeSingle();
  checkDatabase(r.error);
  if (!r.data) return null;
  const p = r.data,
    administrator = profile.role === "system_administrator",
    lead =
      administrator ||
      (profile.role === "lead_designer" && profile.id === p.lead_designer_id);
  let primary = administrator;
  if (profile.role === "bdm") {
    const m = await client
      .from("project_memberships")
      .select("user_id")
      .eq("project_id", project)
      .eq("user_id", profile.id)
      .eq("membership_role", "bdm")
      .eq("is_primary", true)
      .maybeSingle();
    checkDatabase(m.error);
    primary = !!m.data;
  }
  const open =
    ["For Quotation", "Under Negotiation"].includes(p.commercial_status) &&
    !p.is_cancelled &&
    !p.is_operationally_completed;
  const sale =
    primary && p.commercial_status === "Under Negotiation"
      ? await client.rpc("get_commercial_handoff", { p_project: project })
      : { data: null, error: null };
  checkDatabase(sale.error);
  const directory =
    lead && p.awaiting_handoff
      ? await client.rpc("list_assignable_people")
      : { data: [], error: null };
  checkDatabase(directory.error);
  const ops = (directory.data ?? []).filter(
    (person: { role: string }) => person.role === "operations_admin",
  );
  const actions = (
    <>
      {lead && open && p.commercial_status === "For Quotation" && (
        <CommercialStageForm
          menuItem={compact}
          project={project}
          stage={p.commercial_status}
          intent="negotiate"
        />
      )}
      {primary && open && p.commercial_status === "Under Negotiation" && (
        <CommercialStageForm
          menuItem={compact}
          project={project}
          stage={p.commercial_status}
          intent="close"
          price={sale.data?.sale?.amount}
          version={sale.data?.sale?.version ?? 0}
        />
      )}
      {primary && open && (
        <CommercialStageForm
          menuItem={compact}
          project={project}
          stage={p.commercial_status}
          intent="lost"
        />
      )}
      {lead &&
        p.awaiting_handoff &&
        !p.is_cancelled &&
        !p.is_operationally_completed && (
          <CommercialStageForm
            menuItem={compact}
            project={project}
            stage={p.commercial_status}
            intent="handoff"
            people={ops}
          />
        )}
      {compact && teamAction}
    </>
  );
  if (compact) {
    const available =
      (open &&
        (primary || (lead && p.commercial_status === "For Quotation"))) ||
      (lead &&
        p.awaiting_handoff &&
        !p.is_cancelled &&
        !p.is_operationally_completed) ||
      !!teamAction;
    return available ? (
      <section
        className={menuStyles.actionGroup}
        aria-label="Team and pipeline"
      >
        <h3>Team &amp; Pipeline</h3>
        {actions}
      </section>
    ) : null;
  }
  return (
    <section
      className={compact ? "commercial-workspace-actions" : "surface live-form"}
      aria-label="Project commercial workflow"
      style={compact ? undefined : { marginBottom: 20 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          {!compact && (
            <h2 style={{ fontSize: 16 }}>
              Commercial status: {p.commercial_status}
              {p.awaiting_handoff ? " · Awaiting Handoff" : ""}
            </h2>
          )}
          {p.commercial_status === "Lost" && (
            <p role="status">
              This project is read-only.
              {profile.role !== "operations_admin" ? ` ${p.lost_reason}` : ""}
            </p>
          )}
          {p.awaiting_handoff && (
            <p>
              The deal is locked. The Lead Designer or System Administrator must
              assign Operations and hand off the project.
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions}
        </div>
      </div>
    </section>
  );
}
