import { z } from "zod";
import { financialAmount } from "./finance";
export type ActivityRow = {
  id: string;
  title: string;
  category: string;
  description: string;
  actor: string;
  at: string;
  date: string;
  space: string | null;
  related: string;
  reason: string;
  changes: { label: string; before: string; after: string }[];
  links: { label: string; href: string }[];
  manualId?: string;
};
const labels: Record<string, string> = {
  name: "Name",
  status: "Status",
  deadline: "Deadline",
  timezone: "Timezone",
  category: "Category",
  activity_date: "Activity date",
  description: "Description",
  method: "Method",
  reference: "Reference",
  remarks: "Remarks",
  amount: "Amount",
  sale_amount: "Sale",
  state: "Project state",
  scheduled_date: "Scheduled date",
  completed_at: "Completed",
  primary_designer_id: "Primary Designer",
  coordinator_id: "Site Coordinator",
  primary_ops_id: "Primary Operations Admin",
  attachment_versions: "File versions",
  support: "Supporting Designers",
  supporting_designers: "Supporting Designers",
};
export function readableChanges(
  previous: unknown,
  current: unknown,
  names: Record<string, string> = {},
) {
  const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  if (Array.isArray(previous) || Array.isArray(current)) {
    const members = (value: unknown) =>
      Array.isArray(value)
        ? value
            .map((v) => {
              const m = object(v);
              return `${names[String(m.user_id)] ?? "Previously assigned member"} · ${String(m.membership_role ?? "Member").replaceAll("_", " ")}${m.is_primary ? " · Primary" : ""}`;
            })
            .join("; ") || "None"
        : "Not recorded";
    return [
      {
        label: "Project team",
        before: members(previous),
        after: members(current),
      },
    ];
  }
  const a = object(previous),
    b = object(current);
  const display = (key: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "Not recorded";
    if (Array.isArray(v))
      return (
        v
          .map((id) =>
            typeof id === "string"
              ? (names[id] ?? "Previously assigned record")
              : "Recorded item",
          )
          .join(", ") || "None"
      );
    if (key === "amount" || key === "sale_amount")
      return typeof v === "string" || typeof v === "number"
        ? financialAmount(String(v))
        : "Not recorded";
    if (typeof v === "string" && z.uuid().safeParse(v).success)
      return names[v] ?? "Previously assigned record";
    return typeof v === "string" || typeof v === "number"
      ? String(v)
      : typeof v === "boolean"
        ? v
          ? "Yes"
          : "No"
        : "Recorded";
  };
  return Object.keys(labels)
    .filter(
      (key) =>
        (key in a || key in b) &&
        JSON.stringify(a[key]) !== JSON.stringify(b[key]),
    )
    .map((key) => ({
      label: labels[key],
      before: display(key, a[key]),
      after: display(key, b[key]),
    }));
}
export function activityDirectory(
  events: ActivityRow[],
  query: Record<string, string | string[] | undefined>,
) {
  const val = (k: string) =>
    typeof query[k] === "string" ? query[k].trim() : "";
  const q = val("activity_q").toLowerCase(),
    category = val("category"),
    from = val("from"),
    to = val("to"),
    actor = val("actor"),
    space = val("space");
  const error =
    (from && !z.iso.date().safeParse(from).success) ||
    (to && !z.iso.date().safeParse(to).success) ||
    (from && to && from > to)
      ? "Choose valid dates with an end date on or after the start date."
      : "";
  const unique = [...new Map(events.map((e) => [e.id, e])).values()];
  const filtered = error
    ? []
    : unique.filter(
        (e) =>
          (!q ||
            [e.title, e.category, e.description, e.related, e.reason, e.actor]
              .join(" ")
              .toLowerCase()
              .includes(q)) &&
          (!category ||
            category === e.category ||
            (category === "System Event" && e.category === "Operational")) &&
          (!from || e.date >= from) &&
          (!to || e.date <= to) &&
          (!actor || e.actor === actor) &&
          (!space || e.space === space),
      );
  const oldest = val("activity_sort") === "oldest";
  filtered.sort(
    (a, b) =>
      (oldest ? 1 : -1) *
      (a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
  );
  const requested = Math.max(0, parseInt(val("offset"), 10) || 0),
    offset = requested >= filtered.length ? 0 : Math.floor(requested / 50) * 50;
  return {
    all: unique,
    rows: filtered.slice(offset, offset + 50),
    count: filtered.length,
    offset,
    error,
  };
}
