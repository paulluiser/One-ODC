export type SearchHit = {
  kind: "Projects" | "Leads" | "Spaces" | "Suppliers";
  title: string;
  detail: string;
  href: string;
};
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Spreadsheet parsers may ignore leading whitespace/control characters before a formula.
  if (
    /^[=+@-]/.test(text.replace(/^[\s\p{Cc}]+/u, "")) ||
    /^[\t\r\n]/.test(text)
  )
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function serializeCsv(headers: string[], rows: unknown[][]): string {
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
export function recoveryMessage(code: string, status = 0): string {
  if (status === 401 || /JWT|SESSION|PGRST301/.test(code))
    return "Your session expired. Sign in again; keep this page open to preserve your entries.";
  if (status === 403 || /ACCESS_DENIED|INVALID_MENTION|42501/.test(code))
    return "You do not have access to this action or one of the selected records. Review your selection or contact your Lead Designer.";
  if (status === 409 || /VERSION_CONFLICT|23505/.test(code))
    return "This record changed or this request was already processed. Reload the current record before trying again; your entries have been kept.";
  if (/CONFIRMATION_REQUIRED|REASON_REQUIRED/.test(code))
    return "Confirm the proposed changes and provide the required reason.";
  if (/LIMIT|INVALID|VALIDATION|23514/.test(code))
    return "Check the selected records, required fields and allowed limits. Your entries have been kept.";
  return "The request could not be confirmed. Check your connection and reload the current record before retrying a save. Your entries have been kept.";
}
export function filterFormSignature(form: HTMLFormElement): string {
  return JSON.stringify(
    [...new FormData(form).entries()]
      .filter(([key]) => !key.startsWith("$ACTION"))
      .map(([key, value]) => [
        key,
        typeof value === "string"
          ? value
          : `${value.name}:${value.size}:${value.lastModified}`,
      ]),
  );
}
