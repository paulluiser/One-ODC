"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { roles } from "@/lib/domain";
import { requireRole, requireWorkspace } from "@/lib/workspace-session";
import {
  saveLeadSchema,
  reviewSchema,
  assignmentSchema,
  fieldErrors,
  workflowError,
  type FormState,
} from "@/lib/phase1";
import { createAdminClient } from "@/lib/supabase/admin";
const value = (data: FormData, key: string) => String(data.get(key) ?? "");
const nullable = (s: string) => s || null;
function list(data: FormData, key: string) {
  return data.getAll(key).map(String);
}
export async function saveLead(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { client, profile } = await requireRole([
    "bdm",
    "system_administrator",
  ]);
  let attachments: unknown;
  try {
    attachments = JSON.parse(value(data, "attachment_metadata") || "[]");
  } catch {
    return { error: "Attachment metadata is invalid." };
  }
  const count = value(data, "cabinetry_count");
  const parsed = saveLeadSchema.safeParse({
    id: value(data, "id"),
    expected_version: Number(value(data, "expected_version")),
    submit: value(data, "intent") === "submit",
    duplicate_reason: value(data, "duplicate_reason"),
    payload: {
      ...(profile.role === "system_administrator"
        ? { bdm_id: value(data, "bdm_id") }
        : {}),
      assigned_lead_designer_id: nullable(
        value(data, "assigned_lead_designer_id"),
      ),
      project_name: value(data, "project_name"),
      address: value(data, "address"),
      brand: nullable(value(data, "brand")),
      supplier_id: nullable(value(data, "supplier_id")),
      cabinetry_count: count === "" ? null : Number(count),
      notes: value(data, "notes"),
      resource_links: (() => {
        try {
          return JSON.parse(value(data, "resource_links") || "[]");
        } catch {
          return null;
        }
      })(),
      date_needed: nullable(value(data, "date_needed")),
      attachment_metadata: attachments,
    },
  });
  if (!parsed.success)
    return {
      error: "Check the highlighted fields. Your entries have been kept.",
      fields: {
        ...fieldErrors(parsed.error),
        ...(parsed.error.issues.some((issue) =>
          issue.path.includes("resource_links"),
        )
          ? {
              resource_links:
                "Enter valid HTTPS links without credentials, up to 20.",
            }
          : {}),
      },
    };
  const v = parsed.data;
  const { data: duplicates, error: duplicateError } = await client.rpc(
    "find_duplicate_leads",
    {
      p_name: v.payload.project_name,
      p_address: v.payload.address,
      p_exclude: v.id,
    },
  );
  if (duplicateError) return { error: workflowError(duplicateError.message) };
  if (v.submit && duplicates?.length && !v.duplicate_reason)
    return {
      error:
        "Possible duplicates found. Add a reason if this is a separate request.",
      duplicates,
      fields: { duplicate_reason: "Explain why you are continuing." },
    };
  const { error } = await client.rpc("save_lead", {
    p_id: v.id,
    p_expected_version: v.expected_version,
    p_payload: v.payload,
    p_submit: v.submit,
    p_duplicate_reason: v.duplicate_reason,
  });
  if (error)
    return {
      error: workflowError(error.message),
      duplicates: duplicates ?? [],
      ...(error.message.includes("INVALID_LEAD_SUPPLIER")
        ? {
            fields: {
              supplier_id:
                "Choose an active supplier from the supplier masterfile.",
            },
          }
        : {}),
    };
  return {
    error: null,
    success: "Quotation request saved.",
    redirectTo: `/dashboard/leads/${v.id}`,
  };
}
export async function reviewLead(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { client } = await requireRole([
    "lead_designer",
    "system_administrator",
  ]);
  const parsed = reviewSchema.safeParse({
    id: value(data, "id"),
    expected_version: Number(value(data, "expected_version")),
    decision: value(data, "decision"),
    remarks: value(data, "remarks"),
    assignments: {
      primary: nullable(value(data, "primary")) ?? undefined,
      support: list(data, "support"),
      ops: list(data, "ops"),
      lead_designer: nullable(value(data, "lead_designer")),
    },
  });
  if (!parsed.success)
    return {
      error: "Check the review and assignments.",
      fields: fieldErrors(parsed.error),
    };
  const v = parsed.data;
  const { data: project, error } = await client.rpc("review_lead", {
    p_id: v.id,
    p_expected_version: v.expected_version,
    p_decision: v.decision,
    p_remarks: v.remarks,
    p_primary: v.assignments.primary ?? null,
    p_support: v.assignments.support ?? [],
    p_ops: [],
    p_lead_designer: v.assignments.lead_designer ?? null,
  });
  if (error) return { error: workflowError(error.message) };
  return {
    error: null,
    success: "Review recorded.",
    redirectTo: project
      ? `/dashboard/projects/${project}`
      : `/dashboard/leads/${v.id}`,
  };
}
export async function assignPersonnel(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { client } = await requireRole([
    "lead_designer",
    "system_administrator",
  ]);
  const parsed = assignmentSchema
    .extend({ id: z.uuid(), reason: z.string().trim().min(1).max(2000) })
    .safeParse({
      id: value(data, "id"),
      primary: value(data, "primary"),
      support: list(data, "support"),
      ops: list(data, "ops"),
      lead_designer: null,
      reason: value(data, "reason"),
    });
  if (!parsed.success)
    return {
      error: "Choose a primary Designer and enter a reason.",
      fields: fieldErrors(parsed.error),
    };
  const v = parsed.data;
  const { error } = await client.rpc("assign_project_personnel", {
    p_project: v.id,
    p_primary: v.primary,
    p_support: v.support,
    p_ops: v.ops,
    p_reason: v.reason,
  });
  if (error) return { error: workflowError(error.message) };
  revalidatePath("/dashboard", "layout");
  return {
    error: null,
    success: "Assignments saved. Assignment history has been preserved.",
  };
}
export async function updateUserAccess(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { client } = await requireRole(["system_administrator"]);
  const parsed = z
    .object({
      id: z.uuid(),
      role: z.enum(roles),
      active: z.boolean(),
      name: z.string().trim().min(1).max(200),
      reason: z.string().trim().min(1).max(2000),
    })
    .safeParse({
      id: value(data, "id"),
      role: value(data, "role"),
      active: value(data, "active") === "true",
      name: value(data, "display_name"),
      reason: value(data, "reason"),
    });
  if (!parsed.success)
    return {
      error: "Check the account details and enter a change reason.",
      fields: fieldErrors(parsed.error),
    };
  const v = parsed.data;
  const { error } = await client.rpc("update_user_access", {
    p_user: v.id,
    p_role: v.role,
    p_active: v.active,
    p_name: v.name,
    p_reason: v.reason,
  });
  if (error) return { error: workflowError(error.message) };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: "Account access updated and audited." };
}
export async function inviteUser(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { client } = await requireRole(["system_administrator"]);
  const parsed = z
    .object({
      email: z.email().max(254),
      first_name: z.string().trim().min(1).max(100),
      last_name: z.string().trim().min(1).max(100),
      role: z.enum(roles),
    })
    .safeParse({
      email: value(data, "email"),
      first_name: value(data, "first_name"),
      last_name: value(data, "last_name"),
      role: value(data, "role"),
    });
  if (!parsed.success)
    return {
      error: "Enter a name, valid work email, and role.",
      fields: fieldErrors(parsed.error),
    };
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!admin || !appUrl)
    return {
      error:
        "Invitations require the server-only Supabase secret key and application URL. Existing invited users can still be provisioned below.",
    };
  const v = parsed.data;
  const name = `${v.first_name} ${v.last_name}`.trim();
  const { error: auditError } = await client.rpc("record_invitation_request", {
    p_email: v.email,
    p_role: v.role,
  });
  if (auditError) return { error: workflowError(auditError.message) };
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(
    v.email,
    {
      data: {
        full_name: name,
        first_name: v.first_name,
        last_name: v.last_name,
      },
      redirectTo: `${appUrl}/auth/confirm`,
    },
  );
  if (error || !invited.user)
    return {
      error:
        "The invitation could not be sent. Check email configuration and whether this address is already registered.",
    };
  const { error: provisionError } = await client.rpc("update_user_access", {
    p_user: invited.user.id,
    p_role: v.role,
    p_active: true,
    p_name: name,
    p_reason: "Provisioned by administrator after invitation",
  });
  revalidatePath("/dashboard", "layout");
  if (provisionError)
    return {
      error:
        "The invitation was sent, but activation failed. Finish provisioning the inactive account in the user list below.",
    };
  return {
    error: null,
    success:
      "Invitation sent and account provisioned. The recipient must accept their invitation and set a password.",
  };
}
export async function markRead(data: FormData) {
  const { client } = await requireWorkspace();
  const id = z.uuid().safeParse(data.get("id"));
  if (!id.success) throw new Error("Invalid notification");
  const { error } = await client.rpc("mark_notification_read", {
    p_id: id.data,
  });
  if (error) throw new Error(workflowError(error.message));
  revalidatePath("/dashboard", "layout");
}

