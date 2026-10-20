export const readinessStatuses = [
  "Site Verification",
  "Revision",
  "Site Mapping",
  "Ready for Order",
  "Ordered",
] as const;
export type SpaceReadiness = {
  space_id: string;
  project_id: string;
  status: string;
  version: number;
};
export type SpaceHandoff = {
  id: string;
  space_id: string;
  ops_id: string;
  acknowledged_at: string | null;
  invalidated_at: string | null;
};
// Temporarily isolated; historical installation records and code remain intact.
export const installationTrackingEnabled = false;
export function readinessSummary(rows: { status: string }[]) {
  return (
    readinessStatuses
      .flatMap((status) => {
        const count = rows.filter((r) => r.status === status).length;
        return count ? [`${count} ${status}`] : [];
      })
      .join(" · ") || "Not started"
  );
}
