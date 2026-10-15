import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function AuthError() {
  return (
    <main className="state-page">
      <h1>This invitation could not be verified.</h1>
      <p>
        The link may have expired or already been used. Ask your System
        Administrator for a fresh invitation or password-reset link.
      </p>
      <Button asChild>
        <Link href="/login">Back to sign in</Link>
      </Button>
    </main>
  );
}
