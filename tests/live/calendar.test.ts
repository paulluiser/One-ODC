import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { calendarEventSchema } from "../../src/lib/calendar";
it("calendar enforces real-session role scopes, owner privacy, concurrent edits and auditable cancellation", async () => {
  process.loadEnvFile(".env.verification");
  const env = process.env;
  if (
    env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
    new URL(env.ONE_ODC_TEST_URL!).hostname !==
      "jlvlwkryasoducuucvxk.supabase.co"
  )
    throw Error("Staging only");
  const clients: Record<string, SupabaseClient> = {},
    events: Record<string, { id: string; version: number }> = {};
  const data = {
    title: "Calendar verification — disposable personal event",
    date: "2026-10-15",
    end_date: "2026-10-16",
    time: "09:00",
    end_time: "10:00",
    notes: "Synthetic staging test",
    location: "Staging",
  };
  const range = { p_from: "2026-10-01", p_to: "2026-10-31" };
  try {
    for (const role of [
      "ADMIN",
      "LEAD",
      "DESIGNER",
      "BDM",
      "OPS",
      "OTHER_BDM",
      "UNASSIGNED",
    ]) {
      const c = createClient(
        env.ONE_ODC_TEST_URL!,
        env.ONE_ODC_TEST_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      clients[role] = c;
      const login = await c.auth.signInWithPassword({
        email: env[`ONE_ODC_TEST_${role}_EMAIL`]!,
        password: env[`ONE_ODC_TEST_${role}_PASSWORD`]!,
      });
      expect(login.error).toBeNull();
      const id = randomUUID();
      events[role] = { id, version: 1 };
      const created = await c.rpc("save_calendar_event", {
        p_id: id,
        p_version: 0,
        p_data: data,
        p_cancel: false,
        p_reason: "",
      });
      expect(created.error).toBeNull();
      const result = await c.rpc("workspace_calendar", range);
      expect(result.error).toBeNull();
      const list = calendarEventSchema.array().parse(result.data);
      expect(list.some((e) => e.id === id)).toBe(true);
      const spaces = await c.from("spaces").select("id");
      expect(spaces.error).toBeNull();
      const allowed = new Set(spaces.data?.map((s) => s.id));
      for (const e of list.filter((e) => e.kind === "Space deadline"))
        expect(allowed.has(e.id.slice(6))).toBe(true);
      if (role === "OPS")
        expect(list.some((e) => e.kind === "Lead requested date")).toBe(false);
      if (["OTHER_BDM", "UNASSIGNED"].includes(role)) {
        const projects = await c
          .from("project_memberships")
          .select("project_id")
          .eq("user_id", (await c.auth.getUser()).data.user!.id);
        expect(projects.error).toBeNull();
        const assigned = new Set(
          (projects.data ?? []).map((p) => p.project_id),
        );
        for (const event of list.filter((e) =>
          e.href?.startsWith("/dashboard/projects/"),
        ))
          expect(assigned.has(event.href!.split("/")[3].split(/[?#]/)[0])).toBe(
            true,
          );
      }
    }
    const owner = events.DESIGNER;
    for (const role of ["ADMIN", "BDM", "OPS", "OTHER_BDM"]) {
      const r = await clients[role]
        .from("calendar_events")
        .select("id")
        .eq("id", owner.id);
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
      const history = await clients[role]
        .from("calendar_event_history")
        .select("id")
        .eq("event_id", owner.id);
      expect(history.error).toBeNull();
      expect(history.data).toEqual([]);

      const edit = await clients[role].rpc("save_calendar_event", {
        p_id: owner.id,
        p_version: 1,
        p_data: data,
        p_cancel: false,
        p_reason: "Unauthorized edit",
      });
      expect(edit.error?.message).toContain("ACCESS_DENIED");
    }
    const direct = await clients.DESIGNER.from("calendar_events")
      .update({ title: "Bypass" })
      .eq("id", owner.id);
    expect(direct.error).not.toBeNull();
    const edits = await Promise.all(
      [1, 2].map(() =>
        clients.DESIGNER.rpc("save_calendar_event", {
          p_id: owner.id,
          p_version: 1,
          p_data: { ...data, title: "Confirmed site visit" },
          p_cancel: false,
          p_reason: "Confirmed schedule",
        }),
      ),
    );
    expect(edits.filter((r) => !r.error)).toHaveLength(1);
    expect(edits.find((r) => r.error)?.error?.message).toContain("STALE_EVENT");
    owner.version = 2;
    const invalid = await clients.ADMIN.rpc("workspace_calendar", {
      p_from: "2026-01-01",
      p_to: "2026-12-31",
    });
    expect(invalid.error?.message).toContain("INVALID_RANGE");
    const anon = createClient(
      env.ONE_ODC_TEST_URL!,
      env.ONE_ODC_TEST_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    expect((await anon.rpc("workspace_calendar", range)).error).not.toBeNull();
  } finally {
    for (const [role, event] of Object.entries(events)) {
      const cancelled = await clients[role].rpc("save_calendar_event", {
        p_id: event.id,
        p_version: event.version,
        p_data: {},
        p_cancel: true,
        p_reason: "Verification complete; remove disposable test event",
      });
      expect(cancelled.error).toBeNull();
      const result = await clients[role].rpc("workspace_calendar", range);
      expect(result.error).toBeNull();
      expect(result.data.some((e: { id: string }) => e.id === event.id)).toBe(
        false,
      );
    }
    if (clients.ADMIN) {
      const audit = await clients.ADMIN.from("audit_events")
        .select("action,new_value")
        .eq("entity_type", "calendar_event")
        .in(
          "entity_id",
          Object.values(events).map((e) => e.id),
        );
      expect(audit.error).toBeNull();
      for (const item of audit.data ?? [])
        expect(Object.keys(item.new_value)).toEqual(["version"]);

      expect(
        audit.data?.filter((e) => e.action === "calendar.event_cancelled"),
      ).toHaveLength(7);
    }
    for (const client of Object.values(clients))
      await client.auth.signOut({ scope: "local" });
  }
}, 120000);
