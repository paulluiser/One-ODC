import { expect, it } from "vitest";
import { installationReasonRequired } from "../../src/lib/installation-form-validation";
const normal = {
  previousStatus: "Scheduled",
  status: "In Progress",
  previousDate: "2026-11-01",
  date: "2026-11-01",
  administrative: false,
  override: false,
  handoffAcknowledged: true,
};
it("preserves ordinary progression without demanding an optional reason", () =>
  expect(installationReasonRequired(normal)).toBe(false));
it.each([
  { date: "2026-11-02" },
  { status: "Not Applicable" },
  { status: "On Hold" },
  { administrative: true },
  { override: true },
  { handoffAcknowledged: false },
  { previousStatus: undefined },
  { previousStatus: "Completed" },
])("requires documented reasons for existing exceptions: %j", (change) =>
  expect(installationReasonRequired({ ...normal, ...change })).toBe(true),
);
