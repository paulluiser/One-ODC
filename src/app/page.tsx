import { InvitationLanding } from "@/components/invitation-landing";
export default function Home() {
  return (
    <InvitationLanding
      modern={process.env.ONE_ODC_UI_R0_ENABLED === "true"}
      fallback="/dashboard"
    />
  );
}
