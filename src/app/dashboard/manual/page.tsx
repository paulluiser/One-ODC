import { requireWorkspace } from "@/lib/workspace-session";
import { manualGuides } from "@/lib/user-manual";
import { UserManual } from "@/components/user-manual";
export default async function ManualPage() {
  const { profile } = await requireWorkspace();
  const availability = Object.fromEntries(
    [
      ...new Set(
        manualGuides.flatMap((guide) => (guide.feature ? [guide.feature] : [])),
      ),
    ].map((feature) => [
      feature,
      feature !== "INSTALLATIONS" &&
        process.env[`ONE_ODC_${feature}_ENABLED`] === "true",
    ]),
  );
  return <UserManual ownRole={profile.role} availability={availability} />;
}
