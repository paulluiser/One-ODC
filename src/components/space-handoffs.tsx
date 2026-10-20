"use client";
import { useActionState } from "react";
import { readinessAction } from "@/app/dashboard/projects/readiness-actions";
import type { SpaceHandoff } from "@/lib/project-readiness";
import type { FormState } from "@/lib/phase1";
function Ack({ project, handoff }: { project: string; handoff: SpaceHandoff }) {
  const [state, action, pending] = useActionState(readinessAction, {
    error: null,
  } as FormState);
  return (
    <form action={action}>
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="handoff" value={handoff.id} />
      <input type="hidden" name="intent" value="acknowledge" />
      <button className="button button-outline" disabled={pending}>
        Acknowledge Space handoff
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </form>
  );
}
export function SpaceHandoffs({
  project,
  spaces,
  handoffs,
  manager,
  actor,
  admin,
  locked,
}: {
  project: string;
  spaces: { id: string; name: string; status: string }[];
  handoffs: SpaceHandoff[];
  manager: boolean;
  actor: string;
  admin: boolean;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(readinessAction, {
    error: null,
  } as FormState);
  return (
    <section className="surface live-form" id="operations-handoff">
      <h3>Space operational handoff</h3>
      <form action={action}>
        <input type="hidden" name="project" value={project} />
        <input type="hidden" name="intent" value="handoff" />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {manager && !locked && <th>Select</th>}
                <th>Space</th>
                <th>Readiness</th>
                <th>Handoff</th>
              </tr>
            </thead>
            <tbody>
              {spaces.map((s) => {
                const h = handoffs.find(
                  (h) => h.space_id === s.id && !h.invalidated_at,
                );
                return (
                  <tr key={s.id}>
                    {manager && !locked && (
                      <td>
                        <input
                          aria-label={`Hand off ${s.name}`}
                          type="checkbox"
                          name="spaces"
                          value={s.id}
                          disabled={pending || s.status !== "Ordered" || !!h}
                        />
                      </td>
                    )}
                    <td>{s.name}</td>
                    <td>{s.status}</td>
                    <td>
                      {h
                        ? h.acknowledged_at
                          ? "Acknowledged"
                          : "Pending acknowledgment"
                        : "Not handed off"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!spaces.length && <p>No active Spaces.</p>}
        {manager && !locked && (
          <>
            <label>
              Handoff reason
              <textarea
                name="reason"
                required
                maxLength={2000}
                disabled={pending}
              />
            </label>
            <button className="button button-primary" disabled={pending}>
              Hand off selected Ordered Spaces
            </button>
          </>
        )}
        {state.error && <p role="alert">{state.error}</p>}
        {state.success && <p role="status">{state.success}</p>}
      </form>
      {!locked &&
        handoffs
          .filter(
            (h) =>
              !h.invalidated_at &&
              !h.acknowledged_at &&
              (h.ops_id === actor || admin),
          )
          .map((h) => (
            <div key={h.id}>
              <strong>{spaces.find((s) => s.id === h.space_id)?.name}</strong>
              <Ack project={project} handoff={h} />
            </div>
          ))}
    </section>
  );
}
