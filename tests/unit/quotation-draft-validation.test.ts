import { expect, it } from "vitest";
import { quotationDraftErrors } from "../../src/lib/quotation-draft-validation";
import type { QuotationItem } from "../../src/lib/quotations";
const item = (): QuotationItem => ({
  id: crypto.randomUUID(),
  description: "Cabinet",
  quantity: "0.005",
  unit_price: "1.00",
});
it("accepts exact decimal strings and intentional empty lists while requiring an audit reason", () => {
  expect(quotationDraftErrors([item()], "Design scope")).toEqual({});
  expect(quotationDraftErrors([], "Remove existing items")).toEqual({});
  expect(quotationDraftErrors([], " ")).toHaveProperty("reason");
});
it("identifies the exact invalid item fields without changing user-entered text", () => {
  const invalid = {
    ...item(),
    quantity: "1.0001",
    unit_price: "1.001",
    description: " ",
  };
  const errors = quotationDraftErrors([invalid], "Edit scope");
  expect(Object.keys(errors)).toEqual([
    `${invalid.id}-description`,
    `${invalid.id}-quantity`,
    `${invalid.id}-unit_price`,
  ]);
  expect(invalid.quantity).toBe("1.0001");
});
it("rejects duplicate IDs and oversized lists before a Space draft is submitted", () => {
  const a = item();
  expect(quotationDraftErrors([a, a], "Edit scope")).toHaveProperty("items");
  expect(
    quotationDraftErrors(Array.from({ length: 201 }, item), "Edit scope"),
  ).toHaveProperty("items");
});
