import { expect, it } from "vitest";
import {
  allowedLogisticsStatuses,
  logisticsReasonRequired,
  logisticsOverrideRequired,
} from "../../src/lib/logistics-form-validation";
import { operationDetail } from "../../src/lib/operations-workspace";
import type { Logistics } from "../../src/lib/logistics";
const record = { status: "In Transit", held_status: null } as Logistics;
it("allows forward skips but requires a reason, matching existing workflow", () => {
  expect(allowedLogisticsStatuses(record, false, false, false, true)).toContain(
    "Delivered",
  );
  expect(logisticsReasonRequired(record, "Delivered", false, false, true)).toBe(
    true,
  );
  expect(logisticsReasonRequired(record, "Landed", false, false, true)).toBe(
    false,
  );
});
it("hides backward corrections until a manager explicitly enables override", () => {
  expect(
    allowedLogisticsStatuses(record, false, false, true, true),
  ).not.toContain("RFP");
  expect(
    allowedLogisticsStatuses(record, false, true, false, true),
  ).not.toContain("RFP");
  expect(allowedLogisticsStatuses(record, false, true, true, true)).toContain(
    "RFP",
  );
  expect(logisticsOverrideRequired(record, "RFP", true)).toBe(true);
});
it("preserves held metadata edits, restoration rules and terminal restrictions", () => {
  expect(allowedLogisticsStatuses(record, true, true, true, true)).toEqual([
    "In Transit",
  ]);
  const held = {
    ...record,
    status: "On Hold",
    held_status: "In Transit",
  } as Logistics;
  expect(allowedLogisticsStatuses(held, false, false, false, true)).toEqual([
    "In Transit",
    "On Hold",
    "Cancelled",
  ]);
  const delivered = { ...record, status: "Delivered" } as Logistics;
  expect(
    allowedLogisticsStatuses(delivered, false, false, false, true),
  ).toEqual(["Delivered"]);
  expect(
    allowedLogisticsStatuses(delivered, false, true, true, true),
  ).not.toContain("On Hold");
});
it("requires reasons for creation, metadata corrections, handoff exceptions and admin actions", () => {
  expect(allowedLogisticsStatuses(undefined, false, true, false, true)).toEqual(
    ["RFP"],
  );
  expect(logisticsReasonRequired(undefined, "RFP", false, false, true)).toBe(
    true,
  );
  expect(
    logisticsReasonRequired(record, "In Transit", false, false, true),
  ).toBe(true);
  expect(logisticsReasonRequired(record, "Landed", true, false, true)).toBe(
    true,
  );
  expect(logisticsReasonRequired(record, "Landed", false, true, true)).toBe(
    true,
  );
  expect(logisticsOverrideRequired(record, "Landed", false)).toBe(true);
});
it("resolves conflicting deep links to one active sheet deterministically", () => {
  const both = { installation_detail: "space", logistics_detail: "logistics" };
  expect(operationDetail(both, "installation")).toBe("");
  expect(operationDetail(both, "logistics")).toBe("logistics");
  expect(
    operationDetail({ ...both, section: "installation" }, "installation"),
  ).toBe("space");
  expect(
    operationDetail({ installation_detail: "space" }, "installation"),
  ).toBe("space");
});
