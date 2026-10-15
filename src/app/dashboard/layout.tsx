import { Suspense } from "react";
import { StartupState } from "@/components/startup-state";
import { requireWorkspace } from "@/lib/workspace-session";
import { LiveShell } from "@/components/live-shell";
async function AuthorizedWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireWorkspace();
  return (
    <LiveShell
      profile={profile}
      analyticsEnabled={process.env.ONE_ODC_ANALYTICS_ENABLED === "true"}
      logisticsEnabled={process.env.ONE_ODC_LOGISTICS_ENABLED === "true"}
    >
      {children}
    </LiveShell>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<StartupState />}>
      <AuthorizedWorkspace>{children}</AuthorizedWorkspace>
    </Suspense>
  );
}
