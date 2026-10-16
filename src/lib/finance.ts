import { z } from "zod";
import { formatPHP, moneyCentavos, formatDelta } from "./quotations";
export const financialAmountPattern = /^(0|[1-9][0-9]{0,25})(\.[0-9]{1,2})?$/;
export const paymentDataSchema = z.object({
  payment_date: z.iso.date(),
  amount: z.string().regex(financialAmountPattern),
  method: z.string().trim().min(1).max(100),
  reference: z.string().trim().max(200),
  remarks: z.string().trim().max(2000),
});
export type PaymentData = z.infer<typeof paymentDataSchema>;
export type FinancialValue = {
  amount: string | null;
  version: number;
  editable: boolean;
  history: {
    id: string;
    previous_amount: string | null;
    new_amount: string;
    version: number;
    actor_id: string;
    reason: string;
    occurred_at: string;
  }[];
};
export type Payment = PaymentData & {
  id: string;
  kind: "client" | "supplier";
  version: number;
  voided: boolean;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  history: {
    id: string;
    action: string;
    actor_id: string;
    reason: string;
    occurred_at: string;
    previous_value: unknown;
    new_value: unknown;
  }[];
};
export type PaymentGroup = {
  total: string;
  outstanding?: string | null;
  records: Payment[];
};
export type Financials = {
  project_id: string;
  currency: "PHP";
  today: string;
  cancelled: boolean;
  can_manage_payments: boolean;
  sale?: FinancialValue;
  raw?: FinancialValue;
  approved_quotation?: { id: string; number: number; total: string } | null;
  quotation_vs_sale?: string | null;
  sale_minus_raw?: string | null;
  client_payments: PaymentGroup;
  supplier_payments: PaymentGroup;
};
export function financialAmount(value: string | null | undefined): string {
  if (value === null || value === undefined) return "Not available";
  return value.startsWith("-")
    ? formatDelta(-moneyCentavos(value.slice(1)))
    : formatPHP(value);
}
export function financeError(message: string): string {
  if (message.includes("PROJECT_LOST"))
    return "This project is Lost. All project records are read-only.";
  if (message.includes("VERSION_CONFLICT"))
    return "This record changed elsewhere. Reload before retrying; your entries have been kept.";
  if (message.includes("REASON_REQUIRED"))
    return "A reason is required for this adjustment, correction or void.";
  if (message.includes("ACCESS_DENIED"))
    return "You do not have permission to change this financial record.";
  if (message.includes("PROJECT_CANCELLED"))
    return "Cancelled projects cannot receive new financial records. Historical payment corrections remain available.";
  if (
    message.includes("PAYMENT_VOIDED") ||
    message.includes("HISTORY_IMMUTABLE")
  )
    return "This record is locked. Voided payments remain preserved and cannot be edited.";
  if (message.includes("INVALID_AMOUNT") || message.includes("INVALID_PAYMENT"))
    return "Check the amount (nonnegative PHP, up to 2 decimals), actual payment date and method.";
  return "The financial change could not be saved. Your entries are kept; please retry.";
}
