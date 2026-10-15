"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/workspace-session";
import { quotationItemSchema, quotationError } from "@/lib/quotations";
import type { FormState } from "@/lib/phase1";
export async function mutateQuotation(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  if (process.env.ONE_ODC_QUOTATIONS_ENABLED !== "true")
    return { error: "Quotations are not configured in this environment." };
  const { client } = await requireRole([
    "designer",
    "lead_designer",
    "system_administrator",
  ]);
  const project = String(data.get("project") ?? "");
  if (!z.uuid().safeParse(project).success)
    return { error: "Invalid project." };
  if (data.get("intent") === "create") {
    const r = await client.rpc("create_quotation_draft", {
      p_project: project,
    });
    if (r.error) return { error: quotationError(r.error.message) };
    revalidatePath(`/dashboard/projects/${project}`);
    redirect(`/dashboard/projects/${project}?tab=quotation`);
  } else {
    let items: unknown;
    try {
      items = JSON.parse(String(data.get("items")));
    } catch {
      return { error: "Invalid item list." };
    }
    const parsed = z
      .object({
        draft: z.uuid(),
        space: z.uuid(),
        version: z.coerce.number().int().positive(),
        reason: z.string().trim().min(1).max(2000),
        items: z.array(quotationItemSchema).max(200),
      })
      .safeParse({
        draft: data.get("draft"),
        space: data.get("space"),
        version: data.get("version"),
        reason: data.get("reason"),
        items,
      });
    if (!parsed.success)
      return {
        error:
          "Check descriptions, quantities, prices and the change reason. Entries have been kept.",
      };
    const v = parsed.data;
    if (new Set(v.items.map((i) => i.id)).size !== v.items.length)
      return { error: "Item IDs must be unique." };
    const r = await client.rpc("save_quotation_space", {
      p_draft: v.draft,
      p_space: v.space,
      p_expected_version: v.version,
      p_items: v.items,
      p_reason: v.reason,
    });
    if (r.error) return { error: quotationError(r.error.message) };
  }
  revalidatePath(`/dashboard/projects/${project}`);
  return { error: null, success: "Quotation saved." };
}

export async function reviewQuotationAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  if (process.env.ONE_ODC_QUOTATIONS_ENABLED !== "true")
    return { error: "Quotations are not configured in this environment." };
  const parsed = z
    .object({
      project: z.uuid(),
      id: z.uuid(),
      version: z.coerce.number().int().positive(),
      intent: z.enum(["submit", "Approved", "Returned for Revision"]),
      remarks: z.string().trim().max(2000),
    })
    .safeParse(Object.fromEntries(data));
  if (!parsed.success)
    return { error: "Choose a valid quotation version and remarks." };
  const v = parsed.data;
  const { client } = await requireRole(
    v.intent === "submit"
      ? ["designer", "lead_designer", "system_administrator"]
      : ["lead_designer", "system_administrator"],
  );
  const result = await client.rpc(
    v.intent === "submit" ? "submit_quotation" : "review_quotation",
    {
      p_version: v.id,
      p_expected_version: v.version,
      p_remarks: v.remarks,
      ...(v.intent !== "submit" ? { p_decision: v.intent } : {}),
    },
  );
  if (result.error) return { error: quotationError(result.error.message) };
  revalidatePath(`/dashboard/projects/${v.project}`);
  return {
    error: null,
    success:
      v.intent === "submit"
        ? "Quotation submitted for review."
        : v.intent === "Approved"
          ? "Quotation approved."
          : "Quotation returned for revision.",
  };
}
