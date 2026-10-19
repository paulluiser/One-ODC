"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useActionState, useRef, useState, useId } from "react";
import { useRouter } from "next/navigation";
import { Truck, X, Plus } from "lucide-react";
import { logisticsAction } from "@/app/dashboard/projects/logistics-actions";
import {
  type Logistics,
  type Supplier,
  logisticsDataSchema,
} from "@/lib/logistics";
import {
  allowedLogisticsStatuses,
  logisticsReasonRequired,
  logisticsOverrideRequired,
} from "@/lib/logistics-form-validation";
import type { FormState } from "@/lib/phase1";
import { RecordStatus } from "./record-table";
import styles from "./installation-dialog.module.css";
export function LogisticsActionDialog({
  id,
  project,
  record,
  suppliers,
  manager,
  held = false,
  administrative = false,
  handoffAcknowledged = true,
}: {
  id: string;
  project: string;
  record?: Logistics;
  suppliers: Supplier[];
  manager: boolean;
  held?: boolean;
  administrative?: boolean;
  handoffAcknowledged?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [identity, setIdentity] = useState(id),
    [status, setStatus] = useState<string>(record?.status ?? "RFP"),
    [supplier, setSupplier] = useState(record?.supplier_id ?? ""),
    [reference, setReference] = useState(record?.reference ?? ""),
    [brand, setBrand] = useState<string>(record?.brand ?? ""),
    [remarks, setRemarks] = useState(record?.remarks ?? ""),
    [reason, setReason] = useState(""),
    [override, setOverride] = useState(false),
    [submitted, setSubmitted] = useState(false);
  const router = useRouter(),
    fid = useId(),
    form = useRef<HTMLFormElement>(null),
    title = record ? "Edit logistics / change status" : "Add logistics record";
  const changed = !record
    ? !!supplier || !!reference || !!brand || !!remarks || !!reason || override
    : status !== record.status ||
      reference !== record.reference ||
      brand !== (record.brand ?? "") ||
      remarks !== record.remarks ||
      !!reason ||
      override;
  const reasonRequired = logisticsReasonRequired(
    record,
    status,
    administrative,
    override,
    handoffAcknowledged,
  );
  const choices = allowedLogisticsStatuses(
    record,
    held,
    manager,
    override,
    handoffAcknowledged,
  );
  const errors: Record<string, string> = {};
  const parsed = logisticsDataSchema.safeParse({
    status,
    reference,
    brand,
    remarks,
  });
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      errors[String(issue.path[0])] = issue.message;
  if (!supplier) errors.supplier = "Choose an active supplier.";
  if (reasonRequired && !reason.trim())
    errors.reason = "Enter a reason for this change.";
  if (reason.length > 2000) errors.reason = "Use 2,000 characters or fewer.";
  if (
    logisticsOverrideRequired(record, status, handoffAcknowledged) &&
    (!manager || !override)
  )
    errors.override = "A documented manager override and reason are required.";
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await logisticsAction(previous, data);
      if (result.success) {
        if (form.current) form.current.dataset.unsaved = "false";
        setOpen(false);
        setReason("");
        if (!record) setIdentity(crypto.randomUUID());
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
      setStatus(record?.status ?? "RFP");
      setSupplier(record?.supplier_id ?? "");
      setReference(record?.reference ?? "");
      setBrand(record?.brand ?? "");
      setRemarks(record?.remarks ?? "");
      setReason("");
      setOverride(false);
      setSubmitted(false);
    }
    setOpen(next);
  };
  const fieldError = (name: string) =>
    submitted && errors[name] ? (
      <small id={`${fid}-${name}-error`} className={styles.error}>
        {errors[name]}
      </small>
    ) : null;
  return (
    <>
      <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Trigger asChild>
          <button type="button" className="button button-primary">
            {!record && <Plus size={17} aria-hidden="true" />}
            {title}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.modal}>
            <header className={styles.header}>
              <span className={styles.symbol}>
                <Truck size={26} />
              </span>
              <div>
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Description>
                  Update logistics details and preserve the existing audit
                  history. Financial records remain independent.
                </Dialog.Description>
              </div>
              <Dialog.Close
                className={styles.close}
                aria-label="Close logistics action"
                disabled={pending}
              >
                <X size={20} />
              </Dialog.Close>
            </header>
            <form
              ref={form}
              action={action}
              aria-busy={pending}
              data-unsaved={changed}
              onSubmit={(e) => {
                setSubmitted(true);
                if (Object.keys(errors).length) {
                  e.preventDefault();
                  document
                    .getElementById(`${fid}-${Object.keys(errors)[0]}`)
                    ?.focus();
                }
              }}
            >
              <input type="hidden" name="intent" value="logistics" />
              <input type="hidden" name="id" value={identity} />
              <input type="hidden" name="project" value={project} />
              <input
                type="hidden"
                name="version"
                value={record?.version ?? 0}
              />
              <input type="hidden" name="confirm" value="yes" />
              <div className={styles.body}>
                {record && (
                  <div className={styles.context}>
                    <Truck size={24} />
                    <div>
                      <strong>{record.supplier_name}</strong>
                      <small>
                        Reference: {record.reference || "Not provided"}
                        <br />
                        Brand: {record.brand || "Not specified"}
                      </small>
                    </div>
                    <RecordStatus>{record.status}</RecordStatus>
                  </div>
                )}
                <fieldset className={styles.fields} disabled={pending}>
                  {record ? (
                    <input
                      type="hidden"
                      name="supplier"
                      value={record.supplier_id}
                    />
                  ) : (
                    <label className={styles.full} htmlFor={`${fid}-supplier`}>
                      Supplier (required)
                      <select
                        id={`${fid}-supplier`}
                        name="supplier"
                        value={supplier}
                        required
                        onChange={(e) => setSupplier(e.target.value)}
                        aria-invalid={submitted && !!errors.supplier}
                      >
                        <option value="">Choose active supplier</option>
                        {suppliers
                          .filter((s) => s.active)
                          .map((s) => (
                            <option value={s.id} key={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                      {fieldError("supplier")}
                    </label>
                  )}
                  <label htmlFor={`${fid}-status`}>
                    Logistics status (required)
                    <select
                      id={`${fid}-status`}
                      name="status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      {choices.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    {fieldError("status")}
                  </label>
                  <label htmlFor={`${fid}-reference`}>
                    Supplier reference (optional)
                    <input
                      id={`${fid}-reference`}
                      name="reference"
                      value={reference}
                      maxLength={200}
                      onChange={(e) => setReference(e.target.value)}
                    />
                    {fieldError("reference")}
                  </label>
                  <label className={styles.full} htmlFor={`${fid}-brand`}>
                    Brand (optional)
                    <select
                      id={`${fid}-brand`}
                      name="brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                    >
                      <option value="">Not specified</option>
                      {["SFY", "Stosa", "Both"].map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                    {fieldError("brand")}
                  </label>
                  <label htmlFor={`${fid}-remarks`}>
                    Remarks (optional)
                    <textarea
                      id={`${fid}-remarks`}
                      name="remarks"
                      value={remarks}
                      maxLength={4000}
                      onChange={(e) => setRemarks(e.target.value)}
                    />
                    {fieldError("remarks")}
                  </label>
                  <label htmlFor={`${fid}-reason`}>
                    Change reason {reasonRequired ? "(required)" : "(optional)"}
                    <textarea
                      id={`${fid}-reason`}
                      name="reason"
                      value={reason}
                      required={reasonRequired}
                      maxLength={2000}
                      onChange={(e) => setReason(e.target.value)}
                      aria-invalid={submitted && !!errors.reason}
                      aria-describedby={`${fid}-reason-help`}
                    />
                    <small id={`${fid}-reason-help`}>
                      {reasonRequired
                        ? "Required for creation, metadata corrections, skipped stages and exceptions."
                        : "Normal forward progression retains its existing audit description."}{" "}
                      {reason.length}/2000
                    </small>
                    {fieldError("reason")}
                  </label>
                  {manager && (
                    <label className={`${styles.full} ${styles.override}`}>
                      <input
                        id={`${fid}-override`}
                        type="checkbox"
                        name="override"
                        checked={override}
                        onChange={(e) => {
                          setOverride(e.target.checked);
                          if (
                            !allowedLogisticsStatuses(
                              record,
                              held,
                              manager,
                              e.target.checked,
                              handoffAcknowledged,
                            ).includes(status)
                          )
                            setStatus(record?.status ?? "RFP");
                        }}
                      />
                      <span>
                        Documented manager override
                        <small>
                          Required for handoff exceptions and backward or
                          terminal corrections. A reason is required.
                        </small>
                        {fieldError("override")}
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
                  type="submit"
                  className="button button-primary"
                  disabled={pending || !changed}
                  onClick={() => setSubmitted(true)}
                >
                  {pending
                    ? "Saving logistics…"
                    : record
                      ? "Update logistics"
                      : "Create logistics record"}
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
