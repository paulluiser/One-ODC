import Link from "next/link";
import { OneODCLogo } from "@/components/one-odc-logo";
import { PasswordResetForm } from "@/components/password-reset-form";
export default function ForgotPassword() {
  return (
    <main className="password-page">
      <OneODCLogo />
      <h1>Forgot your password?</h1>
      <p>Enter your work email to request a secure password-reset link.</p>
      <PasswordResetForm />
      <Link href="/login">Back to sign in</Link>
    </main>
  );
}
