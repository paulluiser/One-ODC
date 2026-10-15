"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/workspace-session";
import { activityCategories } from "@/lib/monitoring";
import { spaceError } from "@/lib/spaces";
import type { FormState } from "@/lib/phase1";
const text = (d: FormData, k: string) => String(d.get(k) || "");
export async function monitorAction(
  _s: FormState,
  d: FormData,
): Promise<FormState> {
  if (process.env.ONE_ODC_MONITORING_ENABLED !== "true")
    return { error: "Monitoring is not configured in this environment." };
  const intent = text(d, "intent");
  const { client } = await requireRole(
    intent === "activity"
      ? [
          "designer",
          "lead_designer",
          "operations_admin",
          "system_administrator",
        ]
      : ["lead_designer", "system_administrator"],
  );
  const common = z
    .object({
      project: z.uuid(),
      version: z.coerce.number().int().min(0),
      reason: z.string().trim().min(1).max(2000),
    })
    .safeParse({
      project: text(d, "project"),
      version: text(d, "version"),
      reason: text(d, "reason"),
    });
  if (!common.success)
    return {
      error:
        "Check your entries and provide a reason. Your entries have been kept.",
    };
  const c = common.data;
  let name: string;
  let args: Record<string, unknown>;
  if (intent === "activity") {
    const parsed = z
      .object({
        id: z.uuid(),
        space: z.uuid().nullable(),
        category: z.enum(activityCategories),
        date: z.iso.date(),
        description: z.string().trim().min(1).max(4000),
        coordinator: z.uuid().nullable(),
        attachments: z.array(z.uuid()).max(5),
      })
      .safeParse({
        id: text(d, "id"),
        space: text(d, "space") || null,
        category: text(d, "category"),
        date: text(d, "date"),
        description: text(d, "description"),
        coordinator: text(d, "coordinator") || null,
        attachments: d.getAll("attachments").map(String),
      });
    if (!parsed.success)
      return {
        error: "Check the activity fields. Your entries have been kept.",
      };
    const v = parsed.data;
    name = "save_project_activity";
    args = {
      p_id: v.id,
      p_project: c.project,
      p_version: c.version,
      p_space: v.space,
      p_category: v.category,
      p_date: v.date,
      p_description: v.description,
      p_coordinator: v.coordinator,
      p_attachments: v.attachments,
      p_reason: c.reason,
    };
  } else if (intent === "deadline") {
    const v = z
      .object({
        deadline: z.iso.date().nullable(),
        timezone: z.string().min(1).max(100),
      })
      .safeParse({
        deadline: text(d, "deadline") || null,
        timezone: text(d, "timezone"),
      });
    if (!v.success) return { error: "Check the deadline and timezone." };
    name = "revise_project_deadline";
    args = {
      p_project: c.project,
      p_version: c.version,
      p_deadline: v.data.deadline,
      p_timezone: v.data.timezone,
      p_reason: c.reason,
    };
  } else if (intent === "coordinator") {
    const v = z.string().trim().min(1).max(200).safeParse(text(d, "name"));
    if (!v.success) return { error: "Enter a Site Coordinator name." };
    name = "add_site_coordinator";
    args = { p_project: c.project, p_name: v.data, p_reason: c.reason };
  } else if (["Hold", "Resume", "Cancel", "Reopen"].includes(intent)) {
    name = "control_project";
    args = {
      p_project: c.project,
      p_version: c.version,
      p_action: intent,
      p_reason: c.reason,
    };
  } else return { error: "Invalid action." };
  const r = await client.rpc(name, args);
  if (r.error) {
    const known = [
      "PROJECT_CANCELLED",
      "PROJECT_ON_HOLD",
      "PROJECT_RESOLVED",
    ].find((k) => r.error!.message.includes(k));
    return {
      error: known
        ? "This project is cancelled, resolved or on hold. Reload to see its current state."
        : spaceError(r.error.message),
    };
  }
  revalidatePath("/dashboard", "layout");
  return { error: null, success: "Change saved with history." };
}
