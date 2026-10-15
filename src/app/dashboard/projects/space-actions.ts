"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/workspace-session";
import {
  saveSpaceSchema,
  spaceMutationSchema,
  bulkSpaceSchema,
  spaceError,
} from "@/lib/spaces";
import type { FormState } from "@/lib/phase1";
const value = (data: FormData, key: string) => String(data.get(key) ?? "");
export async function mutateSpace(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  if (process.env.ONE_ODC_SPACES_ENABLED !== "true")
    return { error: "Space Management is not configured in this environment." };
  const intent = value(data, "intent");
  const { client } = await requireRole(
    intent === "cancel" || intent === "bulk"
      ? ["lead_designer", "system_administrator"]
      : ["lead_designer", "system_administrator", "designer"],
  );
  const common = {
    id: value(data, "id"),
    project: value(data, "project"),
    version: Number(value(data, "version")),
    reason: value(data, "reason"),
  };
  let endpoint: string;
  let args: Record<string, unknown>;
  if (intent === "save") {
    const parsed = saveSpaceSchema.safeParse({
      ...common,
      name: value(data, "name"),
      deadline: value(data, "deadline") || null,
      primary: value(data, "primary"),
      support: data.getAll("support").map(String),
    });
    if (!parsed.success)
      return {
        error:
          "Check the name, deadline, assignments and reason. Your entries have been kept.",
      };
    const v = parsed.data;
    endpoint = "save_space";
    args = {
      p_id: v.id,
      p_project: v.project,
      p_expected_version: v.version,
      p_name: v.name,
      p_deadline: v.deadline,
      p_primary: v.primary,
      p_support: v.support,
      p_reason: v.reason,
    };
  } else if (intent === "bulk") {
    let selected: unknown;
    try {
      selected = data.getAll("spaces").map((s) => JSON.parse(String(s)));
    } catch {
      return { error: "Choose valid spaces." };
    }
    const parsed = bulkSpaceSchema.safeParse({
      ...common,
      spaces: selected,
      primary: value(data, "primary"),
      support: data.getAll("support").map(String),
    });
    if (!parsed.success)
      return { error: "Select 1–100 spaces, assignments and a reason." };
    const v = parsed.data;
    endpoint = "bulk_reassign_spaces";
    args = {
      p_project: v.project,
      p_spaces: v.spaces,
      p_primary: v.primary,
      p_support: v.support,
      p_reason: v.reason,
    };
  } else {
    const parsed = spaceMutationSchema.safeParse({
      ...common,
      status: intent === "status" ? value(data, "status") : undefined,
      approval: value(data, "approval"),
    });
    if (!parsed.success || !["status", "cancel"].includes(intent))
      return { error: "Select a status and provide a reason." };
    const v = parsed.data;
    endpoint = intent === "cancel" ? "cancel_space" : "change_space_status";
    args = {
      p_id: v.id,
      p_expected_version: v.version,
      p_reason: v.reason,
      ...(intent === "status"
        ? { p_status: v.status, p_approval: v.approval }
        : {}),
    };
  }
  const r = await client.rpc(endpoint, args);
  if (r.error) return { error: spaceError(r.error.message) };
  revalidatePath(`/dashboard/projects/${common.project}`);
  revalidatePath("/dashboard", "layout");
  return {
    error: null,
    success:
      intent === "bulk"
        ? "Selected spaces reassigned together."
        : intent === "cancel"
          ? "Space cancelled. History preserved."
          : "Space saved.",
  };
}
