"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/workspace-session";
import type { FormState } from "@/lib/phase1";
import {
  financialAmountPattern,
  paymentDataSchema,
  financeError,
} from "@/lib/finance";
export async function financeAction(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  if (process.env.ONE_ODC_FINANCE_ENABLED !== "true")
    return {
      error: "Financial Management is not configured in this environment.",
    };
  const get = (key: string) => String(data.get(key) ?? "");
  const common = z
    .object({
      project: z.uuid(),
      version: z.coerce.number().int().nonnegative(),
      reason: z.string().trim().max(2000),
    })
    .safeParse({
      project: get("project"),
      version: get("version"),
      reason: get("reason"),
    });
  if (!common.success)
    return { error: "Check the project, version and change reason." };
  const v = common.data,
    kind = get("kind"),
    intent = get("intent");
  const { client } = await requireRole(
    intent === "value" && kind === "Sale"
      ? ["bdm", "system_administrator"]
      : kind === "client" && intent === "save" && v.version === 0
        ? ["bdm", "lead_designer", "system_administrator"]
        : kind === "client"
          ? ["lead_designer", "system_administrator"]
          : ["lead_designer", "operations_admin", "system_administrator"],
  );
  let endpoint: string, args: Record<string, unknown>;
  if (intent === "value") {
    if (
      !["Sale", "Raw"].includes(kind) ||
      !financialAmountPattern.test(get("amount"))
    )
      return {
        error:
          "Enter an explicit nonnegative PHP amount with at most 2 decimals.",
      };
    endpoint = "set_financial_value";
    args = {
      p_project: v.project,
      p_kind: kind,
      p_amount: get("amount"),
      p_expected_version: v.version,
      p_reason: v.reason,
    };
  } else {
    if (
      !["save", "void"].includes(intent) ||
      !["client", "supplier"].includes(kind) ||
      !z.uuid().safeParse(get("id")).success
    )
      return { error: "Choose a valid payment." };
    const parsed = paymentDataSchema.safeParse({
      payment_date: get("payment_date"),
      amount: get("amount"),
      method: get("method"),
      reference: get("reference"),
      remarks: get("remarks"),
    });
    if (intent !== "void" && !parsed.success)
      return {
        error:
          "Check the payment date, PHP amount, method and references. Entries have been kept.",
      };
    endpoint = "mutate_payment";
    args = {
      p_id: get("id"),
      p_project: v.project,
      p_kind: kind,
      p_expected_version: v.version,
      p_intent: intent,
      p_data: intent === "void" ? {} : parsed.data,
      p_reason: v.reason,
    };
  }
  const r = await client.rpc(endpoint, args);
  if (r.error) return { error: financeError(r.error.message) };
  revalidatePath(`/dashboard/projects/${v.project}`);
  return {
    error: null,
    success:
      intent === "void"
        ? "Payment voided; history preserved."
        : "Financial record saved.",
  };
}
