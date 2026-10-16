"use client";
import { useActionState } from "react";
import { commercialAction } from "@/app/dashboard/projects/commercial-actions";
import { ContextPanel } from "./context-panel";
import { Button } from "./ui/button";
export function CommercialStageForm({
  project,
  stage,
  intent,
  price,
  version = 0,
  people = [],
}: {
  project: string;
  stage: string;
  intent: "negotiate" | "close" | "lost" | "handoff";
  price?: string;
  version?: number;
  people?: { id: string; display_name: string }[];
}) {
  const [state, action, pending] = useActionState(commercialAction, {
    error: null,
  });
  const label = {
    negotiate: "Send to BDM",
    close: "Close deal",
    lost: "Mark Lost",
    handoff: "Assign Operations & hand off",
  }[intent];
  const description = {
    negotiate:
      "Send the project to the BDM for client follow-up. This changes the commercial status to Under Negotiation; design statuses are preserved.",
    close:
      "Confirm the agreed closure price. The Lead Designer will be notified to assign Operations and complete the handoff.",
    lost: "The client is not proceeding. This permanently locks project edits, including ongoing designs. Files and history remain accessible to authorized members.",
    handoff:
      "Choose the primary Operations Admin and release the closed project for operational acknowledgment.",
  }[intent];
  return (
    <ContextPanel
      title={label}
      description={description}
      blockPending
      resetOnClose
    >
      <form action={action} className="live-form" aria-busy={pending}>
        <input type="hidden" name="project" value={project} />
        <input type="hidden" name="stage" value={stage} />
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="sale_version" value={version} />
        {intent === "close" && (
          <label className="live-field">
            Closure price (PHP)
            <input
              name="price"
              inputMode="decimal"
              defaultValue={price ?? ""}
              pattern="(0|[1-9][0-9]{0,25})([.][0-9]{1,2})?"
              required
              disabled={pending}
            />
          </label>
        )}
        {intent === "handoff" && (
          <label className="live-field">
            Primary Operations Admin
            <select name="primary" defaultValue="" required disabled={pending}>
              <option value="" disabled>
                Select Operations Admin
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="live-field">
          {intent === "lost" ? "Loss reason" : "Remarks"}
          <textarea
            name="reason"
            required
            maxLength={2000}
            rows={3}
            disabled={pending}
          />
        </label>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <input
            type="checkbox"
            name="confirm"
            value="yes"
            required
            disabled={pending}
          />
          I confirm{" "}
          {intent === "lost"
            ? "the client did not proceed and this project will become read-only"
            : "this status change and its recorded details"}
          .
        </label>
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        {state.success && <p role="status">{state.success}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : label}
        </Button>
      </form>
    </ContextPanel>
  );
}
