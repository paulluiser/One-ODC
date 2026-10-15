"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/phase1";
export async function setPassword(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const parsed = z
    .object({ password: z.string().min(12).max(128), confirmation: z.string() })
    .refine((v) => v.password === v.confirmation, {
      message: "Passwords must match.",
    })
    .safeParse({
      password: data.get("password"),
      confirmation: data.get("confirmation"),
    });
  if (!parsed.success)
    return { error: "Use matching passwords with 12–128 characters." };
  const client = await createClient();
  if (!client) redirect("/login");
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await client.auth.updateUser({
    password: parsed.data.password,
  });
  if (error)
    return {
      error:
        "Your password could not be set. Check the password policy or request a fresh link.",
    };
  const profile = await client
    .from("profiles")
    .select("active")
    .eq("id", user.id)
    .maybeSingle();
  if (profile.error)
    return {
      error:
        "Your password was updated, but account access could not be checked. Sign in again or contact your System Administrator.",
    };
  if (profile.data?.active) {
    const audit = await client.rpc("record_security_event", {
      p_event: "auth.password_set",
    });
    if (audit.error)
      return {
        error:
          "Your password was updated, but the application audit could not be recorded. Contact your System Administrator before proceeding.",
      };
    redirect("/dashboard");
  }
  redirect("/access-pending");
}
