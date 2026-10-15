"use client";
import { PendingIndicator } from "./operation-feedback";
import { FormPending } from "./form-pending";
import { useActionState, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { reviewQuotationAction } from "@/app/dashboard/projects/quotation-actions";
import type { FormState } from "@/lib/phase1";
import type { Quotation } from "@/lib/quotations";
export function QuotationReviewForm({
  quotation,
  intent,
  administrator,
}: {
  quotation: Quotation;
  intent: "submit" | "Approved" | "Returned for Revision";
  administrator: boolean;
}) {
  const [open, setOpen] = useState(false),
    [remarks, setRemarks] = useState("");
  const formId = useId(),
    remarksId = useId();
  const label =
    intent === "submit"
      ? "Submit for Review"
      : intent === "Approved"
        ? "Approve quotation"
        : "Return for Revision";
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await reviewQuotationAction(previous, data);
      if (result.success) setOpen(false);
      return result;
    },
    { error: null },
  );
  return (
    <form
      id={formId}
      action={action}
      className="live-form"
      aria-label={label}
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="project" value={quotation.project_id} />
      <input type="hidden" name="id" value={quotation.id} />
      <input type="hidden" name="version" value={quotation.edit_version} />
      <input type="hidden" name="intent" value={intent} />
      <fieldset aria-busy={pending} disabled={pending}>
        <label className="live-field" htmlFor={remarksId}>
          {intent === "Returned for Revision"
            ? "Required revision remarks"
            : administrator
              ? "Administrative reason"
              : "Remarks (optional)"}
          <textarea
            id={remarksId}
            name="remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            required={administrator || intent === "Returned for Revision"}
            maxLength={2000}
          />
        </label>
        <Dialog.Root
          open={open}
          onOpenChange={(value) => {
            if (!pending) setOpen(value);
          }}
        >
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="button button-primary"
              onClick={(e) => {
                if (!e.currentTarget.form?.reportValidity()) e.preventDefault();
              }}
            >
              {label}
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content
              className="detail-dialog"
              onEscapeKeyDown={(e) => {
                if (pending) e.preventDefault();
              }}
              onInteractOutside={(e) => {
                if (pending) e.preventDefault();
              }}
            >
              <Dialog.Title>{label}</Dialog.Title>
              <Dialog.Description>
                {intent === "submit"
                  ? "Submit every saved Space item in this quotation. Submission locks the complete version, including Space names and PHP totals. Further changes require a new draft."
                  : intent === "Approved"
                    ? "Approve this complete locked version for commercial viewing. Its submitted contents will remain unchanged."
                    : "Return this version with your remarks. Its submitted contents remain unchanged; corrections require a new draft."}
              </Dialog.Description>
              {state.error && (
                <p className="form-error" role="alert">
                  {state.error}
                </p>
              )}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="button button-outline"
                  disabled={pending}
                >
                  Go back
                </button>
              </Dialog.Close>
              <button
                type="submit"
                form={formId}
                className="button button-primary"
                disabled={pending}
              >
                {pending
                  ? "Saving decision…"
                  : intent === "submit"
                    ? "Confirm submission"
                    : intent === "Approved"
                      ? "Confirm approval"
                      : "Confirm return"}
              </button>
              <PendingIndicator pending={pending} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </fieldset>
      {state.error && !open && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="form-success" role="status">
          {state.success}
        </p>
      )}
      <FormPending />
    </form>
  );
}
