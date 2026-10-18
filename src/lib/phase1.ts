import { resourceLinksSchema } from "./resources";
import { z } from "zod";
import { CURRENT_MAX_FILE_BYTES } from "./storage/provider";
import { calendarDays, roles, type Role } from "./domain";
export const roleLabels: Record<Role, string> = {
  system_administrator: "System Administrator",
  lead_designer: "Lead Designer",
  designer: "Designer",
  bdm: "BDM",
  operations_admin: "Operations Admin",
};
export const statuses = [
  "Draft",
  "Submitted",
  "Returned for Clarification",
  "Accepted",
  "Rejected",
] as const;
export const attachmentSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    size: z.number().int().min(0).max(CURRENT_MAX_FILE_BYTES),
    mime_type: z.string().max(150),
    state: z.literal("not_uploaded"),
  })
  .strict();
const date = z.string().refine((v) => {
  try {
    calendarDays(v, v);
    return true;
  } catch {
    return false;
  }
}, "Use a valid date.");
export const leadPayloadSchema = z
  .object({
    assigned_lead_designer_id: z.uuid().nullable().optional(),
    project_name: z.string().trim().max(200),
    address: z.string().trim().max(2000),
    brand: z.enum(["SFY", "Stosa", "Both"]).nullable(),
    cabinetry_count: z.number().int().positive().max(2147483647).nullable(),
    notes: z.string().max(10000),
    resource_links: resourceLinksSchema.default([]),
    date_needed: date.nullable(),
    attachment_metadata: z.array(attachmentSchema).max(5),
  })
  .strict();
export const saveLeadSchema = z
  .object({
    id: z.uuid(),
    expected_version: z.number().int().min(0),
    submit: z.boolean(),
    duplicate_reason: z.string().trim().max(2000),
    payload: leadPayloadSchema,
  })
  .superRefine((v, ctx) => {
    if (v.submit) {
      if (!v.payload.assigned_lead_designer_id)
        ctx.addIssue({
          code: "custom",
          path: ["payload", "assigned_lead_designer_id"],
          message: "Choose the Lead Designer who will review this request.",
        });
      for (const key of ["project_name", "address"] as const)
        if (!v.payload[key])
          ctx.addIssue({
            code: "custom",
            path: ["payload", key],
            message: "This field is required.",
          });
      if (v.payload.cabinetry_count === null)
        ctx.addIssue({
          code: "custom",
          path: ["payload", "cabinetry_count"],
          message: "Enter a positive whole number.",
        });
    }
  });
export const assignmentSchema = z.object({
  primary: z.uuid(),
  support: z.array(z.uuid()).max(50),
  ops: z.array(z.uuid()).max(50),
  lead_designer: z.uuid().nullable(),
});
export const reviewSchema = z
  .object({
    id: z.uuid(),
    expected_version: z.number().int().min(0),
    decision: z.enum(["Accepted", "Returned for Clarification", "Rejected"]),
    remarks: z.string().trim().max(4000),
    assignments: assignmentSchema.partial(),
  })
  .superRefine((v, ctx) => {
    if (v.decision !== "Accepted" && !v.remarks)
      ctx.addIssue({
        code: "custom",
        path: ["remarks"],
        message: "Explain why the lead is being returned or rejected.",
      });
    if (v.decision === "Accepted" && !v.assignments.primary)
      ctx.addIssue({
        code: "custom",
        path: ["primary"],
        message: "Choose a primary Designer.",
      });
  });
export const profileSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  role: z.enum(roles),
  active: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type LeadPayload = z.infer<typeof leadPayloadSchema>;
