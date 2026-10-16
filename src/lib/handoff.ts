export type HandoffRecord = {
  id: string;
  project_id: string;
  number: number;
  version: number;
  primary_ops_id: string;
  assigned_by: string;
  assigned_at: string;
  reason: string;
  status: "Pending Acknowledgment" | "Acknowledged";
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  superseded_at: string | null;
};
export type CommercialHandoff = {
  project_id: string;
  commercial_status: "For Quotation" | "Under Negotiation" | "Closed" | "Lost";
  cancelled: boolean;
  closed_at: string | null;
  status: string;
  age_days: number | null;
  can_acknowledge: boolean;
  current: HandoffRecord | null;
  history: HandoffRecord[];
  events: {
    id: string;
    action: string;
    actor_id: string;
    occurred_at: string;
    reason: string;
  }[];
  sale?: { amount: string | null; version: number };
  closure?: {
    id: string;
    closed_by: string;
    closed_at: string;
    sale_amount: string;
    reason: string;
    administrative_override: boolean;
  } | null;
  primary_ops_id?: string | null;
  can_close?: boolean;
  administrative?: boolean;
};
export function handoffError(message: string): string {
  if (message.includes("PROJECT_LOST"))
    return "This project is Lost. All project records are read-only.";
  const errors: Record<string, string> = {
    SALE_REQUIRED: "Record the agreed Sale before closing.",
    OPERATIONS_ADMIN_REQUIRED:
      "Ask the Lead Designer or System Administrator to assign an active primary Operations Admin before closure.",
    STALE_CLOSURE_CONTEXT:
      "Sale or Operations assignment changed. Reload and confirm the latest details before retrying.",
    SALE_ALREADY_CLOSED:
      "This sale is already closed. Reload to see its handoff history.",
    HANDOFF_ALREADY_ACKNOWLEDGED:
      "This handoff has already been acknowledged. Reload to see its recorded receipt.",
    REASON_REQUIRED: "Administrative closure requires a documented reason.",
    CONFIRMATION_REQUIRED: "Explicit confirmation is required.",
    PROJECT_CANCELLED: "Cancelled projects cannot be commercially closed.",
    ACCESS_DENIED:
      "You do not have permission for this closure or handoff. Reload to check your current assignment.",
  };
  return (
    Object.entries(errors).find(([key]) => message.includes(key))?.[1] ??
    "The action could not be saved. Your entries are kept; please retry."
  );
}
