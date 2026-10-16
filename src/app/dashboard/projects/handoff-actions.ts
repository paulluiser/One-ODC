"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/workspace-session";
import type { FormState } from "@/lib/phase1";
import { commercialStages } from "@/lib/project-workspace";
import { handoffError } from "@/lib/handoff";
export async function handoffAction(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  if (process.env.ONE_ODC_HANDOFF_ENABLED !== "true")
    return { error: "Commercial closure is not enabled in this environment." };
  const intent = String(data.get("intent") ?? "");
  const { client } = await requireRole(
    intent === "close"
      ? ["bdm", "lead_designer", "system_administrator"]
      : ["operations_admin"],
  );
  const common = z
    .object({ project: z.uuid(), confirm: z.literal("yes") })
    .safeParse({ project: data.get("project"), confirm: data.get("confirm") });
  if (!common.success)
    return {
      error: "Choose a valid Project and explicitly confirm the action.",
    };
  let name: string, args: Record<string, unknown>;
  if (intent === "close") {
    const closure = z
      .object({
        stage: z.enum(commercialStages),
        sale_version: z.coerce.number().int().positive(),
        primary: z.uuid(),
        reason: z.string().trim().max(2000),
      })
      .safeParse({
        stage: data.get("stage"),
        sale_version: data.get("sale_version"),
        primary: data.get("primary"),
        reason: data.get("reason"),
      });
    if (!closure.success)
      return {
        error:
          "Record Sale and assign a primary Operations Admin before closing.",
      };
    name = "close_project_sale";
    args = {
      p_project: common.data.project,
      p_expected_stage: closure.data.stage,
      p_sale_version: closure.data.sale_version,
      p_primary_ops: closure.data.primary,
      p_confirm: true,
      p_reason: closure.data.reason,
    };
  } else if (intent === "acknowledge") {
    const acknowledgment = z
      .object({ id: z.uuid(), version: z.coerce.number().int().positive() })
      .safeParse({ id: data.get("handoff"), version: data.get("version") });
    if (!acknowledgment.success)
      return { error: "Reload to select the current handoff." };
    name = "acknowledge_handoff";
    args = {
      p_project: common.data.project,
      p_handoff: acknowledgment.data.id,
      p_version: acknowledgment.data.version,
      p_confirm: true,
    };
  } else return { error: "Choose a supported handoff action." };
  const result = await client.rpc(name, args);
  if (result.error) return { error: handoffError(result.error.message) };
  revalidatePath(`/dashboard/projects/${common.data.project}`);
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/notifications");
  return {
    error: null,
    success:
      intent === "close"
        ? "Sale closed. Operational handoff is pending acknowledgment."
        : "Handoff acknowledged. Design and payment statuses remain independent.",
  };
}
