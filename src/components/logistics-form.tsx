"use client";
import r3 from "./ui-r3/ui-r3.module.css";
import { PendingIndicator } from "./operation-feedback";
import { FormPending } from "./form-pending";
import { useActionState, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { logisticsAction } from "@/app/dashboard/projects/logistics-actions";
import {
  logisticsStatuses,
  type Supplier,
  type Logistics,
} from "@/lib/logistics";
import type { FormState } from "@/lib/phase1";
export function LogisticsForm({
  id,
  project,
  suppliers = [],
  supplier,
  record,
  manager = false,
  held = false,
  rebuild = false,
}: {
  rebuild?: boolean;
  id: string;
  project?: string;
  suppliers?: Supplier[];
  supplier?: Supplier;
  record?: Logistics;
  manager?: boolean;
  held?: boolean;
}) {
  const master = !project,
    label = master
      ? supplier
        ? "Update supplier"
        : "Create supplier"
      : record
        ? "Update logistics"
        : "Create logistics record";
  const [open, setOpen] = useState(false),
    [identity, setIdentity] = useState(id),
    [reset, setReset] = useState(0);
  const fid = useId();
  const [state, action, pending] = useActionState(
    async (prev: FormState, data: FormData) => {
      const r = await logisticsAction(prev, data);
      if (r.success) {
        setOpen(false);
        setReset((v) => v + 1);
        if (!record && !supplier) setIdentity(crypto.randomUUID());
      }
      return r;
    },
    { error: null },
  );
  const text = (
    name: string,
    title: string,
    value = "",
    limit = 200,
    required = false,
    multiline = false,
  ) => (
    <div className="live-field">
      <label htmlFor={`${fid}-${name}`}>
        {title}
        {required ? " *" : ""}
      </label>
      {multiline ? (
        <textarea
          id={`${fid}-${name}`}
          name={name}
          defaultValue={value}
          maxLength={limit}
          required={required}
        />
      ) : (
        <input
          id={`${fid}-${name}`}
          name={name}
          defaultValue={value}
          maxLength={limit}
          required={required}
        />
      )}
    </div>
  );
  return (
    <form
      id={fid}
      action={action}
      aria-label={label}
      aria-busy={pending}
      className="live-form"
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="id" value={identity} />
      <input
        type="hidden"
        name="version"
        value={supplier?.version ?? record?.version ?? 0}
      />
      <input type="hidden" name="project" value={project ?? ""} />
      <input
        type="hidden"
        name="intent"
        value={master ? "supplier" : "logistics"}
      />
      <input type="hidden" name="confirm" value="yes" />
      <fieldset
        disabled={pending}
        key={`${record?.version ?? supplier?.version ?? 0}-${reset}`}
        className="live-form-grid"
      >
        {master ? (
          <>
            {text("name", "Supplier name", supplier?.name, 200, true)}
            {text(
              "contact_person",
              "Contact person (optional)",
              supplier?.contact_person,
            )}
            {text(
              "contact_details",
              "Contact details (optional)",
              supplier?.contact_details,
              2000,
              false,
              true,
            )}
            <label>
              <input
                type="checkbox"
                name="active"
                defaultChecked={supplier?.active ?? true}
              />
              Active supplier
            </label>
          </>
        ) : (
          <>
            {record ? (
              <>
                <input
                  type="hidden"
                  name="supplier"
                  value={record.supplier_id}
                />
                <p>
                  Supplier: {record.supplier_name} · stable historical
                  association
                </p>
              </>
            ) : (
              <div className="live-field">
                <label htmlFor={`${fid}-supplier`}>Supplier</label>
                <select id={`${fid}-supplier`} name="supplier" required>
                  <option value="">Choose active supplier</option>
                  {suppliers
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="live-field">
              <label htmlFor={`${fid}-status`}>Logistics status</label>
              <select
                id={`${fid}-status`}
                name="status"
                defaultValue={record?.status ?? "RFP"}
              >
                {(record
                  ? held
                    ? [record.status]
                    : logisticsStatuses
                  : ["RFP"]
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            {text(
              "reference",
              "Supplier reference (optional)",
              record?.reference,
            )}
          </>
        )}
        <div className="live-field">
          <label htmlFor={`${fid}-brand`}>Brand (optional)</label>
          <select
            id={`${fid}-brand`}
            name="brand"
            defaultValue={record?.brand ?? supplier?.brand ?? ""}
          >
            <option value="">Not specified</option>
            {["SFY", "Stosa", "Both"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {text(
          "remarks",
          "Remarks (optional)",
          record?.remarks ?? supplier?.remarks,
          4000,
          false,
          true,
        )}
        {text("reason", "Change reason", "", 2000, master || !record, true)}
        {!master && manager && (
          <label>
            <input type="checkbox" name="override" />
            Documented manager override (handoff prerequisite or
            backward/terminal correction; reason required)
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
            disabled={pending}
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
              {master
                ? "Save supplier master data and append an audit event. Historical project records remain preserved."
                : "Save this operational tracking record with immutable status history. RFP is external Request for Payment monitoring only. No Raw amount, payment, installation or completion will be changed."}
            </Dialog.Description>
            {state.error && (
              <p role="alert" className="form-error">
                {state.error}
              </p>
            )}
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={pending}
                className="button button-outline"
              >
                Go back
              </button>
            </Dialog.Close>
            <button
              type="submit"
              form={fid}
              disabled={pending}
              className="button button-primary"
            >
              {pending ? "Saving logistics…" : "Confirm change"}
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
