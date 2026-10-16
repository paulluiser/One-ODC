"use client";
import { PendingIndicator } from "./operation-feedback";
import { FormPending } from "./form-pending";
import { useActionState, useState, useId, type ComponentProps } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { FormState } from "@/lib/phase1";
import { mutateSpace } from "@/app/dashboard/projects/space-actions";
import { spaceTransitions, type Space, type Supporter } from "@/lib/spaces";
import type { Person } from "@/lib/phase1";
function Feedback({
  error,
  success,
}: {
  error: string | null;
  success?: string;
}) {
  return (
    <div aria-live="polite">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && <p className="form-success">{success}</p>}
    </div>
  );
}
function Assignments({
  people,
  primary,
  support = [],
}: {
  people: Person[];
  primary?: string;
  support?: string[];
}) {
  const [chosen, setChosen] = useState(primary || "");
  const [supportIds, setSupportIds] = useState(support);
  return (
    <>
      <label className="live-field">
        Primary Designer
        <select
          name="primary"
          aria-label="Primary Designer"
          required
          value={chosen}
          onChange={(e) => {
            setChosen(e.target.value);
            setSupportIds((old) => old.filter((id) => id !== e.target.value));
          }}
        >
          <option value="">Select Designer</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="assignment-choices">
        <legend>Supporting Designers</legend>
        {people
          .filter((p) => p.id !== chosen)
          .map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                name="support"
                value={p.id}
                checked={supportIds.includes(p.id)}
                onChange={(e) =>
                  setSupportIds((old) =>
                    e.target.checked
                      ? [...old, p.id]
                      : old.filter((id) => id !== p.id),
                  )
                }
              />
              {p.display_name}
            </label>
          ))}
      </fieldset>
    </>
  );
}
function Entry({
  defaultValue = "",
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange">) {
  const [value, setValue] = useState(String(defaultValue));
  return (
    <input
      {...props}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
function StatusChoice({ choices, id }: { choices: string[]; id: string }) {
  const [value, setValue] = useState("");
  return (
    <select
      id={id}
      aria-label="Next design status"
      name="status"
      required
      value={value}
      onChange={(e) => setValue(e.target.value)}
    >
      <option value="">Select status</option>
      {choices.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}
function SpaceSelection({ space }: { space: Space }) {
  const [checked, setChecked] = useState(false);
  return (
    <label>
      <input
        type="checkbox"
        name="spaces"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        value={JSON.stringify({ id: space.id, version: space.version })}
      />
      {space.name} · {space.id.slice(0, 8)}
    </label>
  );
}
function Reason() {
  const [value, setValue] = useState("");
  return (
    <label className="live-field span-all">
      Reason
      <textarea
        name="reason"
        aria-label="Reason"
        required
        maxLength={2000}
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </label>
  );
}
export function SpaceEditForm({
  project,
  space,
  supporters,
  people,
  manager,
  newId,
}: {
  project: string;
  space?: Space;
  supporters: Supporter[];
  people: Person[];
  manager: boolean;
  newId?: string;
}) {
  const fieldId = useId();
  const [state, action, pending] = useActionState(mutateSpace, { error: null });
  return (
    <form
      action={action}
      onReset={(e) => e.preventDefault()}
      className="live-form"
    >
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="id" value={space?.id || newId} />
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="version" value={space?.version || 0} />
      <fieldset
        key={space?.version || 0}
        disabled={pending}
        className="live-form-grid"
      >
        <label className="live-field" htmlFor={`${fieldId}-name`}>
          Space name
          <Entry
            id={`${fieldId}-name`}
            name="name"
            required
            maxLength={200}
            defaultValue={space?.name || ""}
          />
        </label>
        <label className="live-field" htmlFor={`${fieldId}-deadline`}>
          Design deadline
          <Entry
            id={`${fieldId}-deadline`}
            type="date"
            name="deadline"
            defaultValue={space?.deadline || ""}
          />
        </label>
        {manager ? (
          <Assignments
            people={people}
            primary={space?.primary_designer_id}
            support={supporters.map((s) => s.user_id)}
          />
        ) : (
          <>
            <input
              type="hidden"
              name="primary"
              value={space?.primary_designer_id}
            />
            {supporters.map((s) => (
              <input
                key={s.user_id}
                type="hidden"
                name="support"
                value={s.user_id}
              />
            ))}
          </>
        )}
        <Reason />
        <button className="button button-primary" type="submit">
          {pending ? "Saving…" : space ? "Save space" : "Create space"}
        </button>
      </fieldset>
      <Feedback {...state} />
      <FormPending />
    </form>
  );
}
export function SpaceStatusForm({
  space,
  manager,
  admin,
}: {
  space: Space;
  manager: boolean;
  admin: boolean;
}) {
  const fieldId = useId();
  const [state, action, pending] = useActionState(mutateSpace, { error: null });
  const choices = spaceTransitions(space, manager, admin);
  if (!choices.length)
    return <p className="field-hint">Awaiting Lead Designer review.</p>;
  return (
    <form
      action={action}
      onReset={(e) => e.preventDefault()}
      className="live-form"
    >
      <input type="hidden" name="intent" value="status" />
      <input type="hidden" name="id" value={space.id} />
      <input type="hidden" name="project" value={space.project_id} />
      <input type="hidden" name="version" value={space.version} />
      <fieldset
        key={space.version}
        disabled={pending}
        className="live-form-grid"
      >
        <label className="live-field" htmlFor={`${fieldId}-status`}>
          Next design status
          <StatusChoice id={`${fieldId}-status`} choices={choices} />
        </label>
        {manager && (
          <label className="live-field" htmlFor={`${fieldId}-approval`}>
            External approval reference
            <Entry
              id={`${fieldId}-approval`}
              aria-label="External approval reference"
              name="approval"
              maxLength={2000}
            />
            <span className="field-hint">
              Required for normal completion after external approval.
            </span>
          </label>
        )}
        <Reason />
        {admin && (
          <p className="field-hint">
            Administrator status changes are recorded as overrides.
          </p>
        )}
        <button className="button button-primary" type="submit">
          {pending ? "Updating…" : "Update status"}
        </button>
      </fieldset>
      <Feedback {...state} />
      <FormPending />
    </form>
  );
}
export function SpaceCancelForm({ space }: { space: Space }) {
  const [open, setOpen] = useState(false);
  const formId = useId();
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await mutateSpace(previous, data);
      if (result.success) setOpen(false);
      return result;
    },
    { error: null },
  );
  return (
    <form
      id={formId}
      action={action}
      onReset={(e) => e.preventDefault()}
      className="live-form"
    >
      <input type="hidden" name="intent" value="cancel" />
      <input type="hidden" name="id" value={space.id} />
      <input type="hidden" name="project" value={space.project_id} />
      <input type="hidden" name="version" value={space.version} />
      <fieldset aria-busy={pending} disabled={pending}>
        <Reason />
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              className="button button-outline"
              type="button"
              onClick={(e) => {
                if (!e.currentTarget.form?.reportValidity()) e.preventDefault();
              }}
            >
              Cancel space
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="detail-dialog">
              <Dialog.Title>Cancel space: {space.name}</Dialog.Title>
              <Dialog.Description>
                Cancellation preserves history and excludes this space from
                active progress. Cancelled spaces cannot be restored in this
                phase.
              </Dialog.Description>
              {state.error && (
                <p className="form-error" role="alert">
                  {state.error}
                </p>
              )}
              <Dialog.Close asChild>
                <button className="button button-outline" type="button">
                  Go back
                </button>
              </Dialog.Close>
              <button
                className="button button-primary"
                data-destructive="true"
                type="submit"
                form={formId}
                disabled={pending}
              >
                {pending ? "Cancelling…" : "Confirm space cancellation"}
              </button>
              <PendingIndicator pending={pending} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </fieldset>
      <Feedback {...state} />
      <FormPending />
    </form>
  );
}
export function BulkSpaceForm({
  project,
  spaces,
  people,
}: {
  project: string;
  spaces: Space[];
  people: Person[];
}) {
  const [state, action, pending] = useActionState(mutateSpace, { error: null });
  return (
    <form
      action={action}
      onReset={(e) => e.preventDefault()}
      className="live-form"
    >
      <input type="hidden" name="intent" value="bulk" />
      <input type="hidden" name="project" value={project} />
      <fieldset
        key={spaces.map((s) => s.version).join("-")}
        disabled={pending}
        className="live-form-grid"
      >
        <fieldset className="assignment-choices">
          <legend>Spaces to reassign (up to 100)</legend>
          {spaces
            .filter((s) => !s.cancelled_at)
            .map((s) => (
              <SpaceSelection key={s.id} space={s} />
            ))}
        </fieldset>
        <Assignments people={people} />
        <Reason />
        <button type="submit" className="button button-primary">
          {pending ? "Reassigning…" : "Reassign selected spaces"}
        </button>
      </fieldset>
      <Feedback {...state} />
      <FormPending />
    </form>
  );
}
