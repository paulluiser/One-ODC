import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import styles from "./filter-bar.module.css";

/** Shared layout for read-only query filters. Keep GET forms outside unsaved-change protection. */
export function FilterBar({
  children,
  resetHref,
  pending = false,
  beforeFields,
  afterFields,
  className = "",
  ...props
}: Omit<ComponentProps<"form">, "method"> & {
  resetHref: string;
  pending?: boolean;
  beforeFields?: ReactNode;
  afterFields?: ReactNode;
}) {
  return (
    <form
      {...props}
      method="get"
      className={`${styles.bar} ${className}`}
      aria-busy={pending || props["aria-busy"]}
    >
      {beforeFields}
      <div className={styles.fields}>{children}</div>
      <div className={styles.actions}>
        <button
          className="button button-primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Applying…" : "Apply filters"}
        </button>
        <Link href={resetHref}>Reset filters</Link>
      </div>
      {afterFields}
    </form>
  );
}
