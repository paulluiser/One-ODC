import { z } from "zod";
export const logisticsStatuses = [
  "RFP",
  "Supplier Adjustments",
  "For Manufacturing",
  "In Transit",
  "Landed",
  "For Delivery",
  "Delivered",
  "On Hold",
  "Cancelled",
] as const;
export const supplierDataSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.enum(["", "SFY", "Stosa", "Both"]),
  contact_person: z.string().max(200),
  contact_details: z.string().max(2000),
  remarks: z.string().max(4000),
  active: z.boolean(),
});
export const logisticsDataSchema = z.object({
  status: z.enum(logisticsStatuses),
  brand: z.enum(["", "SFY", "Stosa", "Both"]),
  reference: z.string().max(200),
  remarks: z.string().max(4000),
});
export type Supplier = z.infer<typeof supplierDataSchema> & {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
};
export type Logistics = z.infer<typeof logisticsDataSchema> & {
  id: string;
  project_id: string;
  supplier_id: string;
  supplier_name: string;
  version: number;
  status_at: string;
  created_by: string;
  updated_by: string;
  held_status: string | null;
};
export type LogisticsEvent = {
  id: string;
  logistics_id: string;
  version: number;
  action: string;
  actor_id: string;
  reason: string;
  occurred_at: string;
  administrative_override: boolean;
  previous_value: unknown;
  new_value: unknown;
};
export function logisticsError(message: string): string {
  const errors: Record<string, string> = {
    DUPLICATE_SUPPLIER:
      "A supplier with this name already exists. Use the existing record or clarify the name.",
    INACTIVE_SUPPLIER:
      "Select an active supplier. Inactive suppliers remain in historical records.",
    HANDOFF_REQUIRED:
      "The current handoff must be acknowledged. A Lead Designer or System Administrator may record an explicit reasoned override.",
    MANAGER_OVERRIDE_REQUIRED:
      "Backward corrections and reopening Delivered or Cancelled records require a documented manager override.",
    PROJECT_HELD:
      "This Project is On Hold. New records and status transitions are blocked; existing metadata may be corrected.",
    PROJECT_CANCELLED: "Cancelled Projects cannot receive logistics activity.",
    VERSION_CONFLICT:
      "This record changed elsewhere. Reload before retrying; your entries are kept.",
    ACCESS_DENIED:
      "You do not have permission to change this supplier or Project logistics record.",
    REASON_REQUIRED:
      "A reason is required for creation, skipped stages, exceptions, corrections or administrative overrides.",
    INITIAL_STATUS_RFP:
      "New logistics records start at RFP (Request for Payment monitoring only).",
    HISTORY_IMMUTABLE:
      "Historical identities and events cannot be overwritten.",
  };
  return (
    Object.entries(errors).find(([key]) => message.includes(key))?.[1] ??
    "Check the fields and retry. The record could not be saved; your entries are kept."
  );
}
