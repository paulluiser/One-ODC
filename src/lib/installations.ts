export const installationStatuses = [
  "Not Scheduled",
  "Scheduled",
  "In Progress",
  "On Hold",
  "Completed",
  "Not Applicable",
] as const;
export type Installation = {
  space_id: string;
  project_id: string;
  status: string;
  scheduled_date: string | null;
  completed_at: string | null;
  version: number;
};
export type Readiness = {
  project_id: string;
  version: number;
  cycle: number | null;
  ready: boolean;
  completed: boolean;
  can_complete: boolean;
  blockers: { kind: string; id?: string; label: string }[];
  history: {
    cycle: number;
    completed_at: string;
    completed_by: string;
    reason: string;
    administrative_override: boolean;
  }[];
};
export function installationError(message: string) {
  const errors: Record<string, string> = {
    OPERATIONAL_PREREQUISITES:
      "Operational prerequisites changed or remain incomplete. Reload and resolve the checklist blockers.",
    PROJECT_ALREADY_COMPLETED:
      "This cycle is already completed. Reload to see preserved completion history.",
    PROJECT_COMPLETED_REOPEN_REQUIRED:
      "This Project is operationally completed. A Lead Designer or System Administrator must reopen it before operational edits.",
    HANDOFF_REQUIRED:
      "The current handoff must be acknowledged. A documented manager override is required for an installation exception.",
    ACCESS_DENIED:
      "You do not have permission to change this Space installation or complete this Project.",
    PROJECT_HELD:
      "Project On Hold: installation changes and completion are blocked.",
    PROJECT_CANCELLED:
      "Cancelled Projects or Spaces cannot receive installation changes.",
    VERSION_CONFLICT:
      "This record changed elsewhere. Reload before retrying; your entries are kept.",
    REASON_REQUIRED:
      "A reason is required for schedule changes, exceptions, corrections, reopening or administrative actions.",
    INSTALLATION_DATE_REQUIRED:
      "Scheduled installations require an installation date.",
    CONFIRMATION_REQUIRED: "Explicit confirmation is required.",
  };
  return (
    Object.entries(errors).find(([key]) => message.includes(key))?.[1] ??
    "Check the installation fields. The action could not be saved; your entries are kept."
  );
}
