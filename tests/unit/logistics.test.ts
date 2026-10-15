import { expect, it } from "vitest";
import {
  supplierDataSchema,
  logisticsDataSchema,
  logisticsError,
} from "../../src/lib/logistics";
it("validates supplier contact bounds and stable tracking stages without financial fields", () => {
  expect(
    supplierDataSchema.safeParse({
      name: " ",
      brand: "",
      contact_person: "",
      contact_details: "",
      remarks: "",
      active: true,
    }).success,
  ).toBe(false);
  expect(
    logisticsDataSchema.safeParse({
      status: "Landed",
      brand: "Stosa",
      reference: "Order",
      remarks: "Tracking only",
    }).success,
  ).toBe(true);
  expect(
    logisticsDataSchema.safeParse({
      status: "Paid",
      brand: "",
      reference: "",
      remarks: "",
    }).success,
  ).toBe(false);
  expect(logisticsError("HANDOFF_REQUIRED")).toContain("acknowledged");
  expect(logisticsError("DUPLICATE_SUPPLIER")).toContain("already exists");
});
