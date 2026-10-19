import type { Readiness } from "./installations";
// A Space may block both design and installation; count the actual record once.
export function outstandingItems(blockers: Readiness["blockers"]) {
  return [
    ...new Map(
      blockers.map((b) => [
        b.id
          ? `${b.kind === "logistics" ? "logistics" : "space"}:${b.id}`
          : `${b.kind}:${b.label}`,
        b,
      ]),
    ).values(),
  ];
}
export function installationProgress(
  spaces: { id: string; cancelled_at: string | null }[],
  installations: { space_id: string; status: string }[],
) {
  const active = spaces.filter((s) => !s.cancelled_at);
  const satisfied = active.filter((s) =>
    installations.some(
      (i) =>
        i.space_id === s.id &&
        ["Completed", "Not Applicable"].includes(i.status),
    ),
  ).length;
  return {
    total: active.length,
    satisfied,
    percent: active.length
      ? Number(((satisfied / active.length) * 100).toFixed(1))
      : null,
  };
}

// Old links can contain both selections. Resolve one sheet, then normalize its URL.
export function operationDetail(
  query: Record<string, unknown>,
  kind: "installation" | "logistics",
) {
  const installation =
    typeof query.installation_detail === "string"
      ? query.installation_detail
      : "";
  const logistics =
    typeof query.logistics_detail === "string" ? query.logistics_detail : "";
  const active =
    installation && logistics
      ? query.section === "installation"
        ? "installation"
        : "logistics"
      : installation
        ? "installation"
        : "logistics";
  return active === kind
    ? kind === "installation"
      ? installation
      : logistics
    : "";
}
