"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/workspace-session";
import { readinessStatuses } from "@/lib/project-readiness";
import type { FormState } from "@/lib/phase1";
export async function readinessAction(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const intent = String(data.get("intent"));
  const { client } = await requireRole(
    intent === "acknowledge"
      ? ["operations_admin"]
      : intent === "handoff"
        ? ["lead_designer"]
        : ["designer", "lead_designer"],
  );
  const project = z.uuid().safeParse(data.get("project"));
  if (!project.success) return { error: "Select a valid Project." };
  let endpoint: string, args: Record<string, unknown>;
  if (intent === "acknowledge") {
    const id = z.uuid().safeParse(data.get("handoff"));
    if (!id.success) return { error: "Select a current handoff." };
    endpoint = "acknowledge_space_handoff";
    args = { p_handoff: id.data };
  } else {
    const reason = z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .safeParse(data.get("reason"));
    if (!reason.success)
      return { error: "Provide a change reason (1–2,000 characters)." };
    if (intent === "handoff") {
      const ids = z
        .array(z.uuid())
        .min(1)
        .max(100)
        .safeParse(data.getAll("spaces"));
      if (!ids.success) return { error: "Select 1–100 Ordered Spaces." };
      endpoint = "handoff_ordered_spaces";
      args = {
        p_project: project.data,
        p_spaces: ids.data,
        p_reason: reason.data,
      };
    } else {
      const fields = z
        .object({
          space: z.uuid(),
          version: z.coerce.number().int().positive(),
          status: z.enum(readinessStatuses),
        })
        .safeParse(Object.fromEntries(data));
      if (!fields.success)
        return { error: "Select a Space and readiness status." };
      endpoint = "change_space_readiness";
      args = {
        p_space: fields.data.space,
        p_version: fields.data.version,
        p_status: fields.data.status,
        p_reason: reason.data,
      };
    }
  }
  const result = await client.rpc(endpoint, args);
  if (result.error)
    return {
      error: /ACCESS_DENIED|ORDERED_TERMINAL/.test(result.error.message)
        ? "Only the assigned Lead Designer or System Administrator can roll back Ordered Spaces. Other changes require Space access."
        : /VERSION_CONFLICT|STALE/.test(result.error.message)
          ? "The record changed. Reload before retrying."
          : result.error.message.includes("OPERATIONS_ADMIN_REQUIRED")
            ? "Assign an Operations Admin before handing off Spaces."
            : "The project must be Active and Closed, with an open cycle. Only Ordered Spaces can be handed off. Reload and check the prerequisites.",
    };
  revalidatePath("/dashboard", "layout");
  return {
    error: null,
    success: "Saved. Assignment and historical records are preserved.",
  };
}
