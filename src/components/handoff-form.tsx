"use client";
import r3 from "./ui-r3/ui-r3.module.css";
import { PendingIndicator } from "./operation-feedback";
import { FormPending } from "./form-pending";
import { useActionState, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { handoffAction } from "@/app/dashboard/projects/handoff-actions";
import type { FormState } from "@/lib/phase1";
import type { CommercialHandoff } from "@/lib/handoff";
import { financialAmount } from "@/lib/finance";
export function HandoffForm({
  data,
  intent,
  rebuild = false,
}: {
  rebuild?: boolean;
  data: CommercialHandoff;
  intent: "close" | "acknowledge";
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState("");
  const id = useId();
  const label = intent === "close" ? "Close Sale" : "Acknowledge Handoff";
  const available =
    intent === "acknowledge"
      ? data.can_acknowledge
      : data.can_close &&
        data.sale?.amount !== null &&
        !!data.sale?.version &&
        !!data.primary_ops_id;
  const [state, action, pending] = useActionState(
    async (previous: FormState, values: FormData) => {
      const result = await handoffAction(previous, values);
      if (result.success) setOpen(false);
      return result;
    },
    { error: null },
  );
  return (
    <form
      id={id}
      action={action}
      className="live-form"
      aria-label={label}
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="project" value={data.project_id} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="confirm" value="yes" />
      {intent === "close" ? (
        <>
          <input type="hidden" name="stage" value={data.commercial_status} />
          <input
            type="hidden"
            name="sale_version"
            value={data.sale?.version ?? 0}
          />
          <input
            type="hidden"
            name="primary"
            value={data.primary_ops_id ?? ""}
          />
          <div className="live-field">
            <label htmlFor={`${id}-reason`}>
              {data.administrative
                ? "Required administrative reason"
                : "Remarks (optional)"}
            </label>
            <textarea
              id={`${id}-reason`}
              name="reason"
              maxLength={2000}
              required={!!data.administrative}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
            />
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="handoff" value={data.current?.id ?? ""} />
          <input
            type="hidden"
            name="version"
            value={data.current?.version ?? 0}
          />
        </>
      )}
      <Dialog.Root
        open={open}
        onOpenChange={(v) => {
          if (!pending) setOpen(v);
        }}
      >
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="button button-primary"
            disabled={!available || pending}
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
            className={`detail-dialog ${rebuild ? r3.dialog : ""}`}
            onEscapeKeyDown={(e) => {
              if (pending) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (pending) e.preventDefault();
            }}
          >
            <Dialog.Title>{label}</Dialog.Title>
            <Dialog.Description>
              {intent === "close"
                ? `Confirm the agreed Sale ${financialAmount(data.sale?.amount)} and primary Operations Admin ${data.primary_ops_id}. Closure activates assigned operational access and creates a pending handoff. It does not complete design, installation or payment settlement.`
                : "Confirm receipt of the current operational handoff. This records your acknowledgment and time; it does not complete design, installation or payment settlement."}
            </Dialog.Description>
            {state.error && (
              <p role="alert" className="form-error">
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
              form={id}
              className="button button-primary"
              disabled={pending}
            >
              {pending
                ? "Saving handoff…"
                : intent === "close"
                  ? "Confirm Close Sale"
                  : "Confirm acknowledgment"}
            </button>
            <PendingIndicator pending={pending} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {state.error && !open && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="form-success">
          {state.success}
        </p>
      )}
      <FormPending />
    </form>
  );
}
