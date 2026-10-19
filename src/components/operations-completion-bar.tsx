import Link from "next/link";
import { Flag, CheckCircle2 } from "lucide-react";
import type { Readiness } from "@/lib/installations";
import { InstallationActionDialog } from "./installation-action-dialog";
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
      aria-label="Project operations completion"
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
          Project operations completion
        </h3>
        <p>
          {readiness.completed
            ? "Operations completed. Previous completion and audit records are preserved."
            : "Mark the project complete once all operational prerequisites are satisfied."}
        </p>
      </div>
      {readiness.completed && (
        <div className={styles.completionState}>
          <strong>Operationally completed</strong>
        </div>
      )}
      {readiness.completed ? (
        <Link
          href={`/dashboard/projects/${project}?tab=activity&section=history`}
        >
          View completion history →
        </Link>
      ) : readiness.can_complete ? (
        <InstallationActionDialog
          project={project}
          readiness={readiness}
          primary
        />
      ) : null}
    </section>
  );
}
