import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { profileSchema } from "./phase1";
import type { Role } from "./domain";
export const requireWorkspace = cache(async () => {
  const client = await createClient();
  if (!client) redirect("/login");
  // Verifies the JWT signature locally (asymmetric signing keys) instead of an
  // Auth server round-trip; symmetric-key projects fall back to getUser().
  // The active-profile check below still blocks deactivated users immediately.
  const { data: claims, error } = await client.auth.getClaims();
  if (error || !claims?.claims.sub) redirect("/login");
  const user = { id: claims.claims.sub };
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
// Request-scoped dedupe: several Project detail sections read the same RPCs.
export const projectTeam = cache(async (project: string) =>
  (await requireWorkspace()).client.rpc("project_team", { p_project: project }),
);
export const projectMonitoringSummary = cache(async (project: string) =>
  (await requireWorkspace()).client.rpc("monitoring_summary", {
    p_projects: [project],
  }),
);
