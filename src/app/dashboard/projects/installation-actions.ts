"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/workspace-session";
import type { FormState } from "@/lib/phase1";
import { installationStatuses, installationError } from "@/lib/installations";
export async function installationAction(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  if (String(data.get("intent")) !== "complete")
    return { error: "Installation management is not enabled." };
  const get = (key: string) => String(data.get(key) ?? "");
  const complete = get("intent") === "complete";
  const { client } = await requireRole(
    complete
      ? ["lead_designer", "system_administrator"]
      : [
          "designer",
          "lead_designer",
          "operations_admin",
          "system_administrator",
        ],
  );
  const common = z
    .object({
      project: z.uuid(),
      version: z.coerce.number().int().nonnegative(),
      reason: z.string().trim().max(2000),
      confirm: z.literal("yes"),
    })
    .safeParse({
      project: get("project"),
      version: get("version"),
      reason: get("reason"),
      confirm: get("confirm"),
    });
  if (!common.success)
    return { error: "Check the Project, record and explicit confirmation." };
  let args: Record<string, unknown>, name: string;
  if (complete) {
    const cycle = z.coerce.number().int().positive().safeParse(get("cycle"));
    if (!cycle.success || !common.data.reason)
      return { error: "A current cycle and completion reason are required." };
    name = "complete_operations";
    args = {
      p_project: common.data.project,
      p_version: common.data.version,
      p_cycle: cycle.data,
      p_confirm: true,
      p_reason: common.data.reason,
    };
  } else {
    const fields = z
      .object({
        space: z.uuid(),
        status: z.enum(installationStatuses),
        date: z.iso.date().nullable(),
      })
      .safeParse({
        space: get("space"),
        status: get("status"),
        date: get("date") || null,
      });
    if (!fields.success)
      return { error: "Check the Space, installation status and date." };
    name = "save_installation";
    args = {
      p_space: fields.data.space,
      p_project: common.data.project,
      p_version: common.data.version,
      p_status: fields.data.status,
      p_date: fields.data.date,
      p_reason: common.data.reason,
      p_override: data.has("override"),
    };
  }
  const r = await client.rpc(name, args);
  if (r.error) return { error: installationError(r.error.message) };
  revalidatePath(`/dashboard/projects/${common.data.project}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/notifications");
  return {
    error: null,
    success: complete
      ? "Operational cycle completed. History and financial monitoring remain available."
      : "Installation saved with immutable history. Design and logistics remain independent.",
  };
}
