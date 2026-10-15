import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Brand } from "@/components/brand";
import { PasswordForm } from "@/components/password-form";
export default async function SetPassword() {
  const client = await createClient();
  if (!client) redirect("/login");
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="password-page">
      <Brand />
      <h1>Set your One ODC password.</h1>
      <p>Complete your invited account setup.</p>
      <PasswordForm />
    </main>
  );
}