export async function changeLeadDesigner(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { client } = await requireRole([
    "lead_designer",
    "system_administrator",
  ]);
  const parsed = z
    .object({
      id: z.uuid(),
      designer: z.uuid(),
      expected_designer: z.uuid().optional(),
      expected_version: z.number().int().positive().optional(),
      reason: z.string().trim().min(1).max(2000),
      kind: z.enum(["lead", "project"]),
    })
    .safeParse({
      id: value(data, "id"),
      designer: value(data, "designer"),
      expected_designer: value(data, "expected_designer") || undefined,
      expected_version: value(data, "expected_version")
        ? Number(value(data, "expected_version"))
        : undefined,
      reason: value(data, "reason"),
      kind: value(data, "kind"),
    });
  if (!parsed.success)
    return {
      error: "Choose an active Lead Designer and enter a reason.",
      fields: fieldErrors(parsed.error),
    };
  const v = parsed.data;
  if (
    (v.kind === "lead" && !v.expected_version) ||
    (v.kind === "project" && !v.expected_designer)
  )
    return { error: "Reload this record before changing its Lead Designer." };
  const { error } =
    v.kind === "lead"
      ? await client.rpc("route_lead", {
          p_lead: v.id,
          p_expected_version: v.expected_version,
          p_designer: v.designer,
          p_reason: v.reason,
        })
      : await client.rpc("assign_project_lead_designer", {
          p_project: v.id,
          p_expected_designer: v.expected_designer,
          p_designer: v.designer,
          p_reason: v.reason,
        });
  if (error) return { error: workflowError(error.message) };
  return {
    error: null,
    success: "Lead Designer assigned.",
    redirectTo: v.kind === "lead" ? "/dashboard/leads" : "/dashboard/projects",
  };
}
