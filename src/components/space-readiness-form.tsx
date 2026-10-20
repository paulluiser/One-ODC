"use client";
import { useActionState } from "react";
import { readinessAction } from "@/app/dashboard/projects/readiness-actions";
import {
  readinessStatuses,
  type SpaceReadiness,
} from "@/lib/project-readiness";
import type { FormState } from "@/lib/phase1";
export function SpaceReadinessForm({
  project,
  space,
  readiness,
  editable,
  manager,
}: {
  project: string;
  space: string;
  readiness: SpaceReadiness;
  editable: boolean;
  manager: boolean;
}) {
  const [state, action, pending] = useActionState(readinessAction, {
    error: null,
  } as FormState);
  return (
    <section className="live-form">
      <h3>Post-closure readiness</h3>
      <p>
        Current: <strong>{readiness.status}</strong>
      </p>
      {editable && (readiness.status !== "Ordered" || manager) ? (
        <form
          action={action}
          onSubmit={(event) => {
            const target = String(
              new FormData(event.currentTarget).get("status"),
            );
            if (
              (readiness.status === "Ordered" || target === "Ordered") &&
              !window.confirm(
                readiness.status === "Ordered"
                  ? "Roll back this Ordered Space? Its current handoff will be invalidated; Operations assignment and history are retained."
                  : "Mark this Space Ordered? Ordinary readiness changes will be locked.",
              )
            )
              event.preventDefault();
          }}
        >
          <input type="hidden" name="project" value={project} />
          <input type="hidden" name="space" value={space} />
          <input type="hidden" name="version" value={readiness.version} />
          <input type="hidden" name="intent" value="status" />
          <label>
            Next readiness status
            <select name="status" required disabled={pending} defaultValue="">
              <option value="" disabled>
                Choose status
              </option>
              {readinessStatuses
                .filter((s) => s !== readiness.status)
                .map((s) => (
                  <option key={s}>{s}</option>
                ))}
            </select>
          </label>
          {readiness.status === "Ordered" && (
            <p>
              Rollback retains the Operations Admin and invalidates this Space’s
              current handoff. A fresh handoff and acknowledgment will be
              required.
            </p>
          )}
          <label>
            Readiness change reason
            <textarea
              name="reason"
              required
              maxLength={2000}
              disabled={pending}
            />
          </label>
          <button className="button button-primary" disabled={pending}>
            {pending
              ? "Saving…"
              : readiness.status === "Ordered"
                ? "Roll back Ordered Space"
                : "Save readiness"}
          </button>
        </form>
      ) : (
        <p>
          {readiness.status === "Ordered"
            ? "Ordered is locked. Only the Lead Designer or System Administrator may roll it back."
            : "Read-only in your current project access."}
        </p>
      )}
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {state.success && <p role="status">{state.success}</p>}
    </section>
  );
}
