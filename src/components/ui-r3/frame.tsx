import type { ReactNode } from "react";
import { Scope, Heading } from "../ui-r2/primitives";
import styles from "./ui-r3.module.css";
export function CommercialFrame({
  title,
  description,
  children,
  navigation,
}: {
  title: string;
  description: string;
  children: ReactNode;
  navigation: ReactNode;
}) {
  return (
    <Scope>
      <div className={styles.workspace}>
        <Heading title={title} description={description} />
        {navigation}
        {children}
      </div>
    </Scope>
  );
}
export function CommercialLoading({
  destination,
}: {
  destination: "quotation" | "finance";
}) {
  return (
    <section
      className={styles.loading}
      aria-busy="true"
      aria-label={`Loading ${destination}`}
    >
      <p role="status">
        Loading{" "}
        {destination === "quotation"
          ? "quotation workspace"
          : "financial management"}
        …
      </p>
      <div aria-hidden="true" />
      <div aria-hidden="true" />
      <div aria-hidden="true" />
    </section>
  );
}
