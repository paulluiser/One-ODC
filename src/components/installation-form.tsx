"use client";
import { PendingIndicator } from "./operation-feedback";
import { FormPending } from "./form-pending";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { installationAction } from "@/app/dashboard/projects/installation-actions";
import {
  installationStatuses,
  type Installation,
  type Readiness,
} from "@/lib/installations";
import type { FormState } from "@/lib/phase1";
export function InstallationForm({
  project,
  space,
  installation,
  readiness,
  manager = false,
  held = false,
}: {
  project: string;
  space?: string;
  installation?: Installation;
  readiness?: Readiness;
  manager?: boolean;
  held?: boolean;
}) {
  const complete = !!readiness,
    label = complete ? "Confirm Operational Completion" : "Save installation";
  const [open, setOpen] = useState(false);
  const id = useId();
  const [state, action, pending] = useActionState(
    async (prev: FormState, data: FormData) => {
      const r = await installationAction(prev, data);
      if (r.success) setOpen(false);
      return r;
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
      <input type="hidden" name="project" value={project} />
      <input
        type="hidden"
        name="version"
        value={readiness?.version ?? installation?.version ?? 0}
      />
      <input
        type="hidden"
        name="intent"
        value={complete ? "complete" : "save"}
      />
      <input type="hidden" name="confirm" value="yes" />
      <fieldset
        disabled={pending}
        key={readiness?.version ?? installation?.version ?? 0}
        className="live-form-grid"
      >
        {complete ? (
          <input type="hidden" name="cycle" value={readiness?.cycle ?? ""} />
        ) : (
          <>
            <input type="hidden" name="space" value={space} />
            <div className="live-field">
              <label htmlFor={`${id}-status`}>Installation status</label>
              <select
                id={`${id}-status`}
                name="status"
                defaultValue={installation?.status ?? "Not Scheduled"}
              >
                {(held
                  ? [installation?.status ?? "Not Scheduled"]
                  : installationStatuses
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="live-field">
              <label htmlFor={`${id}-date`}>Scheduled installation date</label>
              <input
                id={`${id}-date`}
                type="date"
                name="date"
                defaultValue={installation?.scheduled_date ?? ""}
                readOnly={held}
              />
            </div>
          </>
        )}
        <div className="live-field">
          <label htmlFor={`${id}-reason`}>
            {complete ? "Required completion reason" : "Change reason"}
          </label>
          <textarea
            id={`${id}-reason`}
            name="reason"
            maxLength={2000}
            required={complete}
          />
        </div>
        {!complete && manager && (
          <label>
            <input type="checkbox" name="override" />
            Documented manager handoff override (reason required)
          </label>
        )}
      </fieldset>
      <Dialog.Root
        open={open}
        onOpenChange={(v) => {
          if (!pending) setOpen(v);
        }}
      >
        <Dialog.Trigger asChild>
          <button
            type="button"
            disabled={pending || (complete && !readiness?.ready)}
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
            onCloseAutoFocus={(event) => {
              const heading = document.getElementById(
                "operational-readiness-title",
              );
              if (complete && heading?.dataset.completed === "true") {
                event.preventDefault();
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
              {complete
                ? "Confirm all operational prerequisites. The active cycle will close, aging will stop and ordinary operational editing will require reopening. Outstanding payments do not block completion; financial monitoring continues."
                : "Record installation independently of design and logistics. Scheduling changes, exceptions, Not Applicable and reopening require reasons. Completion timestamps and prior states remain audited."}
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
                ? "Saving installation…"
                : complete
                  ? "Confirm completion"
                  : "Confirm installation change"}
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

// Completion removes its action form; preserve a stable focus target after the RSC update.
export function InstallationReadinessHeading({
  completed,
}: {
  completed: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null),
    previous = useRef(completed);
  useEffect(() => {
    if (completed && !previous.current) heading.current?.focus();
    previous.current = completed;
  }, [completed]);
  return (
    <h3
      id="operational-readiness-title"
      data-completed={completed}
      tabIndex={-1}
      ref={heading}
    >
      Operational readiness
    </h3>
  );
}
