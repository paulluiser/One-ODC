import { Suspense } from "react";
const names = {
  workspace: "workspace",
  dashboard: "dashboard",
  projects: "project directory",
  project: "project details",
  analytics: "analytics",
  calendar: "calendar",
  leads: "leads",
  lead: "lead details",
  suppliers: "suppliers",
  users: "user management",
  notifications: "notifications",
} as const;
export function WorkspaceSkeleton({
  destination = "workspace",
}: {
  destination?: keyof typeof names;
}) {
  const metrics = ["dashboard", "analytics"].includes(destination);
  const detail = ["project", "lead"].includes(destination);
  return (
    <section
      className="workspace-skeleton"
      aria-busy="true"
      aria-label={`Loading ${names[destination]}`}
    >
      <p role="status" aria-live="polite" className="loading-caption">
        Loading {names[destination]}…
      </p>
      <div aria-hidden="true">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line skeleton-subtitle" />
        {destination === "dashboard" && (
          <div className="surface skeleton-attention">
            <span className="skeleton-line" />
            <span className="skeleton-line" />
          </div>
        )}
        {destination !== "dashboard" && (
          <div className="skeleton-toolbar">
            {Array.from({ length: detail ? 5 : 4 }, (_, i) => (
              <span className="skeleton-line" key={i} />
            ))}
          </div>
        )}
        {metrics && (
          <div className="skeleton-metrics">
            {Array.from(
              { length: destination === "analytics" ? 5 : 4 },
              (_, i) => (
                <div className="surface skeleton-metric" key={i}>
                  <span className="skeleton-line" />
                  <span className="skeleton-line" />
                </div>
              ),
            )}
          </div>
        )}
        <div className="surface skeleton-table">
          {Array.from({ length: detail ? 4 : 6 }, (_, i) => (
            <div className="skeleton-row" key={i}>
              <span className="skeleton-line" />
              <span className="skeleton-line" />
              <span className="skeleton-line" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
// Streams one async section without blocking its siblings.
export function Section({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        fallback ?? (
          <div className="surface section-skeleton" aria-busy="true">
            <span className="skeleton-line skeleton-subtitle" />
            <span className="skeleton-line" />
            <span className="skeleton-line" />
          </div>
        )
      }
    >
      {children}
    </Suspense>
  );
}
