"use client";
import { WorkspaceError } from "@/components/workspace-error";
export default function Error({ reset }: { reset: () => void }) {
  return <WorkspaceError reset={reset} standalone />;
}
