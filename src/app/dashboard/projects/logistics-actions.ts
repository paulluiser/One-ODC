"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/workspace-session";
import {
  supplierDataSchema,
  logisticsDataSchema,
  logisticsError,
} from "@/lib/logistics";
import type { FormState } from "@/lib/phase1";
export async function logisticsAction(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  if (process.env.ONE_ODC_LOGISTICS_ENABLED !== "true")
    return { error: "Supplier & Logistics is not enabled." };
  const { client } = await requireRole([
    "operations_admin",
    "lead_designer",
    "system_administrator",
  ]);
  const get = (key: string) => String(data.get(key) ?? "");
  const common = z
    .object({
      id: z.uuid(),
      version: z.coerce.number().int().nonnegative(),
      reason: z.string().trim().max(2000),
      confirm: z.literal("yes"),
    })
    .safeParse({
      id: get("id"),
      version: get("version"),
      reason: get("reason"),
      confirm: get("confirm"),
    });
  if (!common.success)
    return { error: "Check the record and confirm the change." };
  let args: Record<string, unknown>, endpoint: string;
  const supplier = get("intent") === "supplier";
  if (supplier) {
    const parsed = supplierDataSchema.safeParse({
      name: get("name"),
      brand: get("brand"),
      contact_person: get("contact_person"),
      contact_details: get("contact_details"),
      remarks: get("remarks"),
      active: data.has("active"),
    });
    if (!parsed.success || !common.data.reason)
      return { error: "Check supplier fields and the required change reason." };
    endpoint = "save_supplier";
    args = {
      p_id: common.data.id,
      p_version: common.data.version,
      p_data: parsed.data,
      p_reason: common.data.reason,
    };
  } else {
    const parsed = logisticsDataSchema.safeParse({
      status: get("status"),
      brand: get("brand"),
      reference: get("reference"),
      remarks: get("remarks"),
    });
    if (
      !parsed.success ||
      !z.uuid().safeParse(get("project")).success ||
      !z.uuid().safeParse(get("supplier")).success
    )
      return { error: "Select the supplier and check the logistics fields." };
    endpoint = "save_logistics";
    args = {
      p_id: common.data.id,
      p_project: get("project"),
      p_version: common.data.version,
      p_supplier: get("supplier"),
      p_data: parsed.data,
      p_reason: common.data.reason,
      p_override: data.has("override"),
    };
  }
  const r = await client.rpc(endpoint, args);
  if (r.error) return { error: logisticsError(r.error.message) };
  revalidatePath("/dashboard/suppliers");
  if (!supplier) revalidatePath(`/dashboard/projects/${get("project")}`);
  return {
    error: null,
    success: supplier
      ? "Supplier saved with audit history."
      : "Logistics saved with immutable history. Financial records remain independent.",
  };
}
