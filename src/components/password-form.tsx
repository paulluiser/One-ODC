"use client";
import { useActionState, useState } from "react";
import { setPassword } from "@/app/auth/set-password/actions";
import { Button } from "./ui/button";
import { ActionStatus } from "./workflow-forms";
export function PasswordForm() {
  const [state, action, pending] = useActionState(setPassword, { error: null });
  const [password, setValue] = useState("");
  const [confirmation, setConfirmation] = useState("");
  return (
    <form action={action} className="surface live-form">
      <div className="live-field">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          value={password}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="live-field">
        <label htmlFor="confirm-password">Confirm password</label>
        <input
          id="confirm-password"
          type="password"
          name="confirmation"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={pending}
        />
      </div>
      <p className="field-hint">
        Use 12–128 characters. Your password is sent only to Supabase Auth and
        is never stored in the One ODC database or audit payloads.
      </p>
      <ActionStatus state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Setting password…" : "Set password and continue"}
      </Button>
    </form>
  );
}
