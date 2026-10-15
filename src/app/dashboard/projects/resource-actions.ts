"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/workspace-session";
import { resourceLinksSchema } from "@/lib/resources";
import { workflowError, type FormState } from "@/lib/phase1";
export async function saveProjectResources(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  if (process.env.ONE_ODC_RESOURCES_ENABLED !== "true")
    return { error: "Resources are not enabled." };
  const { client } = await requireRole([
    "bdm",
    "lead_designer",
    "system_administrator",
  ]);
  let links: unknown;
  try {
    links = JSON.parse(String(data.get("resource_links") ?? "[]"));
  } catch {
    return { error: "Check the resource links." };
  }
  const input = z
    .object({
      project: z.uuid(),
      version: z.coerce.number().int().positive(),
      notes: z.string().max(10000),
      links: resourceLinksSchema,
      reason: z.string().trim().min(1).max(2000),
    })
    .safeParse({
      project: data.get("project"),
      version: data.get("version"),
      notes: data.get("notes"),
      links,
      reason: data.get("reason"),
    });
  if (!input.success)
    return {
      error:
        "Check Notes, HTTPS links and the required change reason. Your entries are kept.",
    };
  const v = input.data;
  const r = await client.rpc("update_project_resources", {
    p_project: v.project,
    p_version: v.version,
    p_notes: v.notes,
    p_links: v.links,
    p_reason: v.reason,
  });
  if (r.error) return { error: workflowError(r.error.message) };
  revalidatePath(`/dashboard/projects/${v.project}`);
  return {
    error: null,
    success: "Notes and resources saved with audit history.",
  };
}
