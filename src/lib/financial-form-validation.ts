import { financialAmountPattern, paymentDataSchema } from "./finance";
export type FinancialDraft = {
  amount: string;
  payment_date: string;
  method: string;
  reference: string;
  remarks: string;
  reason: string;
};
export function financialFormErrors(
  draft: FinancialDraft,
  intent: "value" | "save" | "void",
  today: string,
  reasonRequired: boolean,
) {
  const errors: Record<string, string> = {};
  if (intent !== "void" && !financialAmountPattern.test(draft.amount))
    errors.amount =
      "Enter a nonnegative PHP amount with up to two decimal places.";
  if (intent === "save") {
    const parsed = paymentDataSchema.safeParse(draft);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        errors[String(issue.path[0])] ??=
          issue.path[0] === "payment_date"
            ? "Enter a valid payment date."
            : issue.path[0] === "method"
              ? "Enter a payment method (up to 100 characters)."
              : "Check this field.";
    if (draft.payment_date > today)
      errors.payment_date = "Payment date cannot be in the future.";
  }
  if (reasonRequired && !draft.reason.trim())
    errors.reason = "Provide a reason for this change.";
  if (draft.reason.trim().length > 2000)
    errors.reason = "Use up to 2,000 characters.";
  return errors;
}
