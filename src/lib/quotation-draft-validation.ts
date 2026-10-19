import { quotationItemSchema, type QuotationItem } from "./quotations";
export function quotationDraftErrors(items: QuotationItem[], reason: string) {
  const errors: Record<string, string> = {};
  if (
    items.length > 200 ||
    new Set(items.map((i) => i.id)).size !== items.length
  )
    errors.items = "Use up to 200 distinct items in this Space.";
  for (const item of items) {
    const result = quotationItemSchema.safeParse(item);
    if (!result.success)
      for (const issue of result.error.issues) {
        const field = String(issue.path[0]);
        errors[`${item.id}-${field}`] =
          field === "description"
            ? "Enter a description with up to 2,000 characters."
            : field === "quantity"
              ? "Use a non-negative quantity with up to 3 decimal places."
              : "Use a non-negative PHP price with up to 2 decimal places.";
      }
  }
  if (!reason.trim() || reason.trim().length > 2000)
    errors.reason = "Enter a change reason with up to 2,000 characters.";
  return errors;
}
