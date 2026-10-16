import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import { DashboardLoading } from "@/components/ui-r0/loading";
export default function Loading() {
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true")
    return <DashboardLoading destination="analytics" />;
  return <WorkspaceSkeleton destination="analytics" />;
}
