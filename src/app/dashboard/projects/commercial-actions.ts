"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/workspace-session";
import { financialAmountPattern } from "@/lib/finance";
import { commercialStages } from "@/lib/project-workspace";
import type { FormState } from "@/lib/phase1";
export async function commercialAction(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  if (process.env.ONE_ODC_UI_R0_ENABLED !== "true")
    return { error: "This workflow is not enabled." };
  const v = z
    .object({
      project: z.uuid(),
      stage: z.enum(commercialStages),
      intent: z.enum(["negotiate", "close", "lost", "handoff"]),
      reason: z.string().trim().min(1).max(2000),
      confirm: z.literal("yes"),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success)
    return { error: "Provide a reason and explicitly confirm the action." };
  const d = v.data;
  const { client } = await requireRole(
    d.intent === "negotiate" || d.intent === "handoff"
      ? ["lead_designer"]
      : ["bdm"],
  );
  let endpoint: string, args: Record<string, unknown>;
  if (d.intent === "close") {
    const price = String(form.get("price") ?? "");
    const version = z.coerce
      .number()
      .int()
      .nonnegative()
      .safeParse(form.get("sale_version"));
    if (!financialAmountPattern.test(price) || !version.success)
      return {
        error:
          "Enter the agreed closure price in PHP with at most two decimals.",
      };
    endpoint = "close_project_deal";
    args = {
      p_project: d.project,
      p_expected_stage: d.stage,
      p_price: price,
      p_sale_version: version.data,
      p_reason: d.reason,
      p_confirm: true,
    };
  } else if (d.intent === "handoff") {
    const primary = z.uuid().safeParse(form.get("primary"));
    if (!primary.success)
      return { error: "Select an active Operations Admin." };
    endpoint = "handoff_closed_project";
    args = {
      p_project: d.project,
      p_primary_ops: primary.data,
      p_reason: d.reason,
      p_confirm: true,
    };
  } else {
    endpoint = "transition_commercial_stage";
    args = {
      p_project: d.project,
      p_expected_stage: d.stage,
      p_target: d.intent === "lost" ? "Lost" : "Under Negotiation",
      p_reason: d.reason,
      p_confirm: true,
    };
  }
  const result = await client.rpc(endpoint, args);
  if (result.error) {
    const message = result.error.message;
    return {
      error: message.includes("PROJECT_LOST")
        ? "This project is Lost and read-only."
        : /STALE|VERSION_CONFLICT|ALREADY|INVALID_HANDOFF_STATE/.test(message)
          ? "The project changed. Reload and review the current status before retrying."
          : message.includes("ACCESS_DENIED")
            ? "Only the assigned Lead Designer or primary BDM can perform their respective actions."
            : message.includes("INVALID_COMMERCIAL_TRANSITION")
              ? "The project must be sent to the BDM before it can be closed."
              : "The action could not be saved. Check the fields and try again.",
    };
  }
  revalidatePath("/dashboard", "layout");
  return {
    error: null,
    success:
      d.intent === "close"
        ? "Deal closed at the agreed price. The Lead Designer has been notified to arrange handoff."
        : d.intent === "lost"
          ? "Project marked Lost. Records and files are now read-only."
          : d.intent === "handoff"
            ? "Operations Admin assigned. Ordered Spaces can now be handed off separately."
            : "Project sent to the BDM for negotiation.",
  };
}
