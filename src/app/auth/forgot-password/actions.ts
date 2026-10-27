"use server";
import { z } from "zod";
import type { FormState } from "@/lib/phase1";
import {
  createRecoveryClient,
  passwordRecoveryUrl,
} from "@/lib/supabase/recovery";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/workspace-session";
export async function requestPasswordReset(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const email = z
    .email()
    .max(254)
    .safeParse(String(data.get("email") ?? "").trim());
  if (!email.success) return { error: "Enter a valid work email." };
  const client = createRecoveryClient(),
    redirectTo = passwordRecoveryUrl();
  if (!client || !redirectTo)
    return {
      error:
        "Password recovery is not configured. Contact your System Administrator.",
    };
  try {
    await client.auth.resetPasswordForEmail(email.data, { redirectTo });
  } catch {
    /* Keep account existence and provider responses private. */
  }
  return {
    error: null,
    success:
      "If an account exists for this email, a password-reset link will be sent. Check your inbox and spam folder. If it does not arrive, wait a minute before retrying or contact your System Administrator.",
  };
}
export async function adminPasswordReset(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { client } = await requireRole(["system_administrator"]);
  const parsed = z
    .object({
      id: z.uuid(),
      reason: z.string().trim().min(1).max(2000),
      confirm: z.literal("true"),
    })
    .safeParse({
      id: data.get("id"),
      reason: data.get("reason"),
      confirm: data.get("confirm"),
    });
  if (!parsed.success)
    return { error: "Enter a reset reason and confirm sending the email." };
  const admin = createAdminClient(),
    recovery = createRecoveryClient(),
    redirectTo = passwordRecoveryUrl();
  if (!admin || !recovery || !redirectTo)
    return {
      error:
        "Password recovery requires the server email configuration. Contact the system maintainer.",
    };
  try {
    const { data: account, error } = await admin.auth.admin.getUserById(
      parsed.data.id,
    );
    if (error || !account.user?.email)
      return { error: "The account email could not be verified." };
    const audit = await client.rpc("record_password_reset_request", {
      p_user: parsed.data.id,
      p_reason: parsed.data.reason,
    });
    if (audit.error)
      return {
        error: audit.error.message.includes("RESET_RATE_LIMIT")
          ? "A reset was requested recently. Wait one minute before trying again."
          : "The reset could not be authorized or audited. Check that the account is active.",
      };
    const sent = await recovery.auth.resetPasswordForEmail(account.user.email, {
      redirectTo,
    });
    if (sent.error)
      return {
        error:
          "The reset email could not be sent. Wait a minute, then retry or check email delivery configuration.",
      };
    return {
      error: null,
      success:
        "Reset email requested. The user must open the email and choose their own password; their current password remains valid until they change it.",
    };
  } catch {
    return {
      error: "The reset email could not be requested. Please try again later.",
    };
  }
}
