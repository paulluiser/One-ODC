import { z } from "zod";
export const spaceStatuses = [
  "Not Started",
  "In Progress",
  "Submitted",
  "For Revision",
  "Completed",
  "On Hold",
] as const;
export type SpaceStatus = (typeof spaceStatuses)[number];
export type Space = {
  id: string;
  project_id: string;
  name: string;
  primary_designer_id: string;
  primary_assigned_at: string;
  deadline: string | null;
  status: SpaceStatus;
  version: number;
  revision_number: number;
  first_completed_at: string | null;
  last_completed_at: string | null;
  held_status: SpaceStatus | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};
export type Supporter = {
  space_id: string;
  user_id: string;
  assigned_at: string;
};
export type SpaceEvent = {
  id: string;
  space_id: string;
  action: string;
  reason: string;
  actor_id: string;
  occurred_at: string;
  previous_value: unknown;
  new_value: unknown;
};
const reason = z.string().trim().min(1).max(2000);
export const saveSpaceSchema = z
  .object({
    id: z.uuid(),
    project: z.uuid(),
    version: z.number().int().min(0),
    name: z.string().trim().min(1).max(200),
    deadline: z.iso.date().nullable(),
    primary: z.uuid(),
    support: z.array(z.uuid()).max(50),
    reason,
  })
  .refine(
    (v) =>
      !v.support.includes(v.primary) &&
      new Set(v.support).size === v.support.length,
    { message: "Choose distinct supporting Designers." },
  );
export const spaceMutationSchema = z.object({
  id: z.uuid(),
  project: z.uuid(),
  version: z.number().int().positive(),
  reason,
  status: z.enum(spaceStatuses).optional(),
  approval: z.string().trim().max(2000),
});
export const bulkSpaceSchema = z.object({
  project: z.uuid(),
  spaces: z
    .array(z.object({ id: z.uuid(), version: z.number().int().positive() }))
    .min(1)
    .max(100),
  primary: z.uuid(),
  support: z.array(z.uuid()).max(50),
  reason,
});
export function spaceTransitions(
  space: Space,
  manager: boolean,
  admin: boolean,
): SpaceStatus[] {
  if (space.cancelled_at) return [];
  if (admin) return spaceStatuses.filter((s) => s !== space.status);
  switch (space.status) {
    case "Not Started":
      return ["In Progress", "On Hold"];
    case "In Progress":
      return ["Submitted", "On Hold"];
    case "For Revision":
      return ["In Progress", "Submitted", "On Hold"];
    case "Submitted":
      return manager ? ["For Revision", "Completed", "On Hold"] : [];
    case "Completed":
      return manager ? ["For Revision"] : [];
    case "On Hold":
      return space.held_status ? [space.held_status] : [];
  }
}
export function spaceError(message: string): string {
  for (const [key, text] of Object.entries({
    PROJECT_CANCELLED:
      "This project is cancelled. Space records are read-only.",
    PROJECT_ON_HOLD: "Resume the project before changing design status.",
    VERSION_CONFLICT:
      "This space changed. Reload the page before trying again.",
    ACCESS_DENIED:
      "You do not have permission, or completion approval is missing.",
    INVALID_ASSIGNMENTS:
      "Choose active Designers from the current project team.",
    INVALID_TRANSITION:
      "This status change is not permitted. Reload to see the current status.",
    SPACE_CANCELLED: "Cancelled spaces retain history and cannot be modified.",
    VALIDATION_ERROR: "Check your entries and provide a reason.",
  }))
    if (message.includes(key)) return text;
  return "The change could not be saved. Retry or contact your System Administrator.";
}
