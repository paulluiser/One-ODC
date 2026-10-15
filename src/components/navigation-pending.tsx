"use client";
import { useLinkStatus } from "next/link";
export function NavigationPending() {
  const { pending } = useLinkStatus();
  return (
    <span className="nav-pending" aria-hidden="true" data-pending={pending} />
  );
}
