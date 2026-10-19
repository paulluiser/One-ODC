"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useActionState, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Flag,
  Info,
  MapPin,
  X,
  CheckCircle2,
} from "lucide-react";
import { installationAction } from "@/app/dashboard/projects/installation-actions";
import {
  installationStatuses,
  type Installation,
  type Readiness,
} from "@/lib/installations";
import { installationReasonRequired } from "@/lib/installation-form-validation";
import { RecordStatus } from "./record-table";
import type { FormState } from "@/lib/phase1";
import styles from "./installation-dialog.module.css";
export function InstallationActionDialog({
  project,
  space,
  name,
  installation,
  readiness,
  manager = false,
  held = false,
  administrative = false,
  handoffAcknowledged = true,
  primary = false,
}: {
  primary?: boolean;
  project: string;
  space?: string;
  name?: string;
  installation?: Installation;
  readiness?: Readiness;
  manager?: boolean;
  held?: boolean;
  administrative?: boolean;
  handoffAcknowledged?: boolean;
}) {
  const complete = !!readiness,
    title = complete
      ? "Complete project operations"
      : "Schedule or update installation",
    router = useRouter(),
    id = useId(),
    form = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false),
    [status, setStatus] = useState(installation?.status ?? "Not Scheduled"),
    [date, setDate] = useState(installation?.scheduled_date ?? ""),
    [reason, setReason] = useState(""),
    [override, setOverride] = useState(false),
    [submitted, setSubmitted] = useState(false);
  const changed =
    status !== (installation?.status ?? "Not Scheduled") ||
    date !== (installation?.scheduled_date ?? "") ||
    !!reason ||
    override;
  const reasonRequired =
    complete ||
    installationReasonRequired({
      previousStatus: installation?.status,
      status,
      previousDate: installation?.scheduled_date,
      date,
      administrative,
      override,
      handoffAcknowledged,
    });
  const errors = {
    reason:
      reasonRequired && !reason.trim()
        ? "Enter a reason for this change."
        : reason.trim().length > 2000
          ? "Use 2,000 characters or fewer."
          : "",
    date:
      !complete && status === "Scheduled" && !date
        ? "Choose a scheduled installation date."
        : "",
  };
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await installationAction(previous, data);
      if (result.success) {
        if (form.current) form.current.dataset.unsaved = "false";
        setReason("");
        setOverride(false);
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    { error: null },
  );
  const changeOpen = (next: boolean) => {
    if (pending) return;
    if (!next && changed && !window.confirm("Discard unsaved changes?")) return;
    if (next) {
      setStatus(installation?.status ?? "Not Scheduled");
      setDate(installation?.scheduled_date ?? "");
      setReason("");
      setOverride(false);
      setSubmitted(false);
    }
    setOpen(next);
  };
  return (
    <>
      <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className={`button ${complete && !primary ? "button-outline" : "button-primary"}`}
          >
            {title}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.modal}
            data-completion={complete}
            onCloseAutoFocus={(event) => {
              if (
                complete &&
                document.getElementById("operational-readiness-title")?.dataset
                  .completed === "true"
              ) {
                event.preventDefault();
                document.getElementById("operational-readiness-title")?.focus();
              }
            }}
          >
            <header className={styles.header}>
              <span className={styles.symbol}>
                {complete ? <Flag size={28} /> : <CalendarDays size={28} />}
              </span>
              <div>
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Description>
                  {complete
                    ? "Confirm all operational prerequisites before completing this project."
                    : "Changes preserve existing records and audit history."}
                </Dialog.Description>
              </div>
              <Dialog.Close
                className={styles.close}
                aria-label="Close installation action"
                disabled={pending}
              >
                <X size={20} />
              </Dialog.Close>
            </header>
            <form
              ref={form}
              action={action}
              data-unsaved={changed}
              aria-busy={pending}
              onSubmit={(e) => {
                setSubmitted(true);
                if (
                  errors.reason ||
                  errors.date ||
                  (complete && (!readiness?.ready || !readiness.can_complete))
                ) {
                  e.preventDefault();
                  document
                    .getElementById(`${id}-${errors.date ? "date" : "reason"}`)
                    ?.focus();
                }
              }}
            >
              <input type="hidden" name="project" value={project} />
              <input type="hidden" name="space" value={space ?? ""} />
              <input
                type="hidden"
                name="version"
                value={readiness?.version ?? installation?.version ?? 0}
              />
              <input
                type="hidden"
                name="cycle"
                value={readiness?.cycle ?? ""}
              />
              <input
                type="hidden"
                name="intent"
                value={complete ? "complete" : "save"}
              />
              <input type="hidden" name="confirm" value="yes" />
              <div className={styles.body}>
                {complete ? (
                  <>
                    <div className={styles.notice}>
                      <Info size={23} />
                      <div>
                        <strong>
                          This will complete the active operational cycle.
                        </strong>
                        <p>
                          Ordinary operational edits will require a Lead
                          Designer or System Administrator to reopen the
                          project. Audit history and financial monitoring remain
                          available.
                        </p>
                      </div>
                    </div>
                    <section className={styles.prerequisites}>
                      <h3>Prerequisite checklist</h3>
                      {readiness?.ready ? (
                        <p>
                          <CheckCircle2 size={19} /> All operational
                          prerequisites are satisfied.
                        </p>
                      ) : (
                        <ul>
                          {readiness?.blockers.map((b, i) => (
                            <li key={`${b.kind}-${b.id ?? i}`}>
                              {b.label}
                              {b.id && (
                                <Link
                                  onClick={() => setOpen(false)}
                                  href={
                                    b.kind === "logistics"
                                      ? `/dashboard/projects/${project}?tab=operations&logistics_detail=${b.id}#logistics-${b.id}`
                                      : b.kind === "design"
                                        ? `/dashboard/projects/${project}?tab=spaces&space_detail=${b.id}#space-${b.id}`
                                        : `/dashboard/projects/${project}?tab=operations&installation_detail=${b.id}#installation-${b.id}`
                                  }
                                >
                                  {" "}
                                  View record →
                                </Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </>
                ) : (
                  <div className={styles.context}>
                    <MapPin size={24} />
                    <div>
                      <small>Space</small>
                      <strong>{name ?? "Selected space"}</strong>
                    </div>
                    <RecordStatus>
                      {installation?.status ?? "Not Scheduled"}
                    </RecordStatus>
                  </div>
                )}
                <fieldset disabled={pending} className={styles.fields}>
                  {!complete && (
                    <>
                      <label htmlFor={`${id}-status`}>
                        Installation status
                        <select
                          id={`${id}-status`}
                          name="status"
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                        >
                          {(held
                            ? [installation?.status ?? "Not Scheduled"]
                            : installationStatuses
                          ).map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label htmlFor={`${id}-date`}>
                        Scheduled installation date{" "}
                        {status === "Scheduled" ? "(required)" : "(optional)"}
                        <input
                          id={`${id}-date`}
                          name="date"
                          type="date"
                          value={date}
                          readOnly={held}
                          required={status === "Scheduled"}
                          onChange={(e) => setDate(e.target.value)}
                          aria-invalid={submitted && !!errors.date}
                          aria-describedby={
                            submitted && errors.date
                              ? `${id}-date-error`
                              : undefined
                          }
                        />
                        {submitted && errors.date && (
                          <small
                            id={`${id}-date-error`}
                            className={styles.error}
                          >
                            {errors.date}
                          </small>
                        )}
                      </label>
                    </>
                  )}
                  <label className={styles.full} htmlFor={`${id}-reason`}>
                    {complete ? "Completion reason" : "Change reason"}{" "}
                    {reasonRequired ? "(required)" : "(optional)"}
                    <textarea
                      id={`${id}-reason`}
                      name="reason"
                      value={reason}
                      maxLength={2000}
                      required={reasonRequired}
                      placeholder={
                        complete
                          ? "Summarize why project operations are complete…"
                          : "Add context for this installation change…"
                      }
                      onChange={(e) => setReason(e.target.value)}
                      aria-invalid={submitted && !!errors.reason}
                      aria-describedby={`${id}-reason-hint`}
                    />
                    <small
                      id={`${id}-reason-hint`}
                      className={
                        submitted && errors.reason ? styles.error : undefined
                      }
                    >
                      {submitted && errors.reason
                        ? errors.reason
                        : complete
                          ? "Provide a concise summary for the operational audit history."
                          : reasonRequired
                            ? "Required for schedule changes, exceptions and audited actions."
                            : "Normal progression keeps its existing audit description."}{" "}
                      <span>{reason.length}/2000</span>
                    </small>
                  </label>
                  {!complete && manager && (
                    <label className={`${styles.full} ${styles.override}`}>
                      <input
                        type="checkbox"
                        name="override"
                        checked={override}
                        onChange={(e) => setOverride(e.target.checked)}
                      />
                      <span>
                        Documented manager handoff override
                        <small>
                          Use only when proceeding before handoff
                          acknowledgment. A reason is required.
                        </small>
                      </span>
                    </label>
                  )}
                </fieldset>
                {state.error && submitted && (
                  <p role="alert" className={styles.error}>
                    {state.error} Your entries are kept.
                  </p>
                )}
              </div>
              <footer className={styles.footer}>
                <Dialog.Close
                  className="button button-outline"
                  disabled={pending}
                >
                  Cancel
                </Dialog.Close>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={
                    pending || complete
                      ? pending ||
                        !readiness?.ready ||
                        !readiness?.can_complete ||
                        !reason.trim()
                      : !changed
                  }
                  onClick={() => setSubmitted(true)}
                >
                  {pending
                    ? "Saving…"
                    : complete
                      ? "Confirm operational completion"
                      : "Save installation"}
                </button>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {state.success && !open && (
        <p role="status" className="form-success">
          {state.success}
        </p>
      )}
    </>
  );
}
