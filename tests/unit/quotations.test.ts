import { expect, it } from "vitest";
import {
  formatPHP,
  formatCentavos,
  lineCentavos,
  quotationItemSchema,
} from "../../src/lib/quotations";
it("rounds exact positive decimal products to centavos before summing", () => {
  expect(lineCentavos("0.005", "1.00")).toBe(1n);
  expect(lineCentavos("0.004", "1.00")).toBe(0n);
  expect(lineCentavos("0.1", "0.2")).toBe(2n);
  expect(formatPHP("999999999998990000000.00")).toBe(
    "₱999,999,999,998,990,000,000.00",
  );
  expect(formatCentavos(31n)).toBe("₱0.31");
});
it("rejects negative, excess precision, exponent and invalid numeric strings", () => {
  for (const v of ["-1", "1e2", "0.0001", "", "NaN", " 1", "01"])
    expect(lineCentavos(v, "1")).toBeNull();
  expect(lineCentavos("1", "1.001")).toBeNull();
  expect(
    quotationItemSchema.safeParse({
      id: crypto.randomUUID(),
      description: " ",
      quantity: "1",
      unit_price: "0",
    }).success,
  ).toBe(false);
});

import {
  compareQuotations,
  formatDelta,
  type Quotation,
} from "../../src/lib/quotations";
const locked = (number: number): Quotation => ({
  id: crypto.randomUUID(),
  project_id: "project",
  number,
  state: "Approved",
  edit_version: 1,
  currency: "PHP",
  total: "0.10",
  spaces: [
    {
      id: "space",
      name: "Kitchen",
      cancelled: false,
      editable: false,
      subtotal: "0.10",
      items: [
        {
          id: crypto.randomUUID(),
          lineage_id: "stable",
          description: "Cabinet",
          quantity: "1.000",
          unit_price: "0.10",
          line_amount: "0.10",
          display_order: 1,
        },
      ],
    },
  ],
});
it("compares logical item identities and exact quantity/price/subtotal/total differences", () => {
  const before = locked(1),
    after = locked(2);
  after.total = "0.60";
  after.spaces[0].subtotal = "0.60";
  after.spaces[0].items[0] = {
    ...after.spaces[0].items[0],
    quantity: "3",
    unit_price: "0.20",
    line_amount: "0.60",
  };
  const diff = compareQuotations(before, after);
  expect(diff.added).toHaveLength(0);
  expect(diff.removed).toHaveLength(0);
  expect(diff.changed[0]).toMatchObject({
    quantity: true,
    price: true,
    description: false,
  });
  expect(diff.totalDelta).toBe(50n);
  expect(diff.spaces[0].delta).toBe(50n);
  expect(formatDelta(-1n)).toBe("−₱0.01");
});
it("reports removed/added items and historical Space names without conflating duplicate names", () => {
  const before = locked(1),
    after = locked(2);
  after.spaces[0].name = "Renamed";
  after.spaces[0].items[0].lineage_id = "new";
  const diff = compareQuotations(before, after);
  expect(diff.added).toHaveLength(1);
  expect(diff.removed).toHaveLength(1);
  expect(diff.spaces[0].before?.name).toBe("Kitchen");
  expect(diff.spaces[0].after?.name).toBe("Renamed");
});
it("ignores equivalent decimal representations and rejects comparisons with Drafts or other Projects", () => {
  const before = locked(1),
    after = locked(2);
  after.spaces[0].items[0].quantity = "1";
  expect(compareQuotations(before, after).changed).toEqual([]);
  after.state = "Draft";
  expect(() => compareQuotations(before, after)).toThrow("locked versions");
  after.state = "Approved";
  after.project_id = "other";
  expect(() => compareQuotations(before, after)).toThrow("same project");
});
