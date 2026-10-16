import { z } from "zod";
export const commercialStages = [
  "For Quotation",
  "Under Negotiation",
  "Closed",
  "Lost",
] as const;
export const projectSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  name: z.string(),
  lead_designer_id: z.uuid(),
  commercial_status: z.enum(commercialStages),
  awaiting_handoff: z.boolean().optional(),
  expected_handoff: z.string().nullable(),
  created_at: z.string(),
});
export const projectColumns =
  "id,reference,name,lead_designer_id,commercial_status,awaiting_handoff,expected_handoff,created_at";
export function projectDirectoryOptions(input: Record<string, unknown>) {
  const text = (key: string) =>
    typeof input[key] === "string" ? (input[key] as string) : "";
  const parsed = Number.parseInt(text("page"), 10);
  return {
    q: text("q").trim().slice(0, 200),
    searchBy:
      text("by") === "reference" ? ("reference" as const) : ("name" as const),
    stage: commercialStages.find((stage) => stage === text("stage")) ?? "",
    sort: text("sort") === "name" ? ("name" as const) : ("newest" as const),
    page: Number.isFinite(parsed) ? Math.min(100000, Math.max(1, parsed)) : 1,
  };
}
export function projectDirectoryUrl(
  options: ReturnType<typeof projectDirectoryOptions>,
  page: number,
) {
  const params = new URLSearchParams({
    q: options.q,
    by: options.searchBy,
    stage: options.stage,
    sort: options.sort,
    page: String(page),
  });
  return `/dashboard/projects?${params}`;
}
export function projectSearchPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}
