export function installationReasonRequired({
  previousStatus,
  status,
  previousDate,
  date,
  administrative,
  override,
  handoffAcknowledged,
}: {
  previousStatus?: string;
  status: string;
  previousDate?: string | null;
  date: string;
  administrative: boolean;
  override: boolean;
  handoffAcknowledged: boolean;
}) {
  const ordinary =
    ((previousStatus === "Not Scheduled" && status === "Scheduled") ||
      (previousStatus === "Scheduled" && status === "In Progress") ||
      (previousStatus === "In Progress" && status === "Completed")) &&
    (previousDate ?? "") === date;
  return !ordinary || administrative || override || !handoffAcknowledged;
}
