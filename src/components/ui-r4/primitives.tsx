import type { ReactNode } from "react";
import { Ellipsis, ChevronRight, ChevronDown } from "lucide-react";
import { RecordTable } from "../record-table";
import { ContextPanel } from "../context-panel";
import { Scope, Heading } from "../ui-r2/primitives";
import dialog from "../ui-r3/ui-r3.module.css";
import styles from "./ui-r4.module.css";
export function OperationsFrame({
  children,
  title,
  description,
  action,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Scope>
      <div className={styles.workspace}>
        {title && (
          <Heading
            title={title}
            description={description ?? ""}
            action={action}
          />
        )}{" "}
        {children}
      </div>
    </Scope>
  );
}
export function OperationEditor({
  title,
  children,
  enabled,
  description = "Changes preserve existing records and audit history.",
  menu = false,
}: {
  title: string;
  children: ReactNode;
  enabled: boolean;
  description?: string;
  menu?: boolean;
}) {
  if (!enabled)
    return (
      <details>
        <summary>{title}</summary>
        {children}
      </details>
    );
  return (
    <ContextPanel
      title={title}
      description={description}
      panelClassName={`${dialog.dialog} ${styles.dialog}`}
      triggerLabel={
        menu ? (
          <span aria-label={title} title={title}>
            <Ellipsis size={16} aria-hidden="true" />
          </span>
        ) : (
          title
        )
      }
      primary={title.startsWith("Add ") || title.startsWith("Invite ")}
      blockPending
      resetOnClose
    >
      {children}
    </ContextPanel>
  );
}
export function OperationSummary({
  children,
  ...props
}: React.ComponentProps<"summary">) {
  return (
    <summary {...props}>
      <span>{children}</span>
      <ChevronRight className={styles.collapsed} size={18} aria-hidden="true" />
      <ChevronDown className={styles.expanded} size={18} aria-hidden="true" />
    </summary>
  );
}
export function OperationsLoading({ destination }: { destination: string }) {
  return (
    <section
      className={styles.loading}
      aria-busy="true"
      aria-label={`Loading ${destination}`}
    >
      <p role="status">Loading {destination}…</p>
      <div />
      <div />
      <div />
    </section>
  );
}
export function LogisticsTracker({
  stages,
  current,
}: {
  stages: readonly string[];
  current: string;
}) {
  return (
    <div className={styles.tracker}>
      <p>
        Current stage: <strong>{current}</strong>
      </p>
      <RecordTable label="Logistics stage sequence">
        <ol aria-label="Logistics stage sequence">
          {stages.map((s, i) => (
            <li key={s} aria-current={s === current ? "step" : undefined}>
              <span>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </RecordTable>
      <small>
        Sequence reference only. Earlier or skipped stages are not marked
        completed.
      </small>
    </div>
  );
}

export function ReadinessGroups({
  blockers,
  project,
}: {
  blockers: { kind: string; id?: string; label: string }[];
  project: string;
}) {
  const groups = [
    ["Project and handoff", ["commercial", "handoff", "lifecycle", "cycle"]],
    ["Space design", ["design"]],
    ["Installation", ["installation"]],
    ["Supplier and logistics", ["logistics"]],
  ] as const;
  return (
    <div className={styles.checklist}>
      {groups.map(([title, kinds]) => {
        const rows = blockers.filter((b) =>
          (kinds as readonly string[]).includes(b.kind),
        );
        return (
          <section key={title}>
            <h4>
              {title}
              <span>
                {rows.length
                  ? `${rows.length} requiring action`
                  : "No blockers"}
              </span>
            </h4>
            {rows.length ? (
              <ul>
                {rows.map((b, i) => (
                  <li key={b.id ?? i}>
                    <span>{b.label}</span>
                    {b.id && (
                      <a
                        href={
                          b.kind === "logistics"
                            ? `/dashboard/projects/${project}?tab=logistics#logistics-${b.id}`
                            : b.kind === "design"
                              ? `/dashboard/projects/${project}#space-${b.id}`
                              : `#installation-${b.id}`
                        }
                      >
                        View record
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No outstanding prerequisites in this group.</p>
            )}
          </section>
        );
      })}
      {blockers
        .filter(
          (b) =>
            !groups.some(([, k]) => (k as readonly string[]).includes(b.kind)),
        )
        .map((b, i) => (
          <p key={i}>{b.label}</p>
        ))}
    </div>
  );
}
