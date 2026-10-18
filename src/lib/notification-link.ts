import type { Notification } from "./phase1";
export function notificationLink(
  notice: Pick<Notification, "project_id" | "lead_id" | "type" | "comment_id">,
) {
  if (notice.project_id)
    return `/dashboard/projects/${notice.project_id}${notice.type === "project_mention" && notice.comment_id ? `?tab=activity&section=discussion#comment-${notice.comment_id}` : ""}`;
  return notice.lead_id ? `/dashboard/leads/${notice.lead_id}` : null;
}
