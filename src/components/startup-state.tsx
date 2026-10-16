import { CompositionStartup } from "./composition-startup";
import { Brand } from "./brand";
export function StartupState({
  message,
  modern = false,
}: {
  message?: string;
  modern?: boolean;
}) {
  const copy =
    message ??
    (modern ? "Preparing your workspace" : "Checking workspace access…");
  if (modern) return <CompositionStartup message={copy} />;
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
          {copy}
        </p>
        <span className="startup-indicator" aria-hidden="true" />
      </div>
    </main>
  );
}
