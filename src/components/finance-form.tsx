"use client";
import { PendingIndicator } from "./operation-feedback";
import { FormPending } from "./form-pending";
import {
  Fragment,
  useActionState,
  useEffect,
  useRef,
  useId,
  useState,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { financeAction } from "@/app/dashboard/projects/finance-actions";
import type { FormState } from "@/lib/phase1";
export function FinanceForm({
  project,
  id,
  kind,
  version,
  intent,
  label,
  reasonRequired,
  children,
}: {
  project: string;
  id: string;
  kind: string;
  version: number;
  intent: "value" | "save" | "void";
  label: string;
  reasonRequired: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [identity, setIdentity] = useState(id),
    [reset, setReset] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const formId = useId(),
    reasonId = useId();
  const [state, action, pending] = useActionState(
    async (prev: FormState, data: FormData) => {
      const result = await financeAction(prev, data);
      if (result.success) {
        setOpen(false);
        setReset((n) => n + 1);
        if (intent === "save" && version === 0)
          setIdentity(crypto.randomUUID());
      }
      return result;
    },
    { error: null },
  );
  useEffect(() => {
    // Radix may close while the fieldset is still disabled by the action.
    if (state.success && !pending) trigger.current?.focus();
  }, [state.success, pending]);
  return (
    <form
      id={formId}
      action={action}
      aria-label={label}
      className="live-form"
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="id" value={identity} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="version" value={version} />
      <fieldset
        aria-busy={pending}
        disabled={pending}
        className="live-form-grid"
      >
        {/* Reset fields without remounting the dialog trigger needed for return focus. */}
        <Fragment key={`${version}-${reset}`}>
          {children}
          <label className="live-field span-all" htmlFor={reasonId}>
            {reasonRequired
              ? "Required change reason"
              : "Reason (optional for initial entry)"}
            <textarea
              id={reasonId}
              name="reason"
              maxLength={2000}
              required={reasonRequired}
            />
          </label>
        </Fragment>
        <Dialog.Root
          open={open}
          onOpenChange={(v) => {
            if (!pending) setOpen(v);
          }}
        >
          <Dialog.Trigger asChild>
            <button
              ref={trigger}
              type="button"
              className="button button-outline"
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
              onCloseAutoFocus={(e) => {
                const heading = document.getElementById(`payment-${id}`);
                if (intent === "void" && heading?.dataset.voided === "true") {
                  e.preventDefault();
                  heading.focus();
                }
              }}
              onEscapeKeyDown={(e) => {
                if (pending) e.preventDefault();
              }}
              onInteractOutside={(e) => {
                if (pending) e.preventDefault();
              }}
            >
              <Dialog.Title>{label}</Dialog.Title>
              <Dialog.Description>
                {intent === "void"
                  ? "Exclude this payment from valid totals. The original record and its full history remain preserved. Voiding is not reversible in this batch."
                  : "Save this financial entry and record its actor, time and reason in the audit history. Quotation, Sale, Raw and commercial stage remain independent."}
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
                form={formId}
                className="button button-primary"
                disabled={pending}
              >
                {pending
                  ? "Saving financial record…"
                  : "Confirm financial change"}
              </button>
              <PendingIndicator pending={pending} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </fieldset>
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

export function PaymentHeading({
  id,
  voided,
  children,
}: {
  id: string;
  voided: boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const wasVoided = useRef(voided);
  useEffect(() => {
    // The server removes editing forms on void; the preserved record owns focus.
    if (voided && !wasVoided.current) heading.current?.focus();
    wasVoided.current = voided;
  }, [voided]);
  return (
    <h3 id={`payment-${id}`} ref={heading} tabIndex={-1} data-voided={voided}>
      {children}
    </h3>
  );
}
