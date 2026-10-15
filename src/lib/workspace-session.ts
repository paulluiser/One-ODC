import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { profileSchema } from "./phase1";
import type { Role } from "./domain";
export const requireWorkspace = cache(async () => {
  const client = await createClient();
  if (!client) redirect("/login");
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const { data, error: profileError } = await client
    .from("profiles")
    .select("id,display_name,role,active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError)
    throw new Error(
      "Your access profile could not be loaded. Contact your System Administrator.",
    );
  const profile = profileSchema.safeParse(data);
  if (!profile.success || !profile.data.active) redirect("/access-pending");
  return { client, user, profile: profile.data };
});
export async function requireRole(allowed: Role[]) {
  const context = await requireWorkspace();
  if (!allowed.includes(context.profile.role))
    redirect("/dashboard?restricted=1");
  return context;
}
