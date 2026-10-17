import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace-session";
import { recoveryMessage } from "@/lib/productivity";
import { z } from "zod";
const uuid = z.uuid();
const response = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: NextRequest) {
  const { client, profile } = await requireWorkspace();
  if (process.env.ONE_ODC_UI_R0_ENABLED !== "true")
    return response({ error: "Unavailable" }, 404);
  const params = request.nextUrl.searchParams,
    action = params.get("action"),
    project = params.get("project");
  const manager = ["lead_designer", "system_administrator"].includes(
    profile.role,
  );
  const read = <T extends { error: unknown; data: unknown }>(
    r: T,
  ): T["data"] => {
    if (r.error) throw r.error;
    return r.data;
  };
  try {
    if (action === "search")
      return response({ error: "Global search is no longer available." }, 404);
    if (action === "shortcuts") {
      const records = read(
        await client
          .from("project_shortcuts")
          .select(
            "project_id,favorite,viewed_at,projects!inner(id,name,reference)",
          )
          .order("favorite", { ascending: false })
          .order("viewed_at", { ascending: false })
          .limit(130),
      );
      return response({ records });
    }
    if (project && !uuid.safeParse(project).success)
      return response({ error: "Invalid project." }, 400);
    if (action === "workspace" && project) {
      const p = read(
        await client
          .from("projects")
          .select("id,name,commercial_status,lead_designer_id")
          .eq("id", project)
          .maybeSingle(),
      );
      if (!p) return response({ error: "Project unavailable." }, 404);
      const shortcut = read(
        await client
          .from("project_shortcuts")
          .select("favorite")
          .eq("project_id", project)
          .maybeSingle(),
      );
      return response({
        favorite: shortcut?.favorite ?? false,
        canDiscuss:
          profile.role !== "operations_admin" ||
          p.commercial_status === "Closed",
        canManage:
          profile.role === "system_administrator" ||
          (profile.role === "lead_designer" &&
            p.lead_designer_id === profile.id),
      });
    }
    if (action === "discussion" && project) {
      const p = read(
        await client
          .from("projects")
          .select("commercial_status")
          .eq("id", project)
          .maybeSingle(),
      );
      if (
        !p ||
        (profile.role === "operations_admin" &&
          p.commercial_status !== "Closed")
      )
        return response({ error: recoveryMessage("ACCESS_DENIED") }, 403);
      const page = Math.min(1000, Math.max(1, Number(params.get("page")) || 1));
      const [comments, people, spaces] = await Promise.all([
        client
          .from("project_comments")
          .select(
            "id,space_id,author_id,body,version,created_at,updated_at,comment_mentions(recipient_id)",
          )
          .eq("project_id", project)
          .order("created_at", { ascending: false })
          .order("id")
          .range((page - 1) * 20, page * 20),
        client.rpc("comment_people", { p_project: project }),
        client
          .from("spaces")
          .select("id,name")
          .eq("project_id", project)
          .order("name")
          .limit(200),
      ]);
      const records = read(comments) ?? [];
      const team = read(people) as { id: string; display_name: string }[];
      const members = manager
        ? (read(await client.rpc("project_team", { p_project: project })) as {
            user_id: string;
            display_name: string;
            membership_role: string;
          }[])
        : [];
      const designers = [
        ...new Map(
          members
            .filter(
              (p) =>
                ["designer", "lead_designer"].includes(p.membership_role) &&
                team.some((person) => person.id === p.user_id),
            )
            .map((p) => [
              p.user_id,
              { id: p.user_id, display_name: p.display_name },
            ]),
        ).values(),
      ];
      return response({
        readOnly: p.commercial_status === "Lost",
        records: records.slice(0, 20),
        hasMore: records.length > 20,
        people: team,
        spaces: read(spaces),
        designers,
      });
    }
    if (action === "templates") {
      if (!manager)
        return response({ error: recoveryMessage("ACCESS_DENIED") }, 403);
      return response({
        records: read(
          await client
            .from("space_structure_templates")
            .select("id,name,structure")
            .order("created_at", { ascending: false })
            .limit(50),
        ),
      });
    }
    if (action === "export")
      return response({ error: "CSV export is no longer available." }, 404);
    return response({ error: "Unknown request." }, 400);
  } catch {
    return response(
      {
        error: "Records could not be loaded. Check your connection and retry.",
      },
      503,
    );
  }
}
const mutation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("remember"),
    project: uuid,
    favorite: z.boolean().nullable(),
  }),
  z.object({
    action: z.literal("saveTemplate"),
    id: uuid,
    project: uuid,
    name: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("applyTemplate"),
    operation: uuid,
    template: uuid,
    project: uuid,
    primary: uuid,
    confirm: z.literal(true),
  }),
  z.object({
    action: z.literal("comment"),
    id: uuid,
    project: uuid,
    space: uuid.nullable(),
    version: z.number().int().min(0),
    body: z.string().trim().min(1).max(8000),
    mentions: z.array(uuid).max(20),
    reason: z.string().max(2000),
  }),
]);
export async function POST(request: NextRequest) {
  const { client } = await requireWorkspace();
  if (process.env.ONE_ODC_UI_R0_ENABLED !== "true")
    return response({ error: "Unavailable" }, 404);
  // Route handlers do not inherit Server Action origin protection.
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return response({ error: "Request origin denied." }, 403);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return response({ error: "Invalid request." }, 400);
  }
  const parsed = mutation.safeParse(input);
  if (!parsed.success)
    return response({ error: recoveryMessage("VALIDATION_ERROR") }, 400);
  const p = parsed.data;
  let result;
  if (p.action === "remember")
    result = await client.rpc("remember_project", {
      p_project: p.project,
      p_favorite: p.favorite,
    });
  else if (p.action === "saveTemplate")
    result = await client.rpc("save_space_template", {
      p_id: p.id,
      p_source: p.project,
      p_name: p.name,
    });
  else if (p.action === "applyTemplate")
    result = await client.rpc("apply_space_template", {
      p_operation: p.operation,
      p_template: p.template,
      p_project: p.project,
      p_primary: p.primary,
      p_confirm: p.confirm,
    });
  else
    result = await client.rpc("save_project_comment", {
      p_id: p.id,
      p_project: p.project,
      p_space: p.space,
      p_version: p.version,
      p_body: p.body,
      p_mentions: p.mentions,
      p_reason: p.reason,
    });
  if (result.error) {
    const message = result.error.message ?? "";
    const status = /ACCESS_DENIED|INVALID_MENTION/.test(message)
      ? 403
      : /VERSION_CONFLICT|23505/.test(message)
        ? 409
        : 400;
    return response({ error: recoveryMessage(message, status) }, status);
  }
  return response({ result: result.data });
}
