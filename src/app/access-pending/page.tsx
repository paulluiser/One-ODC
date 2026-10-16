import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { OneODCLogo } from "@/components/one-odc-logo";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
export default async function AccessPending() {
  const client = await createClient();
  if (!client) redirect("/login");
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="state-page">
      {process.env.ONE_ODC_UI_R0_ENABLED === "true" ? (
        <OneODCLogo />
      ) : (
        <Brand />
      )}
      <h1>Your account needs to be activated.</h1>
      <p>
        Contact your System Administrator to assign a role and enable your One
        ODC access.
      </p>
      <form action={signOut}>
        <Button variant="outline">Sign out</Button>
      </form>
    </main>
  );
}
