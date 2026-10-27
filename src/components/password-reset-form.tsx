"use client";
import { useActionState, useState } from "react";
import {
  requestPasswordReset,
  adminPasswordReset,
} from "@/app/auth/forgot-password/actions";
import { Button } from "./ui/button";

export function PasswordResetForm({
  profile,
}: {
  profile?: { id: string; display_name: string; active: boolean };
}) {
  const [state, action, pending] = useActionState(
    profile ? adminPasswordReset : requestPasswordReset,
    { error: null },
  );
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      action={action}
      className="surface live-form"
      aria-busy={pending}
      onReset={profile ? (event) => event.preventDefault() : undefined}
    >
      {profile ? (
        <>
          <h3>Send password-reset email</h3>
          <p className="field-hint">
            Send a secure link to {profile.display_name}’s registered email.
            They choose their own password.
          </p>
          <input type="hidden" name="id" value={profile.id} />
          <div className="live-field">
            <label htmlFor={`reset-reason-${profile.id}`}>Reset reason *</label>
            <input
              id={`reset-reason-${profile.id}`}
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={2000}
              disabled={pending || !profile.active}
            />
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="confirm"
              value="true"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              required
              disabled={pending || !profile.active}
            />
            Confirm sending a password-reset email
          </label>
          {!profile.active && (
            <p className="field-hint">
              Activate this account before requesting a reset.
            </p>
          )}
        </>
      ) : (
        <div className="live-field">
          <label htmlFor="recovery-email">Work email</label>
          <input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            disabled={pending}
          />
        </div>
      )}
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
      <Button type="submit" disabled={pending || (profile && !profile.active)}>
        {pending ? "Requesting reset…" : "Send reset email"}
      </Button>
    </form>
  );
}
