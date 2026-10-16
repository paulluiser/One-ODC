"use server";

import { requireRole } from "@/lib/workspace-session";

export async function loadAccessHistory(requestedPage: number) {
  const { client } = await requireRole(["system_administrator"]);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(100000, Math.max(1, requestedPage))
    : 1;
  const { data, error, count } = await client
    .from("audit_events")
    .select("id,entity_id,action,actor_id,occurred_at", { count: "exact" })
    .eq("entity_type", "profile")
    .in("action", ["user.access_changed", "user.invitation_requested"])
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * 10, page * 10 - 1);
  if (error) return { error: "History could not be loaded. Please retry." };
  return { events: data ?? [], count: count ?? 0, page };
}
