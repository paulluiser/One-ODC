import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./ui-r0.module.css";
export function Panel({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <section className={`${styles.panel} ${className}`} aria-label={label}>
      {children}
    </section>
  );
}
export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function StatTile({
  label,
  value,
  description,
  href,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: number | string;
  description: string;
  href: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${styles.statTile} ${accent ? styles.accentStat : ""} ${value === "Not Available" ? styles.statUnavailable : ""}`}
    >
      <div className={styles.statTop}>
        <span>
          <Icon size={17} aria-hidden="true" />
          {label}
        </span>
        <ArrowUpRight size={17} aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      <p>{description}</p>
    </Link>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={styles.empty}>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
