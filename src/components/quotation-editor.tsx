"use client";
import { ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import styles from "./ui-r3/ui-r3.module.css";
import quoteStyles from "./ui-r3/quotation-workspace.module.css";
import { quotationDraftErrors } from "@/lib/quotation-draft-validation";
import { RecordTable } from "./record-table";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { mutateQuotation } from "@/app/dashboard/projects/quotation-actions";
import {
  formatCentavos,
  formatPHP,
  lineCentavos,
  type Quotation,
  type QuotationItem,
  type QuotationSpace,
} from "@/lib/quotations";
export function CreateQuotation({
  project,
  label = "Create quotation draft",
}: {
  project: string;
  label?: string;
}) {
  const [state, action, pending] = useActionState(mutateQuotation, {
    error: null,
  });
  return (
    <form action={action} className="live-form">
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="project" value={project} />
      <button className="button button-primary" disabled={pending}>
        {pending ? "Creating draft…" : label}
      </button>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
export function QuotationSpaceEditor({
  quotation,
  space,
  rebuild = false,
  dialog = false,
  onSaved,
  onCancel,
}: {
  dialog?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  rebuild?: boolean;
  quotation: Quotation;
  space: QuotationSpace;
}) {
  const latestInitial = space.items.map(
    ({ id, description, quantity, unit_price }) => ({
      id,
      description,
      quantity,
      unit_price,
    }),
  );
  const [openingItems] = useState(latestInitial);
  const [openingVersion] = useState(quotation.edit_version);
  const initial = dialog ? openingItems : latestInitial;
  const [items, setItems] = useState<QuotationItem[]>(initial);
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(
    async (previous: import("@/lib/phase1").FormState, data: FormData) => {
      const result = await mutateQuotation(previous, data);
      return result;
    },
    { error: null },
  );
  const savedCallback = useRef(onSaved);
  useEffect(() => {
    savedCallback.current = onSaved;
  }, [onSaved]);
  useEffect(() => {
    if (state.success) savedCallback.current?.();
  }, [state]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty =
    JSON.stringify(items) !== JSON.stringify(initial) || reason !== "";
  const prefix = useId();
  const [savedVersion, setSavedVersion] = useState(quotation.edit_version);
  if (!dialog && savedVersion !== quotation.edit_version) {
    setSavedVersion(quotation.edit_version);
    setItems(initial);
    setReason("");
  }
  useEffect(() => {
    if (dialog || !dirty || pending) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const navigate = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.("a[href]");
      if (a && !window.confirm("Leave with unsaved quotation changes?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dialog, dirty, pending]);
  const amounts = items.map((i) => lineCentavos(i.quantity, i.unit_price));
  const estimate = amounts.every((a) => a !== null)
    ? amounts.reduce<bigint>((sum, a) => sum + (a ?? 0n), 0n)
    : null;
  const validation = quotationDraftErrors(items, reason);
  const subtotal =
    estimate === null ? "Check quantity and price" : formatCentavos(estimate);
  function addItem() {
    const id = crypto.randomUUID();
    setItems((old) => [
      ...old,
      { id, description: "", quantity: "1", unit_price: "0" },
    ]);
    requestAnimationFrame(() =>
      document.getElementById(`${prefix}-${id}-description`)?.focus(),
    );
  }
  function edit(
    index: number,
    field: keyof Omit<QuotationItem, "id">,
    value: string,
  ) {
    const next = items.map((i, n) =>
      n === index ? { ...i, [field]: value } : i,
    );
    setItems(next);
    if (Object.keys(errors).length)
      setErrors(quotationDraftErrors(next, reason));
  }
  function move(index: number, delta: number) {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setItems(next);
  }
  return (
    <form
      action={action}
      className={`live-form ${rebuild ? styles.editorForm : ""} ${dialog ? quoteStyles.editorForm : ""}`}
      data-unsaved={dirty}
      aria-busy={pending}
      onBlur={(e) => {
        const id = (e.target as HTMLElement).id;
        if (!id.startsWith(`${prefix}-`)) return;
        const key = id
          .slice(prefix.length + 1)
          .replace(/-price$/, "-unit_price");
        setErrors((old) => {
          const next = { ...old };
          if (validation[key]) next[key] = validation[key];
          else delete next[key];
          return next;
        });
      }}
      onInvalidCapture={() => setErrors(quotationDraftErrors(items, reason))}
      onSubmit={(e) => {
        const next = quotationDraftErrors(items, reason);
        setErrors(next);
        if (Object.keys(next).length) {
          e.preventDefault();
          document
            .getElementById(
              `${prefix}-${Object.keys(next)[0].replace(/-unit_price$/, "-price")}`,
            )
            ?.focus();
        }
      }}
      onReset={(e) => e.preventDefault()}
      aria-label={`Edit quotation: ${space.name}`}
    >
      <input type="hidden" name="project" value={quotation.project_id} />
      <input type="hidden" name="draft" value={quotation.id} />
      <input type="hidden" name="space" value={space.id} />
      <input
        type="hidden"
        name="version"
        value={dialog ? openingVersion : quotation.edit_version}
      />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <fieldset
        disabled={pending}
        className={
          dialog
            ? quoteStyles.editorFields
            : rebuild
              ? styles.editor
              : undefined
        }
      >
        <legend className={dialog ? "sr-only" : "field-hint"}>
          Items for {space.name}
        </legend>
        {dialog && (
          <div className={quoteStyles.editorSummary}>
            <div>
              <small>Space</small>
              <strong>{space.name}</strong>
            </div>
            <div>
              <small>Items</small>
              <strong>
                {items.length} {items.length === 1 ? "item" : "items"}
              </strong>
            </div>
            <div aria-live="polite">
              <small>
                {dirty
                  ? "Unsaved draft subtotal (PHP)"
                  : "Draft subtotal (PHP)"}
              </small>
              <strong>{subtotal}</strong>
            </div>
            <button
              type="button"
              className="button button-outline"
              disabled={items.length >= 200}
              onClick={addItem}
            >
              <Plus size={16} aria-hidden="true" />
              Add item
            </button>
          </div>
        )}
        {rebuild ? (
          <RecordTable label={`Editable items for ${space.name}`}>
            <table
              className={`live-table ${dialog ? quoteStyles.itemTable : styles.editTable}`}
            >
              <caption className="sr-only">
                Quotation items for {space.name}
              </caption>
              <thead>
                <tr>
                  {dialog && <th scope="col">#</th>}
                  <th scope="col">Description{dialog ? " *" : ""}</th>
                  <th scope="col">Quantity{dialog ? " *" : ""}</th>
                  <th scope="col">Unit price (PHP){dialog ? " *" : ""}</th>
                  <th scope="col">Amount{dialog ? " (PHP)" : ""}</th>
                  <th scope="col">{dialog ? "Actions" : "Order / remove"}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    {dialog && (
                      <td className={quoteStyles.itemNumber}>
                        <span className={quoteStyles.mobileItemLabel}>
                          Item{" "}
                        </span>
                        {index + 1}
                      </td>
                    )}
                    <td data-label="Description *">
                      <label
                        className="sr-only"
                        htmlFor={`${prefix}-${item.id}-description`}
                      >
                        Item {index + 1} description
                      </label>
                      <textarea
                        id={`${prefix}-${item.id}-description`}
                        aria-invalid={!!errors[`${item.id}-description`]}
                        value={item.description}
                        maxLength={2000}
                        required
                        onChange={(e) =>
                          edit(index, "description", e.target.value)
                        }
                      />
                      {errors[`${item.id}-description`] && (
                        <p role="alert" className="form-error">
                          {errors[`${item.id}-description`]}
                        </p>
                      )}
                    </td>
                    <td data-label="Quantity *">
                      <label
                        className="sr-only"
                        htmlFor={`${prefix}-${item.id}-quantity`}
                      >
                        Quantity for item {index + 1}
                      </label>
                      <input
                        id={`${prefix}-${item.id}-quantity`}
                        aria-invalid={!!errors[`${item.id}-quantity`]}
                        inputMode="decimal"
                        value={item.quantity}
                        required
                        pattern="(0|[1-9][0-9]{0,8})([.][0-9]{1,3})?"
                        onChange={(e) =>
                          edit(index, "quantity", e.target.value)
                        }
                      />
                      {errors[`${item.id}-quantity`] && (
                        <p role="alert" className="form-error">
                          {errors[`${item.id}-quantity`]}
                        </p>
                      )}
                    </td>
                    <td data-label="Unit price (PHP) *">
                      <label
                        className="sr-only"
                        htmlFor={`${prefix}-${item.id}-price`}
                      >
                        Unit price for item {index + 1} (PHP)
                      </label>
                      <input
                        id={`${prefix}-${item.id}-price`}
                        aria-invalid={!!errors[`${item.id}-unit_price`]}
                        inputMode="decimal"
                        value={item.unit_price}
                        required
                        pattern="(0|[1-9][0-9]{0,11})([.][0-9]{1,2})?"
                        onChange={(e) =>
                          edit(index, "unit_price", e.target.value)
                        }
                      />
                      {errors[`${item.id}-unit_price`] && (
                        <p role="alert" className="form-error">
                          {errors[`${item.id}-unit_price`]}
                        </p>
                      )}
                    </td>
                    <td
                      data-label="Amount (PHP)"
                      className={`${styles.number} ${quoteStyles.itemAmount}`}
                    >
                      {amounts[index] === null
                        ? "Check inputs"
                        : formatCentavos(amounts[index]!)}
                    </td>
                    <td data-label="Actions">
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className="button button-outline"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                          aria-label={`Move item ${index + 1} up`}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="button button-outline"
                          disabled={index === items.length - 1}
                          onClick={() => move(index, 1)}
                          aria-label={`Move item ${index + 1} down`}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="button button-outline"
                          onClick={() =>
                            setItems(items.filter((i) => i.id !== item.id))
                          }
                          aria-label={`Remove item ${index + 1}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RecordTable>
        ) : (
          <>
            {" "}
            {items.map((item, index) => (
              <div className="quotation-edit-row" key={item.id}>
                <div className="live-form-grid">
                  <label
                    className="live-field span-all"
                    htmlFor={`${prefix}-${item.id}-description`}
                  >
                    Item {index + 1} description
                    <textarea
                      id={`${prefix}-${item.id}-description`}
                      value={item.description}
                      maxLength={2000}
                      required
                      onChange={(e) =>
                        edit(index, "description", e.target.value)
                      }
                    />
                  </label>
                  <label
                    className="live-field"
                    htmlFor={`${prefix}-${item.id}-quantity`}
                  >
                    Quantity
                    <input
                      id={`${prefix}-${item.id}-quantity`}
                      inputMode="decimal"
                      value={item.quantity}
                      required
                      pattern="(0|[1-9][0-9]{0,8})([.][0-9]{1,3})?"
                      onChange={(e) => edit(index, "quantity", e.target.value)}
                    />
                  </label>
                  <label
                    className="live-field"
                    htmlFor={`${prefix}-${item.id}-price`}
                  >
                    Unit price (PHP)
                    <input
                      id={`${prefix}-${item.id}-price`}
                      inputMode="decimal"
                      value={item.unit_price}
                      required
                      pattern="(0|[1-9][0-9]{0,11})([.][0-9]{1,2})?"
                      onChange={(e) =>
                        edit(index, "unit_price", e.target.value)
                      }
                    />
                  </label>
                </div>
                <p>
                  Line amount:{" "}
                  {amounts[index] === null
                    ? "Check quantity and price"
                    : formatCentavos(amounts[index]!)}
                </p>
                <div className="quotation-controls">
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move item ${index + 1} up`}
                  >
                    ↑ Move up
                  </button>
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move item ${index + 1} down`}
                  >
                    ↓ Move down
                  </button>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() =>
                      setItems(items.filter((i) => i.id !== item.id))
                    }
                    aria-label={`Remove item ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        {!items.length && <p>No items in this space.</p>}
        <div className={dialog ? quoteStyles.itemTableFooter : undefined}>
          <button
            type="button"
            className="button button-outline"
            disabled={items.length >= 200}
            onClick={addItem}
          >
            {dialog && <Plus size={16} aria-hidden="true" />}Add item
          </button>
          <p aria-live="polite">
            <span>{dirty ? "Unsaved draft subtotal" : "Draft subtotal"}</span>{" "}
            <strong>{subtotal}</strong>
          </p>
        </div>
        <label className="live-field" htmlFor={`${prefix}-reason`}>
          Change reason{dialog ? " *" : ""}
          {dialog ? (
            <textarea
              id={`${prefix}-reason`}
              name="reason"
              aria-label="Change reason"
              aria-invalid={!!errors.reason}
              value={reason}
              required
              maxLength={2000}
              rows={3}
              placeholder="Explain why items are being added, edited, reordered or removed…"
              onChange={(e) => {
                setReason(e.target.value);
                if (errors.reason)
                  setErrors(quotationDraftErrors(items, e.target.value));
              }}
            />
          ) : (
            <input
              id={`${prefix}-reason`}
              name="reason"
              value={reason}
              required
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </label>
        {dialog && (
          <div className={quoteStyles.reasonHelp}>
            <small>
              Your reason is recorded with this Space’s saved quotation changes.
            </small>
            <small>{reason.length}/2000</small>
          </div>
        )}
        {errors.reason && (
          <p role="alert" className="form-error">
            {errors.reason}
          </p>
        )}
        {errors.items && (
          <p role="alert" className="form-error">
            {errors.items}
          </p>
        )}
        {!dialog && (
          <button
            className="button button-primary"
            disabled={pending || !dirty}
          >
            {pending ? "Saving quotation…" : "Save space items"}
          </button>
        )}
      </fieldset>
      {!dialog && state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {!dialog && state.success && (
        <p role="status" className="form-success">
          {state.success}
        </p>
      )}
      {dialog && (
        <footer
          className={`${quoteStyles.footer} ${quoteStyles.itemEditorFooter}`}
        >
          <div>
            {state.error && (
              <p role="alert" className="form-error">
                {state.error}
              </p>
            )}
            <span className={quoteStyles.draftStatus} role="status">
              {dirty ? "Unsaved changes" : "No unsaved changes"}
              <small>Saved subtotal: {formatPHP(space.subtotal)}</small>
            </span>
            <button
              type="button"
              className="button button-outline"
              disabled={pending}
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm("Discard unsaved quotation changes?")
                )
                  onCancel?.();
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={pending || !dirty || Object.keys(validation).length > 0}
            >
              {pending ? "Saving quotation…" : "Save space items"}
            </button>
          </div>
        </footer>
      )}
      {!dialog && (
        <p className="field-hint">
          Saved subtotal: {formatPHP(space.subtotal)}. Save each space before
          leaving. Quantities allow 3 decimals; PHP prices allow 2. Each line
          rounds to centavos before totals are summed.
        </p>
      )}
    </form>
  );
}
