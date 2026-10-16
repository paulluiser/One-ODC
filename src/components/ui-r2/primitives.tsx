import { ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import styles from "./ui-r2.module.css";
/** Native disclosure semantics; the scoped rebuild supplies the visual treatment. */
export function DisclosureSummary({
  children,
  ...props
}: ComponentProps<"summary">) {
  return (
    <summary {...props}>
      <span className={styles.summaryLabel}>{children}</span>
      <ChevronRight className={styles.chevron} size={18} aria-hidden="true" />
    </summary>
  );
}
export function Disclosure({
  title,
  children,
  ...props
}: Omit<ComponentProps<"details">, "title"> & { title: ReactNode }) {
  return (
    <details {...props}>
      <DisclosureSummary>{title}</DisclosureSummary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}
export function Scope({ children }: { children: ReactNode }) {
  return (
    <div className={styles.scope} data-ui-r2>
      {children}
    </div>
  );
}
export function Heading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className={styles.heading}>
      <div>
        <p className={styles.eyebrow}>ONE ODC · WORKSPACE</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Status({ children }: { children: ReactNode }) {
  const label = typeof children === "string" ? children : "";
  const tone =
    /^(Completed|Approved|Accepted|Delivered|Acknowledged|Active|Operationally Completed)$/.test(
      label,
    )
      ? "success"
      : /^(Cancelled|Rejected|Inactive)$/.test(label)
        ? "destructive"
        : /^(On Hold|For Revision|Returned for Revision|Overdue|At Risk|Pending Acknowledgment)$/.test(
              label,
            )
          ? "warning"
          : /^(Draft|Not Started|Not Scheduled|Not available|Not Applicable)$/.test(
                label,
              )
            ? "neutral"
            : "info";
  return (
    <span className={styles.status} data-status-tone={tone}>
      {children}
    </span>
  );
}
export function SpaceRow({
  enabled,
  title,
  status,
  designer,
  deadline,
  risk,
  children,
  ...props
}: {
  enabled: boolean;
  title: string;
  status: string;
  designer: string;
  deadline: string;
  risk: string;
  children: ReactNode;
  id: string;
}) {
  if (!enabled)
    return (
      <article className="space-card" {...props}>
        {children}
      </article>
    );
  return (
    <details className={styles.spaceRow} {...props}>
      <DisclosureSummary>
        <span className={styles.spaceIdentity}>
          <strong>{title}</strong>
          <span>{designer}</span>
        </span>
        <Status>{status}</Status>
        <span className={styles.spaceDeadline}>
          <span>Deadline</span>
          <strong>{deadline}</strong>
        </span>
        <span className={styles.risk}>{risk}</span>
      </DisclosureSummary>
      <div className={styles.spaceBody}>{children}</div>
    </details>
  );
}
