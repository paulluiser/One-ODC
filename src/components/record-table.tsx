import type { ReactNode } from "react";
// Keyboard users can scroll columns without changing the table's native semantics.
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
export function RecordTable({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="table-scroll commercial-table"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
/* eslint-enable jsx-a11y/no-noninteractive-tabindex */
export function RecordStatus({ children }: { children: string }) {
  return (
    <span className="record-status" data-status={children}>
      {children}
    </span>
  );
}
