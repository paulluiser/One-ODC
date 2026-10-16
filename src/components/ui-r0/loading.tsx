import styles from "./ui-r0.module.css";
export function DashboardLoading({
  destination = "dashboard",
}: {
  destination?: "dashboard" | "analytics";
}) {
  return (
    <section
      className={styles.loading}
      aria-busy="true"
      aria-label={`Loading ${destination}`}
    >
      <p role="status">
        {destination === "analytics"
          ? "Loading project analytics…"
          : "Loading your authorized workspace…"}
      </p>
      <div
        aria-hidden="true"
        className={`${styles.loadingBlock} ${styles.loadingTitle}`}
      />
      <div aria-hidden="true" className={styles.stats}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={styles.loadingBlock} />
        ))}
      </div>
      <div aria-hidden="true" className={styles.focusGrid}>
        {[0, 1].map((i) => (
          <div
            key={i}
            className={`${styles.loadingBlock} ${styles.loadingQueue}`}
          />
        ))}
      </div>
    </section>
  );
}
