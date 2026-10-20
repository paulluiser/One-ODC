export const roles = [
  "system_administrator",
  "lead_designer",
  "designer",
  "bdm",
  "operations_admin",
] as const;
export type Role = (typeof roles)[number];
export const isSuperAdmin = (role: Role) => role === "system_administrator";
export type Space = {
  status: string;
  installation: string;
  cancelled: boolean;
};
export function designProgress(spaces: Space[]): number | null {
  const active = spaces.filter((s) => !s.cancelled);
  return active.length
    ? (active.filter((s) => s.status === "Completed").length / active.length) *
        100
    : null;
}
export function installationProgress(spaces: Space[]): number | null {
  const applicable = spaces.filter(
    (s) => !s.cancelled && s.installation !== "Not Applicable",
  );
  return applicable.length
    ? (applicable.filter((s) => s.installation === "Completed").length /
        applicable.length) *
        100
    : null;
}
// Inputs are organizational date-only boundaries; no division of timestamp durations.
export function calendarDays(from: string, to: string): number {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("Expected YYYY-MM-DD");
    const time = Date.parse(`${value}T00:00:00Z`);
    if (
      !Number.isFinite(time) ||
      new Date(time).toISOString().slice(0, 10) !== value
    )
      throw new Error("Invalid date");
    return time;
  };
  return Math.max(0, (parse(to) - parse(from)) / 86_400_000);
}
