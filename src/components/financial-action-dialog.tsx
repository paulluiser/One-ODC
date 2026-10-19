"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, TriangleAlert } from "lucide-react";
import { financeAction } from "@/app/dashboard/projects/finance-actions";
import {
  financialAmount,
  type Payment,
  type FinancialValue,
} from "@/lib/finance";
import {
  financialFormErrors,
  type FinancialDraft,
} from "@/lib/financial-form-validation";
import type { FormState } from "@/lib/phase1";
import styles from "./financial-workspace.module.css";
export type FinancialAction =
  | { kind: "Sale" | "Raw"; value: FinancialValue }
  | { kind: "client" | "supplier"; payment?: Payment; void?: boolean };
export function FinancialActionDialog({
  project,
  projectName,
  today,
  admin,
  action: operation,
  onClose,
  onSaved,
}: {
  project: string;
  projectName: string;
  today: string;
  admin: boolean;
  action: FinancialAction;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter(),
    prefix = useId();
  const isValue = "value" in operation;
  const payment = "payment" in operation ? operation.payment : undefined;
  const intent = isValue
    ? "value"
    : "void" in operation && operation.void
      ? "void"
      : "save";
  const title = isValue
    ? `Adjust ${operation.kind}`
    : `${intent === "void" ? "Void" : payment ? "Correct" : "Add"} ${operation.kind} payment`;
  const [version] = useState(
    isValue ? operation.value.version : (payment?.version ?? 0),
  );
  const [identity] = useState(() =>
    isValue ? project : (payment?.id ?? crypto.randomUUID()),
  );
  const [draft, setDraft] = useState<FinancialDraft>({
    amount: isValue ? (operation.value.amount ?? "") : (payment?.amount ?? ""),
    payment_date: payment?.payment_date ?? today,
    method: payment?.method ?? "",
    reference: payment?.reference ?? "",
    remarks: payment?.remarks ?? "",
    reason: "",
  });
  const [initial] = useState(JSON.stringify(draft));
  const dirty = initial !== JSON.stringify(draft);
  const reasonRequired =
    intent === "void" ||
    !!payment ||
    admin ||
    (isValue && (operation.kind === "Raw" || version > 0));
  const errors = financialFormErrors(draft, intent, today, reasonRequired);
  const [state, submit, pending] = useActionState(financeAction, {
    error: null,
  } as FormState);
  const form = useRef<HTMLFormElement>(null),
    done = useRef(false);
  useEffect(() => {
    if (state.success && !pending && !done.current) {
      done.current = true;
      form.current?.dispatchEvent(
        new Event("one-odc:saved", { bubbles: true }),
      );
      onSaved?.();
      onClose();
      router.refresh();
    }
  }, [state.success, pending, onClose, onSaved, router]);
  const close = () => {
    if (
      !pending &&
      (!dirty || window.confirm("Discard unsaved financial changes?"))
    ) {
      if (form.current) form.current.dataset.unsaved = "false";
      onClose();
    }
  };
  const field = (
    key: keyof FinancialDraft,
    label: string,
    required = false,
    multiline = false,
  ) => (
    <label className={styles.field} htmlFor={`${prefix}-${key}`}>
      {label}
      {required ? " *" : ""}
      {multiline ? (
        <textarea
          id={`${prefix}-${key}`}
          name={key}
          rows={3}
          maxLength={2000}
          required={required}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          aria-invalid={!!draft[key] && !!errors[key]}
          aria-describedby={
            errors[key] && draft[key] ? `${prefix}-${key}-error` : undefined
          }
        />
      ) : (
        <input
          id={`${prefix}-${key}`}
          name={key}
          type={key === "payment_date" ? "date" : "text"}
          inputMode={key === "amount" ? "decimal" : undefined}
          max={key === "payment_date" ? today : undefined}
          maxLength={
            key === "method" ? 100 : key === "reference" ? 200 : undefined
          }
          required={required}
          value={draft[key]}
          placeholder={
            key === "amount"
              ? "0.00"
              : key === "reference"
                ? "OR, check or bank reference…"
                : undefined
          }
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          aria-invalid={!!draft[key] && !!errors[key]}
          aria-describedby={
            errors[key] && draft[key] ? `${prefix}-${key}-error` : undefined
          }
        />
      )}
      {errors[key] && draft[key] && (
        <small id={`${prefix}-${key}-error`} className={styles.error}>
          {errors[key]}
        </small>
      )}
      {multiline && (
        <small className={styles.counter}>{draft[key].length}/2000</small>
      )}
    </label>
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.modalOverlay} />
        <Dialog.Content
          className={styles.modal}
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <header className={styles.modalHeader}>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {intent === "void"
                  ? "Exclude this payment from valid totals. The record and history remain preserved. Voiding cannot be reversed."
                  : isValue
                    ? "Update the commercial value while preserving its adjustment history."
                    : payment
                      ? "Correct the existing payment. Its identity and original values remain in the audit history."
                      : `Record an actual ${operation.kind === "client" ? "client receipt to ODC" : "payment from ODC to a supplier"}.`}
              </Dialog.Description>
            </div>
            <button
              className={styles.close}
              type="button"
              onClick={close}
              disabled={pending}
              aria-label={`Close ${title}`}
            >
              <X size={20} />
            </button>
          </header>
          <form
            ref={form}
            action={submit}
            data-unsaved={dirty}
            aria-busy={pending}
          >
            <input type="hidden" name="project" value={project} />
            <input type="hidden" name="id" value={identity} />
            <input type="hidden" name="kind" value={operation.kind} />
            <input type="hidden" name="intent" value={intent} />
            <input type="hidden" name="version" value={version} />
            <div className={styles.modalBody}>
              <div className={styles.context}>
                <div>
                  <small>Project</small>
                  <strong>{projectName}</strong>
                </div>
                {(payment || isValue) && (
                  <div>
                    <small>
                      {isValue ? "Current amount" : "Original payment"}
                    </small>
                    <strong>
                      {financialAmount(
                        isValue ? operation.value.amount : payment?.amount,
                      )}
                    </strong>
                    {payment && (
                      <small>
                        {payment.payment_date} · {payment.method}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </small>
                    )}
                  </div>
                )}
              </div>
              {intent === "void" && (
                <p className={styles.warning}>
                  <TriangleAlert size={20} aria-hidden="true" />
                  This payment will be excluded from valid totals. Its history
                  will be retained.
                </p>
              )}
              <fieldset disabled={pending}>
                {intent !== "void" &&
                  (isValue ? (
                    field("amount", "New amount (PHP)", true)
                  ) : (
                    <>
                      <div className={styles.columns}>
                        {field("payment_date", "Payment date", true)}
                        {field(
                          "amount",
                          payment ? "Corrected amount (PHP)" : "Amount (PHP)",
                          true,
                        )}
                        {field("method", "Payment method", true)}
                        {field("reference", "Reference (optional)")}
                      </div>
                      {field("remarks", "Remarks (optional)", false, true)}
                    </>
                  ))}
                {field(
                  "reason",
                  reasonRequired
                    ? "Required change reason"
                    : "Change reason (optional for initial entry)",
                  reasonRequired,
                  true,
                )}
              </fieldset>
              {state.error && (
                <p className={styles.error} role="alert">
                  {state.error}
                </p>
              )}
            </div>
            <footer className={styles.modalFooter}>
              <button
                className="button button-outline"
                type="button"
                onClick={close}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                className={`button button-primary ${intent === "void" ? styles.destructive : ""}`}
                type="submit"
                disabled={
                  pending ||
                  !!Object.keys(errors).length ||
                  (isValue && draft.amount === operation.value.amount)
                }
              >
                {pending
                  ? "Saving…"
                  : intent === "void"
                    ? "Void payment"
                    : isValue
                      ? "Save adjustment"
                      : payment
                        ? "Save correction"
                        : `Record ${operation.kind} payment`}
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
