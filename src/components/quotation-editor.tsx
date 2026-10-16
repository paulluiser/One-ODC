"use client";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import styles from "./ui-r3/ui-r3.module.css";
import { RecordTable } from "./record-table";
import { useActionState, useEffect, useId, useState } from "react";
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
}: {
  rebuild?: boolean;
  quotation: Quotation;
  space: QuotationSpace;
}) {
  const initial = space.items.map(
    ({ id, description, quantity, unit_price }) => ({
      id,
      description,
      quantity,
      unit_price,
    }),
  );
  const [items, setItems] = useState<QuotationItem[]>(initial);
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(mutateQuotation, {
    error: null,
  });
  const dirty =
    JSON.stringify(items) !== JSON.stringify(initial) || reason !== "";
  const prefix = useId();
  const [savedVersion, setSavedVersion] = useState(quotation.edit_version);
  if (savedVersion !== quotation.edit_version) {
    setSavedVersion(quotation.edit_version);
    setItems(initial);
    setReason("");
  }
  useEffect(() => {
    if (!dirty || pending) return;
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
  }, [dirty, pending]);
  const amounts = items.map((i) => lineCentavos(i.quantity, i.unit_price));
  const estimate = amounts.every((a) => a !== null)
    ? amounts.reduce<bigint>((sum, a) => sum + (a ?? 0n), 0n)
    : null;
  function edit(
    index: number,
    field: keyof Omit<QuotationItem, "id">,
    value: string,
  ) {
    setItems(items.map((i, n) => (n === index ? { ...i, [field]: value } : i)));
  }
  function move(index: number, delta: number) {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setItems(next);
  }
  return (
    <form
      action={action}
      className={`live-form ${rebuild ? styles.editorForm : ""}`}
      onReset={(e) => e.preventDefault()}
      aria-label={`Edit quotation: ${space.name}`}
    >
      <input type="hidden" name="project" value={quotation.project_id} />
      <input type="hidden" name="draft" value={quotation.id} />
      <input type="hidden" name="space" value={space.id} />
      <input type="hidden" name="version" value={quotation.edit_version} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <fieldset
        disabled={pending}
        className={rebuild ? styles.editor : undefined}
      >
        <legend className="field-hint">Items for {space.name}</legend>
        {rebuild ? (
          <RecordTable label={`Editable items for ${space.name}`}>
            <table className={`live-table ${styles.editTable}`}>
              <caption className="sr-only">
                Quotation items for {space.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Unit price (PHP)</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Order / remove</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td>
                      <label
                        className="sr-only"
                        htmlFor={`${prefix}-${item.id}-description`}
                      >
                        Item {index + 1} description
                      </label>
                      <textarea
                        id={`${prefix}-${item.id}-description`}
                        value={item.description}
                        maxLength={2000}
                        required
                        onChange={(e) =>
                          edit(index, "description", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <label
                        className="sr-only"
                        htmlFor={`${prefix}-${item.id}-quantity`}
                      >
                        Quantity for item {index + 1}
                      </label>
                      <input
                        id={`${prefix}-${item.id}-quantity`}
                        inputMode="decimal"
                        value={item.quantity}
                        required
                        pattern="(0|[1-9][0-9]{0,8})([.][0-9]{1,3})?"
                        onChange={(e) =>
                          edit(index, "quantity", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <label
                        className="sr-only"
                        htmlFor={`${prefix}-${item.id}-price`}
                      >
                        Unit price for item {index + 1} (PHP)
                      </label>
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
                    </td>
                    <td className={styles.number}>
                      {amounts[index] === null
                        ? "Check inputs"
                        : formatCentavos(amounts[index]!)}
                    </td>
                    <td>
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
        <button
          type="button"
          className="button button-outline"
          disabled={items.length >= 200}
          onClick={() =>
            setItems([
              ...items,
              {
                id: crypto.randomUUID(),
                description: "",
                quantity: "1",
                unit_price: "0",
              },
            ])
          }
        >
          Add item
        </button>
        <p aria-live="polite">
          {dirty ? "Unsaved subtotal" : "Subtotal"}:{" "}
          {estimate === null
            ? "Check quantity and price"
            : formatCentavos(estimate)}
        </p>
        <label className="live-field" htmlFor={`${prefix}-reason`}>
          Change reason
          <input
            id={`${prefix}-reason`}
            name="reason"
            value={reason}
            required
            maxLength={2000}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="button button-primary" disabled={pending || !dirty}>
          {pending ? "Saving quotation…" : "Save space items"}
        </button>
      </fieldset>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="form-success">
          {state.success}
        </p>
      )}
      <p className="field-hint">
        Saved subtotal: {formatPHP(space.subtotal)}. Save each space before
        leaving. Quantities allow 3 decimals; PHP prices allow 2. Each line
        rounds to centavos before totals are summed.
      </p>
    </form>
  );
}
