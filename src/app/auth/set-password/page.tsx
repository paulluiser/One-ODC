import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OneODCLogo } from "@/components/one-odc-logo";
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
      {process.env.ONE_ODC_UI_R0_ENABLED === "true" ? (
        <OneODCLogo />
      ) : (
        <Brand />
      )}
      <h1>Set your One ODC password.</h1>
      <p>Complete your invited account setup.</p>
      <PasswordForm />
    </main>
  );
}
