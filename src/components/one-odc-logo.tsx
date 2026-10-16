import styles from "./one-odc-logo.module.css";
/** Supplied vector paths remain untouched. CSS selects the theme before hydration. */
export function OneODCLogo({
  variant = "horizontal",
  theme = "auto",
  className = "",
  decorative = false,
}: {
  variant?: "horizontal" | "compact" | "icon";
  theme?: "auto" | "light" | "dark";
  className?: string;
  decorative?: boolean;
}) {
  const icon = variant === "icon";
  const alt = decorative ? "" : "One ODC · Opulence Design Concept";
  const base = "/brand/opulence/one-odc";
  return (
    <span
      className={`${styles.logo} ${styles[variant]} ${className}`}
      data-logo-theme={theme}
      aria-hidden={decorative || undefined}
    >
      {icon ? (
        <img
          src={`${base}-icon-transparent.svg`}
          alt={alt}
          width={32}
          height={32}
        />
      ) : (
        <>
          <img
            className={styles.light}
            src="/brand/opulence/display/one-odc-logo-light.svg"
            alt={alt}
            width={202}
            height={63}
          />
          <img
            className={styles.dark}
            src="/brand/opulence/display/one-odc-logo-dark.svg"
            alt={alt}
            width={202}
            height={63}
          />
        </>
      )}
    </span>
  );
}
