import { expect, it } from "vitest";
import {
  financialFormErrors,
  type FinancialDraft,
} from "../../src/lib/financial-form-validation";
const draft: FinancialDraft = {
  amount: "0.00",
  payment_date: "2026-10-19",
  method: "Bank transfer",
  reference: "",
  remarks: "",
  reason: "",
};
it("retains authoritative zero/precision rules without imposing an unsupported balance cap", () => {
  expect(financialFormErrors(draft, "save", "2026-10-19", false)).toEqual({});
  expect(
    financialFormErrors(
      { ...draft, amount: "99999999999999999999999999.99" },
      "save",
      "2026-10-19",
      false,
    ),
  ).toEqual({});
  for (const amount of ["-1", "1e3", "1.001", ""])
    expect(
      financialFormErrors({ ...draft, amount }, "value", "2026-10-19", false),
    ).toHaveProperty("amount");
});
it("validates actual dates and required reasons while allowing legacy free-text methods", () => {
  expect(
    financialFormErrors(
      { ...draft, payment_date: "2026-02-30" },
      "save",
      "2026-10-19",
      false,
    ),
  ).toHaveProperty("payment_date");
  expect(
    financialFormErrors(
      { ...draft, payment_date: "2026-10-20" },
      "save",
      "2026-10-19",
      false,
    ),
  ).toHaveProperty("payment_date");
  expect(financialFormErrors(draft, "void", "2026-10-19", true)).toHaveProperty(
    "reason",
  );
  expect(
    financialFormErrors(
      { ...draft, reason: "Duplicate receipt" },
      "void",
      "2026-10-19",
      true,
    ),
  ).toEqual({});
});
