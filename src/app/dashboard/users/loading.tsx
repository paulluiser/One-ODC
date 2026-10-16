import { OperationsLoading } from "@/components/ui-r4/primitives";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
export default function Loading() {
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true")
    return <OperationsLoading destination="team accounts" />;
  return <WorkspaceSkeleton destination="users" />;
}
