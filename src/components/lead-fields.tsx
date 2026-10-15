import type { Attachment, LeadPayload, Person } from "../lib/phase1";
export type LeadValues = Omit<
  LeadPayload,
  "cabinetry_count" | "attachment_metadata" | "resource_links"
> & { cabinetry_count: string };
export function LeadFields({
  values,
  errors = {},
  disabled = false,
  onValue,
}: {
  values: LeadValues;
  errors?: Record<string, string>;
  disabled?: boolean;
  onValue?: (key: keyof LeadValues, value: string) => void;
}) {
  const input = (
    name: keyof LeadValues,
    label: string,
    options: { type?: string; required?: boolean; multiline?: boolean } = {},
  ) => (
    <div className="live-field" key={name}>
      <label htmlFor={name}>
        {label}
        {options.required ? " *" : ""}
      </label>
      {options.multiline ? (
        <textarea
          id={name}
          name={name}
          rows={name === "notes" ? 4 : 3}
          maxLength={name === "notes" ? 10000 : 2000}
          value={values[name] ?? ""}
          onChange={(e) => onValue?.(name, e.target.value)}
          readOnly={!onValue}
          disabled={disabled}
          required={options.required}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={options.type ?? "text"}
          value={values[name] ?? ""}
          onChange={(e) => onValue?.(name, e.target.value)}
          readOnly={!onValue}
          disabled={disabled}
          required={options.required}
          min={options.type === "number" ? 1 : undefined}
          step={options.type === "number" ? 1 : undefined}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
        />
      )}{" "}
      {errors[name] && (
        <span className="field-error" id={`${name}-error`}>
          {errors[name]}
        </span>
      )}
    </div>
  );
  return (
    <div className="live-form-grid lead-field-groups">
      <h3 className="span-all form-section-label">01 · Project brief</h3>
      {input("project_name", "Project Name / Client Name", { required: true })}
      <div className="live-field">
        <label htmlFor="brand">Brand</label>
        <select
          id="brand"
          name="brand"
          value={values.brand ?? ""}
          onChange={(e) => onValue?.("brand", e.target.value)}
          disabled={disabled}
        >
          <option value="">Not specified</option>
          {["SFY", "Stosa", "Both"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        {errors.brand && <span className="field-error">{errors.brand}</span>}
      </div>
      {input("address", "Address", { required: true, multiline: true })}
      <div>
        <div className="live-form-grid">
          {input("cabinetry_count", "Estimated Cabinetries", {
            required: true,
            type: "number",
          })}
          {input("date_needed", "Date Needed", { type: "date" })}
        </div>
        <p className="field-hint">
          Cabinetry count estimates scope. It does not create Spaces or
          determine pricing.
        </p>
      </div>
      <div className="span-all">
        <h3 className="form-section-label">02 · Additional context</h3>
        {input("notes", "Notes", { multiline: true })}
      </div>
    </div>
  );
}
export function AttachmentList({ files }: { files: Attachment[] }) {
  return (
    <ul className="metadata-list">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`}>
          <span>
            {f.name}
            <small>
              {f.size.toLocaleString()} bytes ·{" "}
              {f.mime_type || "Type unspecified"}
            </small>
          </span>
          <b>Not uploaded</b>
        </li>
      ))}
    </ul>
  );
}
export function AssignmentFields({
  people,
  primary,
  onPrimary,
  support,
  onSupport,
  ops,
  onOps,
  disabled = false,
}: {
  people: Person[];
  primary: string;
  onPrimary?: (v: string) => void;
  support: string[];
  onSupport?: (v: string[]) => void;
  ops: string[];
  onOps?: (v: string[]) => void;
  disabled?: boolean;
}) {
  const designers = people.filter(
    (p) => p.role === "designer" || p.role === "lead_designer",
  );
  const operations = people.filter((p) => p.role === "operations_admin");
  const choices = (
    label: string,
    name: string,
    items: Person[],
    selected: string[],
    change?: (v: string[]) => void,
  ) => (
    <fieldset className="assignment-choices">
      <legend>{label}</legend>
      {name === "ops" &&
        selected.map((value) => (
          <input key={value} type="hidden" name="ops" value={value} />
        ))}
      {items.length ? (
        items.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              name={name === "ops" ? undefined : name}
              value={p.id}
              checked={selected.includes(p.id)}
              onChange={(e) =>
                change?.(
                  e.target.checked
                    ? [...selected, p.id]
                    : selected.filter((id) => id !== p.id),
                )
              }
              disabled={disabled || !change}
            />
            <span>{p.display_name}</span>
          </label>
        ))
      ) : (
        <p className="field-hint">No active personnel available.</p>
      )}
    </fieldset>
  );
  return (
    <div className="assignment-fields">
      <div className="live-field">
        <label htmlFor="primary">Primary Designer *</label>
        <select
          id="primary"
          name="primary"
          value={primary}
          onChange={(e) => onPrimary?.(e.target.value)}
          disabled={disabled}
          required
        >
          <option value="">Choose a Designer</option>
          {designers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
              {p.role === "lead_designer" ? " · Lead Designer" : ""}
            </option>
          ))}
        </select>
      </div>
      {choices(
        "Supporting Designers (optional)",
        "support",
        designers.filter((p) => p.id !== primary),
        support,
        onSupport,
      )}
      {choices(
        "Operations Admins (optional before commercial closure)",
        "ops",
        operations,
        ops,
        onOps,
      )}
      {ops.length > 0 && (
        <div className="live-field">
          <label htmlFor="primary-ops">Primary Operations Admin</label>
          <select
            id="primary-ops"
            value={ops[0]}
            disabled={disabled || !onOps}
            onChange={(e) =>
              onOps?.([
                e.target.value,
                ...ops.filter((id) => id !== e.target.value),
              ])
            }
          >
            {operations
              .filter((p) => ops.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
          </select>
        </div>
      )}
      <p className="field-hint">
        Select the primary Operations Admin from the assigned Operations team.
        No Spaces are created by project conversion.
      </p>
    </div>
  );
}

export function ReviewFields({
  decision,
  remarks,
  onDecision,
  onRemarks,
  disabled = false,
  error,
}: {
  decision: string;
  remarks: string;
  onDecision?: (value: string) => void;
  onRemarks?: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <>
      <div className="live-field">
        <label htmlFor="decision">Review decision</label>
        <select
          id="decision"
          name="decision"
          value={decision}
          onChange={(e) => onDecision?.(e.target.value)}
          disabled={disabled}
        >
          {["Accepted", "Returned for Clarification", "Rejected"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </div>
      <div className="live-field">
        <label htmlFor="remarks">
          Remarks{decision !== "Accepted" ? " *" : " (optional)"}
        </label>
        <textarea
          id="remarks"
          name="remarks"
          value={remarks}
          onChange={(e) => onRemarks?.(e.target.value)}
          readOnly={!onRemarks}
          required={decision !== "Accepted"}
          disabled={disabled}
          rows={3}
          aria-invalid={!!error}
          aria-describedby={error ? "remarks-error" : undefined}
        />
        {error && (
          <span className="field-error" id="remarks-error">
            {error}
          </span>
        )}
      </div>
    </>
  );
}
