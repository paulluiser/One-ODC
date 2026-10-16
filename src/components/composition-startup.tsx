import { OneODCLogo } from "./one-odc-logo";
import styles from "./composition-startup.module.css";

/** Decorative assembly loops gently; access verification alone controls its lifetime. */
export function CompositionStartup({ message }: { message: string }) {
  return (
    <main
      className={styles.screen}
      aria-busy="true"
      aria-labelledby="startup-title"
    >
      <div className={styles.content}>
        <svg
          className={styles.composition}
          viewBox="0 0 240 180"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <rect
            className={styles.frame}
            x="18"
            y="28"
            width="204"
            height="124"
            rx="8"
          />
          <rect
            className={`${styles.panel} ${styles.left}`}
            x="30"
            y="40"
            width="54"
            height="100"
            rx="4"
          />
          <rect
            className={`${styles.panel} ${styles.top}`}
            x="96"
            y="40"
            width="114"
            height="40"
            rx="4"
          />
          <rect
            className={`${styles.panel} ${styles.base}`}
            x="96"
            y="92"
            width="70"
            height="48"
            rx="4"
          />
          <rect
            className={`${styles.panel} ${styles.end}`}
            x="178"
            y="92"
            width="32"
            height="48"
            rx="4"
          />
          <path
            className={styles.join}
            d="M18 48V36a8 8 0 0 1 8-8h12M202 152h12a8 8 0 0 0 8-8v-12"
          />
        </svg>
        <OneODCLogo className={styles.logo} />
        <h1 id="startup-title" className={styles.tagline}>
          Every space. One vision.
        </h1>
        <p
          className={styles.message}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {message}
        </p>
      </div>
    </main>
  );
}
