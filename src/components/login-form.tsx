"use client";
import { useActionState, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { signIn } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
export function LoginForm({ configured }: { configured: boolean }) {
  const [visible, setVisible] = useState(false);
  const [state, action, pending] = useActionState(signIn, { error: null });
  return (
    <>
      <form
        action={action}
        className="login-form"
        aria-describedby="login-note"
      >
        <label htmlFor="email">Work email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="you@company.com"
          disabled={pending}
        />
        <label htmlFor="password">Password</label>
        <div className="password-input">
          <input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            disabled={pending}
          />
          <button
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending || !configured}>
          {pending ? <LoaderCircle className="spin" size={18} /> : null}
          {pending ? "Signing in…" : "Sign in to your workspace"}
          <ArrowRight size={17} />
        </Button>
        <Link href="/auth/forgot-password">Forgot password?</Link>
        <p id="login-note" className="login-note">
          <LockKeyhole size={14} />
          {configured
            ? "Invitation-only access. Contact your System Administrator for help."
            : "Sign-in will be available after Supabase is configured."}
        </p>
      </form>
      <div className="demo-login">
        <span>Take a look around</span>
        <Link href="/demo">
          Explore the demo workspace <ArrowRight size={15} />
        </Link>
        <small>Fictional projects. No sign-in required.</small>
      </div>
    </>
  );
}
