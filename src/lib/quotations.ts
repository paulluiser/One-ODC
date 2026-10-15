import { z } from "zod";
export const quantityPattern = /^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$/;
export const pricePattern = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/;
export const quotationItemSchema = z.object({
  id: z.uuid(),
  description: z.string().trim().min(1).max(2000),
  quantity: z.string().regex(quantityPattern),
  unit_price: z.string().regex(pricePattern),
});
export type QuotationItem = z.infer<typeof quotationItemSchema>;
export type QuotationSpace = {
  id: string;
  name: string;
  cancelled: boolean;
  editable: boolean;
  subtotal: string;
  items: (QuotationItem & {
    line_amount: string;
    display_order: number;
    lineage_id?: string;
  })[];
};
export type Quotation = {
  id: string;
  project_id: string;
  number: number;
  state: string;
  edit_version: number;
  currency: "PHP";
  total: string;
  spaces: QuotationSpace[];
  created_by?: string;
  created_at?: string;
  submitted_by?: string | null;
  submitted_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_remarks?: string | null;
  source_version_id?: string | null;
  can_submit?: boolean;
  can_review?: boolean;
  can_create_draft?: boolean;
  history?: QuotationReviewEvent[];
};
function scaled(value: string, digits: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0"))
  );
}
export function lineCentavos(quantity: string, price: string): bigint | null {
  if (!quantityPattern.test(quantity) || !pricePattern.test(price)) return null;
  return (scaled(quantity, 3) * scaled(price, 2) + 500n) / 1000n;
}
export function formatCentavos(value: bigint): string {
  const whole = (value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₱${whole}.${(value % 100n).toString().padStart(2, "0")}`;
}
export function formatPHP(value: string): string {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Invalid currency amount");
  return formatCentavos(scaled(value, 2));
}
export function quotationError(message: string): string {
  if (message.includes("QUOTATION_PENDING_REVIEW"))
    return "A quotation is pending review. Wait for the review decision before creating another draft.";
  if (
    message.includes("REMARKS_REQUIRED") ||
    message.includes("ADMIN_REASON_REQUIRED")
  )
    return "Provide remarks explaining the return or administrative action.";
  if (message.includes("QUOTATION_NOT_SUBMITTED"))
    return "Only a quotation submitted for review can be reviewed.";
  if (message.includes("VERSION_CONFLICT"))
    return "This quotation changed elsewhere. Reload the quotation before saving or reviewing; your entries are still here.";
  if (message.includes("PROJECT_CANCELLED"))
    return "Cancelled projects and spaces cannot be edited.";
  if (message.includes("ACCESS_DENIED"))
    return "You do not have permission to edit this quotation space.";
  if (
    message.includes("HISTORY_IMMUTABLE") ||
    message.includes("DRAFT_UNAVAILABLE")
  )
    return "This version is locked. Only an existing draft can be edited.";
  if (message.includes("INVALID_ITEMS"))
    return "Check item descriptions, unique IDs, quantities (up to 3 decimals) and prices (up to 2 decimals).";
  return "The quotation could not be saved. Your entries are kept; please retry.";
}

export type QuotationVersionSummary = Pick<
  Quotation,
  "id" | "number" | "state"
> & {
  created_by: string;
  created_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};
export type QuotationReviewEvent = {
  id: string;
  actor_id: string;
  action: string;
  remarks: string;
  occurred_at: string;
};
export function moneyCentavos(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Invalid currency amount");
  return scaled(value, 2);
}
export function formatDelta(value: bigint): string {
  return `${value < 0n ? "−" : value > 0n ? "+" : ""}${formatCentavos(value < 0n ? -value : value)}`;
}
export function compareQuotations(before: Quotation, after: Quotation) {
  if (
    before.project_id !== after.project_id ||
    before.currency !== after.currency ||
    before.state === "Draft" ||
    after.state === "Draft"
  )
    throw new Error("Compare locked versions of the same project only.");
  type Item = QuotationSpace["items"][number] & {
    space_id: string;
    space_name: string;
  };
  const index = (quote: Quotation) =>
    new Map(
      quote.spaces.flatMap((s) =>
        s.items.map(
          (i) =>
            [
              `${s.id}:${i.lineage_id ?? i.id}`,
              { ...i, space_id: s.id, space_name: s.name },
            ] as const,
        ),
      ),
    );
  const old = index(before),
    next = index(after);
  const added: Item[] = [],
    removed: Item[] = [];
  const changed: {
    before: Item;
    after: Item;
    quantity: boolean;
    price: boolean;
    description: boolean;
  }[] = [];
  for (const [key, item] of next) {
    const prior = old.get(key);
    if (!prior) {
      added.push(item);
      continue;
    }
    const quantity = scaled(prior.quantity, 3) !== scaled(item.quantity, 3),
      price =
        moneyCentavos(prior.unit_price) !== moneyCentavos(item.unit_price),
      description = prior.description !== item.description;
    if (quantity || price || description)
      changed.push({
        before: prior,
        after: item,
        quantity,
        price,
        description,
      });
  }
  for (const [key, item] of old) if (!next.has(key)) removed.push(item);
  const a = new Map(before.spaces.map((s) => [s.id, s])),
    b = new Map(after.spaces.map((s) => [s.id, s]));
  const spaces = [...new Set([...a.keys(), ...b.keys()])]
    .map((id) => ({
      id,
      before: a.get(id),
      after: b.get(id),
      delta:
        moneyCentavos(b.get(id)?.subtotal ?? "0") -
        moneyCentavos(a.get(id)?.subtotal ?? "0"),
    }))
    .filter(
      (s) =>
        s.delta !== 0n ||
        !s.before ||
        !s.after ||
        s.before.name !== s.after.name,
    );
  return {
    added,
    removed,
    changed,
    spaces,
    totalDelta: moneyCentavos(after.total) - moneyCentavos(before.total),
  };
}
