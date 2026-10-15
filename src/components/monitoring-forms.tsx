"use client";
import { PendingIndicator } from "./operation-feedback";
import { FormPending } from "./form-pending";
import { useActionState, useState, useId, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { FormState } from "@/lib/phase1";
import { monitorAction } from "@/app/dashboard/projects/monitoring-actions";
import {
  activityCategories,
  type Activity,
  type Monitoring,
} from "@/lib/monitoring";
export function MonitorField({
  name,
  label,
  value = "",
  type = "text",
  options,
  required = false,
}: {
  name: string;
  label: string;
  value?: string;
  type?: string;
  options?: { id: string; name: string }[];
  required?: boolean;
}) {
  const [v, set] = useState(value);
  const id = useId();
  return (
    <div className="live-field">
      <label htmlFor={id}>{label}</label>
      {options ? (
        <select
          id={id}
          name={name}
          required={required}
          value={v}
          onChange={(e) => set(e.target.value)}
        >
          <option value="">Select / None</option>
          {options.map((o) => (
            <option value={o.id} key={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          id={id}
          name={name}
          required={required}
          value={v}
          onChange={(e) => set(e.target.value)}
          rows={3}
          maxLength={name === "description" ? 4000 : 2000}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          value={v}
          onChange={(e) => set(e.target.value)}
          maxLength={200}
        />
      )}
    </div>
  );
}
function Form({
  project,
  version,
  intent,
  children,
  label,
  confirm = false,
}: {
  project: string;
  version: number;
  intent: string;
  children: ReactNode;
  label: string;
  confirm?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await monitorAction(previous, data);
      if (result.success) setOpen(false);
      return result;
    },
    { error: null },
  );
  const formId = useId();
  return (
    <form
      id={formId}
      action={action}
      onReset={(e) => e.preventDefault()}
      className="live-form"
    >
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="intent" value={intent} />
      <fieldset key={version} disabled={pending} className="live-form-grid">
        {children}
        <MonitorField
          name="reason"
          label="Change reason"
          required
          type="textarea"
        />
        {confirm ? (
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="button button-outline"
                onClick={(e) => {
                  if (!e.currentTarget.form?.reportValidity())
                    e.preventDefault();
                }}
              >
                {label}
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="detail-dialog">
                <Dialog.Title>{label}</Dialog.Title>
                <Dialog.Description>
                  {intent === "Cancel"
                    ? "Cancellation preserves records and payments, ends active aging, and removes the project from active workload. This batch does not restore cancelled projects."
                    : intent === "Reopen"
                      ? "This opens a separate operational cycle while preserving the original completion and deadlines."
                      : "This changes the project hold state. Existing statuses and deadlines are preserved."}
                </Dialog.Description>
                <p>A reason is required in the form.</p>
                {s.error && (
                  <p role="alert" className="form-error">
                    {s.error}
                  </p>
                )}
                <Dialog.Close asChild>
                  <button className="button button-outline" type="button">
                    Go back
                  </button>
                </Dialog.Close>
                <button
                  className="button button-primary"
                  type="submit"
                  form={formId}
                  disabled={pending}
                >
                  {pending ? "Saving…" : `Confirm ${intent.toLowerCase()}`}
                </button>
                <PendingIndicator pending={pending} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        ) : (
          <button type="submit" className="button button-primary">
            {pending ? "Saving…" : label}
          </button>
        )}
        {pending && <span role="status">Saving…</span>}
      </fieldset>
      <div aria-live="polite">
        {s.error && (
          <p className="form-error" role="alert">
            {s.error}
          </p>
        )}
        {s.success && <p className="form-success">{s.success}</p>}
      </div>
      <FormPending />
    </form>
  );
}
export function ProjectControl({ m }: { m: Monitoring }) {
  if (m.state === "Cancelled") return null;
  if (!m.cycles.some((c) => !c.ended_at))
    return (
      <Form
        project={m.project_id}
        version={m.version}
        intent="Reopen"
        label="Reopen Project"
        confirm
      >
        <p className="field-hint">
          Reopen completed operational work as a new cycle. Prior completion and
          aging are preserved.
        </p>
      </Form>
    );
  return (
    <>
      <Form
        project={m.project_id}
        version={m.version}
        intent={m.state === "On Hold" ? "Resume" : "Hold"}
        label={m.state === "On Hold" ? "Resume Project" : "Hold Project"}
        confirm
      >
        <p className="field-hint">
          Calendar-day aging continues while on hold.
        </p>
      </Form>
      <Form
        project={m.project_id}
        version={m.version}
        intent="Cancel"
        label="Cancel Project"
        confirm
      >
        <p className="field-hint">
          Cancel active work while retaining history.
        </p>
      </Form>
    </>
  );
}
export function ProjectDeadlineForm({ m }: { m: Monitoring }) {
  return (
    <Form
      project={m.project_id}
      version={m.version}
      intent="deadline"
      label="Save project deadline"
    >
      <MonitorField
        name="deadline"
        label="Project deadline"
        type="date"
        value={m.deadline || ""}
      />
      <MonitorField
        name="timezone"
        label="Project timezone"
        value={m.timezone}
        required
      />
    </Form>
  );
}
export function CoordinatorForm({ project }: { project: string }) {
  return (
    <Form
      project={project}
      version={0}
      intent="coordinator"
      label="Add Site Coordinator"
    >
      <MonitorField name="name" label="Site Coordinator name" required />
      <p className="field-hint">
        A reference person, without an authenticated account.
      </p>
    </Form>
  );
}
export function ActivityForm({
  project,
  id,
  activity,
  spaces,
  coordinators,
  attachments,
  categories,
}: {
  project: string;
  id: string;
  activity?: Activity;
  spaces: { id: string; name: string }[];
  coordinators: { id: string; name: string }[];
  attachments: { id: string; name: string }[];
  categories?: string[];
}) {
  const [refs, setRefs] = useState(activity?.attachment_versions || []);
  return (
    <Form
      project={project}
      version={activity?.version || 0}
      intent="activity"
      label={activity ? "Save activity correction" : "Record activity"}
    >
      <input type="hidden" name="id" value={id} />
      <MonitorField
        name="category"
        label="Activity category"
        value={activity?.category}
        options={(categories || [...activityCategories]).map((c) => ({
          id: c,
          name: c,
        }))}
        required
      />
      <MonitorField
        name="date"
        label="Actual activity date"
        type="date"
        value={activity?.activity_date}
        required
      />
      <MonitorField
        name="space"
        label="Activity space"
        value={activity?.space_id || ""}
        options={spaces}
      />
      <MonitorField
        name="description"
        label="Activity description"
        type="textarea"
        value={activity?.description}
        required
      />
      <MonitorField
        name="coordinator"
        label="Tagged Site Coordinator"
        value={activity?.coordinator_id || ""}
        options={coordinators}
      />
      <fieldset className="assignment-choices">
        <legend>Authorized project file versions (up to five)</legend>
        {attachments.length ? (
          attachments.map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                name="attachments"
                value={a.id}
                checked={refs.includes(a.id)}
                onChange={(e) =>
                  setRefs((old) =>
                    e.target.checked
                      ? [...old, a.id]
                      : old.filter((id) => id !== a.id),
                  )
                }
              />
              {a.name}
            </label>
          ))
        ) : (
          <p className="field-hint">
            No authorized uploaded project files available.
          </p>
        )}
      </fieldset>
    </Form>
  );
}
