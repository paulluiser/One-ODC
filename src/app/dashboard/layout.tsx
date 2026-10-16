import { Suspense } from "react";
import { StartupState } from "@/components/startup-state";
import { requireWorkspace } from "@/lib/workspace-session";
import { RebuildShell } from "@/components/ui-r0/shell";
import { checkDatabase } from "@/lib/live-data";
import { LiveShell } from "@/components/live-shell";
async function AuthorizedWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, client } = await requireWorkspace();
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true") {
    const count = await client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    checkDatabase(count.error);
    return (
      <RebuildShell
        profile={profile}
        unread={count.count ?? 0}
        calendarEnabled={process.env.ONE_ODC_CALENDAR_ENABLED === "true"}
      >
        {children}
      </RebuildShell>
    );
  }
  return (
    <LiveShell
      profile={profile}
      calendarEnabled={process.env.ONE_ODC_CALENDAR_ENABLED === "true"}
      analyticsEnabled={process.env.ONE_ODC_ANALYTICS_ENABLED === "true"}
      logisticsEnabled={process.env.ONE_ODC_LOGISTICS_ENABLED === "true"}
    >
      {children}
    </LiveShell>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <StartupState modern={process.env.ONE_ODC_UI_R0_ENABLED === "true"} />
      }
    >
      <AuthorizedWorkspace>{children}</AuthorizedWorkspace>
    </Suspense>
  );
}
