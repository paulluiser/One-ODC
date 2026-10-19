import { describe, expect, it } from "vitest";
import {
  emptyLead,
  saveLeadSchema,
  reviewSchema,
  leadAge,
  manilaDate,
  safeNext,
  attachmentSchema,
} from "../../src/lib/phase1";
const id = "10000000-0000-4000-8000-000000000001";
describe("Phase 1 validation", () => {
  it("permits incomplete drafts but requires name, address and whole cabinetry count for submission", () => {
    const draft = {
      id,
      expected_version: 0,
      duplicate_reason: "",
      submit: false,
      payload: emptyLead,
    };
    expect(saveLeadSchema.safeParse(draft).success).toBe(true);
    expect(saveLeadSchema.safeParse({ ...draft, submit: true }).success).toBe(
      false,
    );
    for (const cabinetry_count of [0, -1, 1.5])
      expect(
        saveLeadSchema.safeParse({
          ...draft,
          payload: { ...emptyLead, cabinetry_count },
        }).success,
      ).toBe(false);
    expect(
      saveLeadSchema.safeParse({
        ...draft,
        submit: true,
        payload: {
          ...emptyLead,
          assigned_lead_designer_id: id,
          project_name: "Home",
          address: "Manila",
          cabinetry_count: 2,
        },
      }).success,
    ).toBe(true);
  });
  it("rejects invalid dates and unknown payload fields", () => {
    const draft = {
      id,
      expected_version: 0,
      duplicate_reason: "",
      submit: false,
      payload: { ...emptyLead, date_needed: "2026-02-30" },
    };
    expect(saveLeadSchema.safeParse(draft).success).toBe(false);
    expect(
      saveLeadSchema.safeParse({
        ...draft,
        payload: { ...emptyLead, unsupported_owner: id },
      }).success,
    ).toBe(false);
  });
  it("requires remarks for return/reject and a primary Designer for acceptance", () => {
    const review = {
      id,
      expected_version: 1,
      decision: "Rejected",
      remarks: "  ",
      assignments: {},
    };
    expect(reviewSchema.safeParse(review).success).toBe(false);
    expect(
      reviewSchema.safeParse({ ...review, remarks: "Incomplete brief" })
        .success,
    ).toBe(true);
    expect(
      reviewSchema.safeParse({ ...review, decision: "Accepted" }).success,
    ).toBe(false);
    expect(
      reviewSchema.safeParse({
        ...review,
        decision: "Accepted",
        assignments: { primary: id },
      }).success,
    ).toBe(true);
  });
  it("only accepts bounded metadata explicitly marked not uploaded", () => {
    const file = {
      name: "plan.pdf",
      size: 52428800,
      mime_type: "application/pdf",
      state: "not_uploaded",
    };
    expect(attachmentSchema.safeParse(file).success).toBe(true);
    expect(
      attachmentSchema.safeParse({ ...file, size: 52428801 }).success,
    ).toBe(false);
    expect(
      attachmentSchema.safeParse({ ...file, state: "uploaded" }).success,
    ).toBe(false);
  });
  it("counts Manila calendar boundaries and freezes resolved age", () => {
    expect(manilaDate("2026-10-12T16:01:00Z")).toBe("2026-10-13");
    expect(
      leadAge(
        { first_submitted_at: "2026-10-12T15:59:00Z", resolved_at: null },
        new Date("2026-10-12T16:01:00Z"),
      ),
    ).toBe(1);
    expect(
      leadAge(
        {
          first_submitted_at: "2026-10-12T15:59:00Z",
          resolved_at: "2026-10-12T16:01:00Z",
        },
        new Date("2026-11-01"),
      ),
    ).toBe(1);
    expect(leadAge({ first_submitted_at: null, resolved_at: null })).toBeNull();
  });
  it("prevents external and malformed post-login redirects", () => {
    for (const value of [
      "https://example.com",
      "//example.com",
      "/dashboard//evil",
      "/dashboard\\evil",
      "/auth/set-password",
      null,
    ])
      expect(safeNext(value)).toBe("/dashboard");
    expect(safeNext("/dashboard/leads")).toBe("/dashboard/leads");
  });
});

it("requires a Lead Designer for submission, including valid otherwise-complete requests", () => {
  const request = {
    id,
    expected_version: 0,
    duplicate_reason: "",
    submit: true,
    payload: {
      ...emptyLead,
      project_name: "Home",
      address: "Manila",
      cabinetry_count: 2,
    },
  };
  expect(saveLeadSchema.safeParse(request).success).toBe(false);
  expect(
    saveLeadSchema.safeParse({
      ...request,
      payload: { ...request.payload, assigned_lead_designer_id: id },
    }).success,
  ).toBe(true);
});
