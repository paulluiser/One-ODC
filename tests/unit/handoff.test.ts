import { expect, it } from "vitest";
import { handoffError } from "../../src/lib/handoff";
it("explains prerequisite and optimistic-conflict errors without exposing backend details", () => {
  expect(handoffError("SALE_REQUIRED")).toContain("Record the agreed Sale");
  expect(handoffError("OPERATIONS_ADMIN_REQUIRED")).toContain(
    "active primary Operations Admin",
  );
  expect(handoffError("STALE_CLOSURE_CONTEXT")).toContain("Reload");
  expect(handoffError("HANDOFF_ALREADY_ACKNOWLEDGED")).toContain(
    "already been acknowledged",
  );
  expect(handoffError("internal SQL secret detail")).not.toContain("SQL");
});
