import Link from "next/link";
import { Flag, CheckCircle2 } from "lucide-react";
import type { Readiness } from "@/lib/installations";
import styles from "./operations-workspace.module.css";
export function OperationsCompletionBar({
  project,
  readiness,
}: {
  project: string;
  readiness: Readiness;
}) {
  return (
    <section
      className={styles.completionBar}
      id="operations-outstanding"
      aria-label="Project completion"
      tabIndex={-1}
    >
      {readiness.completed ? (
        <CheckCircle2 aria-hidden="true" size={24} />
      ) : (
        <Flag aria-hidden="true" size={24} />
      )}
      <div className={styles.completionIntro}>
        <h3
          id="operational-readiness-title"
          tabIndex={-1}
          data-completed={readiness.completed}
        >
          Project completion
        </h3>
        <p>
          {readiness.completed
            ? "Project completed. Previous completion and audit records are preserved."
            : "Mark the project complete once all operational prerequisites are satisfied."}
        </p>
      </div>
      {readiness.completed && (
        <div className={styles.completionState}>
          <strong>Completed</strong>
        </div>
      )}
      {readiness.completed && (
        <Link
          href={`/dashboard/projects/${project}?tab=activity&section=history`}
        >
          View completion history →
        </Link>
      )}
    </section>
  );
}
