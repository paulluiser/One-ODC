import { Brand } from "./brand";
export function StartupState({
  message = "Checking workspace access…",
}: {
  message?: string;
}) {
  return (
    <main className="startup-state" aria-busy="true">
      <div className="startup-blueprint" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="startup-content">
        <Brand />
        <h1>
          Every space. <span>One vision.</span>
        </h1>
        <p role="status" aria-live="polite">
          {message}
        </p>
        <span className="startup-indicator" aria-hidden="true" />
      </div>
    </main>
  );
}
