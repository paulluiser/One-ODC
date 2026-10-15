"use client";
import { useFormStatus } from "react-dom";
import { PendingIndicator } from "./operation-feedback";
export function FormPending() {
  const { pending } = useFormStatus();
  return <PendingIndicator pending={pending} />;
}
