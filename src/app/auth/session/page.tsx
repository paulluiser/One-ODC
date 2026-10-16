import { InvitationLanding } from "@/components/invitation-landing";
export default function InvitationSession() {
  return (
    <InvitationLanding
      modern={process.env.ONE_ODC_UI_R0_ENABLED === "true"}
      fallback="/auth/error"
    />
  );
}
