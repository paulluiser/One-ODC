"use server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace-session";
import { manualEventSchema } from "@/lib/calendar";
import { z } from "zod";
import type { FormState } from "@/lib/phase1";
export async function saveCalendarEvent(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  if (process.env.ONE_ODC_CALENDAR_ENABLED !== "true")
    return { error: "Calendar is not enabled in this environment." };
  const { client } = await requireWorkspace();
  const cancel = data.get("intent") === "cancel";
  const input = Object.fromEntries(data.entries());
  const parsed = cancel
    ? z
        .object({
          id: z.uuid(),
          version: z.coerce.number().int().positive(),
          reason: z.string().trim().min(1).max(2000),
        })
        .safeParse(input)
    : manualEventSchema.safeParse(input);
  if (!parsed.success)
    return {
      error:
        parsed.error.issues[0]?.message ||
        "Check your event details. Your entries have been kept.",
    };
  const v = parsed.data;
  const { error } = await client.rpc("save_calendar_event", {
    p_id: v.id,
    p_version: v.version,
    p_data: cancel ? {} : v,
    p_cancel: cancel,
    p_reason: v.reason,
  });
  if (error)
    return {
      error: error.message.includes("STALE_EVENT")
        ? "This event changed or was cancelled. Refresh the calendar before trying again."
        : error.message.includes("ACCESS_DENIED")
          ? "You can only change your own personal events."
          : "The event could not be saved. Your entries have been kept; please try again.",
    };
  revalidatePath("/dashboard/calendar");
  return {
    error: null,
    success: cancel
      ? "Event cancelled. Its history is preserved."
      : "Event saved to your personal calendar.",
  };
}