export const leadSchema = leadPayloadSchema.extend({
  id: z.uuid(),
  reference: z.string(),
  bdm_id: z.uuid(),
  status: z.enum(statuses),
  version: z.number(),
  submission_count: z.number(),
  first_submitted_at: z.string().nullable(),
  last_submitted_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Lead = z.infer<typeof leadSchema>;
export type Person = { id: string; display_name: string; role: Role };
export type Project = {
  id: string;
  reference: string;
  name: string;
  lead_designer_id: string;
  commercial_status: string;
  awaiting_handoff?: boolean;
  expected_handoff: string | null;
  created_at: string;
};
export type Member = {
  user_id: string;
  display_name: string;
  membership_role: Role;
  is_primary: boolean;
};
export type Submission = {
  id: string;
  number: number;
  snapshot: Lead & {
    duplicate_override_reason?: string;
    uploaded_attachments?: {
      version_id: string;
      attachment_id: string;
      original_name: string;
      actual_size: number;
    }[];
  };
  submitted_at: string;
};
export type Review = {
  id: string;
  decision: string;
  remarks: string;
  reviewed_at: string;
  reviewer_id: string;
};
export type Notification = {
  type?: string | null;
  comment_id?: string | null;
  space_id?: string | null;
  id: string;
  message: string;
  lead_id: string | null;
  project_id: string | null;
  read_at: string | null;
  created_at: string;
};
export type FormState = {
  error: string | null;
  fields?: Record<string, string>;
  duplicates?: { id: string; reference: string; project_name: string }[];
  success?: string;
  redirectTo?: string;
};
export const emptyLead: LeadPayload = {
  assigned_lead_designer_id: null,
  project_name: "",
  address: "",
  brand: null,
  cabinetry_count: null,
  notes: "",
  resource_links: [],
  date_needed: null,
  attachment_metadata: [],
};
export function maySubmit(role: Role) {
  return role === "bdm";
}
export function mayReview(role: Role) {
  return role === "lead_designer" || role === "system_administrator";
}
export function manilaDate(value: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function leadAge(
  lead: Pick<Lead, "first_submitted_at" | "resolved_at">,
  now = new Date(),
): number | null {
  return lead.first_submitted_at
    ? calendarDays(
        manilaDate(lead.first_submitted_at),
        manilaDate(lead.resolved_at ?? now),
      )
    : null;
}
export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function safeNext(value: string | null) {
  return value &&
    /^\/dashboard(?:\/[^\s\\]*)?$/.test(value) &&
    !value.includes("//")
    ? value
    : "/dashboard";
}
export function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((i) => [i.path.at(-1)?.toString() ?? "form", i.message]),
  );
}
export function workflowError(message: string): string {
  const errors: Record<string, string> = {
    LEAD_LINKS_ONLY:
      "Use Files and Resources links for quotation requests. Direct uploads are disabled.",
    UPLOADS_PENDING:
      "Complete or archive pending attachments before submitting this lead.",
    STALE_VERSION:
      "This record changed since you opened it. Reload before trying again.",
    ACCESS_DENIED: "You do not have permission to perform this action.",
    INVALID_LEAD_STATE:
      "This lead is no longer editable or awaiting review. Reload to see its current state.",
    REMARKS_REQUIRED:
      "Remarks are required when returning or rejecting a lead.",
    DUPLICATE_REASON_REQUIRED:
      "A possible duplicate exists. Add a reason to continue.",
    REASON_REQUIRED: "Enter a reason for this assignment change.",
    INVALID_PROJECT_STATE:
      "Assignments cannot change on a cancelled or operationally completed project.",
    INVALID_ASSIGNEE:
      "An assigned person is inactive or has an incompatible role.",
    INVALID_BDM: "The primary BDM is inactive or no longer has the BDM role.",
    INVALID_LEAD_DESIGNER: "Choose an active Lead Designer.",
    SELF_ACCESS_CHANGE_DENIED:
      "You cannot deactivate or demote your own administrator account.",
    OPERATIONS_ADMIN_REQUIRED:
      "A commercially Closed project must retain an Operations Admin.",
  };
  return (
    Object.entries(errors).find(([key]) => message.includes(key))?.[1] ??
    "The change could not be saved. Please try again or contact your System Administrator."
  );
}
