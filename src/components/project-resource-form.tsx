"use client";
import { FormPending } from "./form-pending";
import { useActionState, useId, useState } from "react";
import { saveProjectResources } from "@/app/dashboard/projects/resource-actions";
import type { ResourceLink } from "@/lib/resources";
import { ResourceLinks } from "./resource-links";
export function ProjectResourceForm({
  project,
  version,
  notes,
  links,
}: {
  project: string;
  version: number;
  notes: string;
  links: ResourceLink[];
}) {
  const [values, setValues] = useState(links),
    [text, setText] = useState(notes);
  const [state, action, pending] = useActionState(saveProjectResources, {
    error: null,
  });
  const id = useId();
  return (
    <form
      className="surface live-form"
      action={action}
      aria-label="Edit Notes and resources"
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="version" value={version} />
      <div className="live-field">
        <label htmlFor={id}>Notes</label>
        <textarea
          id={id}
          name="notes"
          maxLength={10000}
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
        />
      </div>
      <ResourceLinks links={values} onChange={setValues} disabled={pending} />
      <div className="live-field">
        <label htmlFor={`${id}-reason`}>Required change reason</label>
        <textarea
          id={`${id}-reason`}
          name="reason"
          required
          maxLength={2000}
          disabled={pending}
        />
      </div>
      <button className="button button-primary" disabled={pending}>
        {pending ? "Saving…" : "Save Notes and resources"}
      </button>
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
      <FormPending />
    </form>
  );
}
