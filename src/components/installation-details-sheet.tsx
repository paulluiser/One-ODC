"use client";
import type { ComponentProps } from "react";
import { OperationsDetailsSheet } from "./operations-details-sheet";
export function InstallationDetailsSheet({
  designer,
  ...props
}: Omit<
  ComponentProps<typeof OperationsDetailsSheet>,
  "kind" | "description"
> & { designer: string }) {
  return (
    <OperationsDetailsSheet
      {...props}
      kind="installation"
      description={designer}
    />
  );
}
