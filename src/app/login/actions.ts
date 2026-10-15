"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
export type LoginState = { error: string | null };
export async function signIn(
  _previous: LoginState,
  data: FormData,
): Promise<LoginState> {
  const parsed = z
    .object({ email: z.email(), password: z.string().min(1) })
    .safeParse({ email: data.get("email"), password: data.get("password") });
  if (!parsed.success)
    return { error: "Enter a valid work email and your password." };
  const client = await createClient();
  if (!client)
    return {
      error:
        "Sign-in is awaiting Supabase configuration. You can explore the demonstration workspace below.",
    };
  const { data: signedIn, error } = await client.auth.signInWithPassword(
    parsed.data,
  );
  if (error)
    return {
      error:
        "We couldn’t sign you in. Check your details or contact your System Administrator.",
    };
  const profile = await client
    .from("profiles")
    .select("active")
    .eq("id", signedIn.user!.id)
    .maybeSingle();
  if (profile.error || !profile.data?.active) {
    await client.rpc("record_security_event", {
      p_event: "auth.sign_in_denied",
    });
    await client.auth.signOut({ scope: "local" });
    return {
      error: profile.error
        ? "Your account access could not be checked. Contact your System Administrator."
        : "Your account is inactive or has not been provisioned. Contact your System Administrator.",
    };
  }
  const audit = await client.rpc("record_security_event", {
    p_event: "auth.sign_in",
  });
  if (audit.error) {
    await client.auth.signOut({ scope: "local" });
    return {
      error:
        "The security audit could not be recorded. Please try again or contact your System Administrator.",
    };
  }
  redirect("/dashboard");
}
export async function signOut() {
  const client = await createClient();
  if (client) {
    await client.rpc("record_security_event", { p_event: "auth.sign_out" });
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error)
      throw new Error("Sign-out could not be completed. Please try again.");
  }
  redirect("/login");
}
