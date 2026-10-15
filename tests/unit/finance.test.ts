import { expect, it } from "vitest";
import {
  financialAmount,
  financialAmountPattern,
  paymentDataSchema,
} from "../../src/lib/finance";
it("formats exact signed balances and distinguishes missing amounts from zero", () => {
  expect(financialAmount(null)).toBe("Not available");
  expect(financialAmount("0.00")).toBe("₱0.00");
  expect(financialAmount("-0.10")).toBe("−₱0.10");
  expect(financialAmount("99999999999999999999999999.99")).toBe(
    "₱99,999,999,999,999,999,999,999,999.99",
  );
});
it("validates monetary precision and actual payment fields without float coercion", () => {
  for (const s of ["-1", "1e2", "0.001", "NaN", ""])
    expect(financialAmountPattern.test(s)).toBe(false);
  expect(
    paymentDataSchema.safeParse({
      payment_date: "2026-02-30",
      amount: "1",
      method: "Cash",
      reference: "",
      remarks: "",
    }).success,
  ).toBe(false);
});
