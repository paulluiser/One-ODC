import { logisticsStatuses, type Logistics } from "./logistics";
export function logisticsOverrideRequired(
  record: Logistics | undefined,
  status: string,
  handoffAcknowledged: boolean,
) {
  if (!handoffAcknowledged) return true;
  if (!record || status === record.status) return false;
  const stages: readonly string[] = logisticsStatuses.slice(0, 7);
  return (
    ["Delivered", "Cancelled"].includes(record.status) ||
    (record.status === "On Hold"
      ? ![record.held_status, "Cancelled"].includes(status)
      : stages.indexOf(status) >= 0 &&
        stages.indexOf(status) < stages.indexOf(record.status))
  );
}
export function allowedLogisticsStatuses(
  record: Logistics | undefined,
  held: boolean,
  manager: boolean,
  override: boolean,
  handoffAcknowledged: boolean,
) {
  if (!record) return ["RFP"];
  if (held) return [record.status];
  return logisticsStatuses.filter((status) => {
    if (status === record.status) return true;
    if (
      status === "On Hold" &&
      ["Delivered", "Cancelled"].includes(record.status)
    )
      return false;
    return (
      !logisticsOverrideRequired(record, status, handoffAcknowledged) ||
      (manager && override)
    );
  });
}
export function logisticsReasonRequired(
  record: Logistics | undefined,
  status: string,
  administrative: boolean,
  override: boolean,
  handoffAcknowledged: boolean,
) {
  const stages: readonly string[] = logisticsStatuses.slice(0, 7);
  return (
    !record ||
    administrative ||
    override ||
    !handoffAcknowledged ||
    ["On Hold", "Cancelled"].includes(status) ||
    ["On Hold", "Delivered", "Cancelled"].includes(record.status) ||
    stages.indexOf(status) !== stages.indexOf(record.status) + 1
  );
}
