"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace-session";

export type NotificationState = { error?: string; success?: string };
export async function readNotifications(
  _previous: NotificationState,
  data: FormData,
): Promise<NotificationState> {
  const { client, profile } = await requireWorkspace();
  if (process.env.ONE_ODC_UI_R0_ENABLED !== "true")
    return { error: "This action is unavailable." };
  const all = data.get("scope") === "all";
  const requested = z.uuid().safeParse(data.get("recipient"));
  const recipient = requested.success ? requested.data : profile.id;
  if (recipient !== profile.id && profile.role !== "system_administrator")
    return { error: "You cannot manage this inbox." };
  const id = z.uuid().safeParse(data.get("id"));
  if (!all && !id.success) return { error: "Choose a valid notification." };
  try {
    const result = all
      ? await client.rpc("mark_recipient_notifications_read", {
          p_recipient: recipient,
        })
      : await client.rpc("mark_notification_read", { p_id: id.data! });
    if (result.error)
      return {
        error: "Could not mark notifications as read. Please try again.",
      };
    revalidatePath("/dashboard", "layout");
    return {
      success: all
        ? "All notifications marked as read."
        : "Notification marked as read.",
    };
  } catch {
    return { error: "Could not connect. Please try again." };
  }
}
