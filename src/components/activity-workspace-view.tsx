"use client";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  ChevronRight,
  X,
  History,
  Settings2,
  CircleDollarSign,
  Pencil,
} from "lucide-react";
import { ActivityDownload } from "./activity-download";
import { FilterBar } from "./filter-bar";
import {
  ActivityActionDialog,
  type ActivityFormOptions,
} from "./activity-action-dialog";
import type { ActivityRow } from "@/lib/activity-workspace";
import type { Activity, Monitoring } from "@/lib/monitoring";
import styles from "./activity-workspace.module.css";
type Props = {
  project: string;
  m: Monitoring;
  rows: ActivityRow[];
  allCount: number;
  financialCount: number;
  correctionCount: number;
  count: number;
  offset: number;
  error: string;
  query: Record<string, string | string[] | undefined>;
  selected?: ActivityRow;
  activity?: Activity;
  options: ActivityFormOptions;
  manager: boolean;
  categories: string[];
  actors: string[];
  spaces: { id: string; name: string }[];
  contextIds: string[] | null;
  files: { id: string; name: string }[];
  versions: {
    number: number;
    at: string;
    actor: string;
    reason: string;
    changes: ActivityRow["changes"];
  }[];
};
export function ActivityWorkspaceView(p: Props) {
  const router = useRouter(),
    path = usePathname(),
    query = useSearchParams(),
    [action, setAction] = useState<string | null>(null);
  const text = (k: string) =>
    typeof p.query[k] === "string" ? p.query[k] : "";
  const url = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(query.toString());
    Object.entries(values).forEach(([k, v]) =>
      v === null ? next.delete(k) : next.set(k, v),
    );
    return `${path}?${next}`;
  };
  const close = () =>
    router.push(url({ activity_detail: null }), { scroll: false });
  const date = (at: string) =>
    new Intl.DateTimeFormat("en-PH", {
      timeZone: p.m.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(at));
  const changes = (rows: ActivityRow["changes"]) => (
    <dl className={styles.changes}>
      {rows.map((c) => (
        <div key={c.label}>
          <dt>{c.label}</dt>
          <dd>
            <span>{c.before}</span>
            <span aria-hidden="true">→</span>
            <strong>{c.after}</strong>
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className={styles.workspace}>
      <section
        className={`surface ${styles.section}`}
        aria-label="Project activity"
      >
        <header className={styles.sectionHeader}>
          <div>
            <h2>Activity and history</h2>
            <p>Project updates and preserved records in one timeline.</p>
          </div>
        </header>
        <div className={styles.overview}>
          <div>
            <History size={19} aria-hidden="true" />
            <strong>{p.allCount}</strong>
            <span>Total authorized events</span>
          </div>
          <div>
            <CircleDollarSign size={19} aria-hidden="true" />
            <strong>{p.financialCount}</strong>
            <span>Financial events</span>
          </div>
          <div>
            <Pencil size={19} aria-hidden="true" />
            <strong>{p.correctionCount}</strong>
            <span>Corrections</span>
          </div>
        </div>
        {p.contextIds && (
          <p className={styles.context}>
            Showing the linked record’s history.{" "}
            <Link
              href={url({
                finance_history: null,
                quotation_history: null,
                offset: null,
                activity_detail: null,
              })}
            >
              View all project activity
            </Link>
          </p>
        )}
        <FilterBar
          resultCount={p.count}
          resultLabel="events"
          values={{
            activity_q: text("activity_q"),
            category: text("category"),
            actor: text("actor"),
            space: text("space"),
            from: text("from"),
            to: text("to"),
            activity_sort: text("activity_sort") || "newest",
          }}
          config={{
            label: "Activity filters",
            search: {
              key: "activity_q",
              label: "Search activities",
              placeholder: "Search activities…",
            },
            sort: {
              key: "activity_sort",
              defaultValue: "newest",
              options: [
                { value: "newest", label: "Newest first" },
                { value: "oldest", label: "Oldest first" },
              ],
            },
            paginationKeys: ["offset"],
            fields: [
              {
                key: "category",
                label: "Event category",
                options: [
                  { value: "", label: "All categories" },
                  ...p.categories.map((c) => ({
                    value: c,
                    label: c === "System Event" ? "System & Operations" : c,
                  })),
                ],
              },
              { key: "from", label: "From date", type: "date" },
              { key: "to", label: "To date", type: "date" },
              {
                key: "actor",
                label: "Actor",
                options: [
                  { value: "", label: "All actors" },
                  ...p.actors.map((a) => ({ value: a, label: a })),
                ],
              },
              {
                key: "space",
                label: "Related Space",
                options: [
                  { value: "", label: "All spaces" },
                  ...p.spaces.map((s) => ({ value: s.id, label: s.name })),
                ],
              },
            ],
          }}
        />
        {p.error && (
          <p role="alert" className={styles.error}>
            {p.error}{" "}
            <Link href={url({ from: null, to: null, offset: null })}>
              Clear date filters
            </Link>
          </p>
        )}
        {!p.rows.length && !p.error && (
          <p role="status" className={styles.empty}>
            No authorized events match these filters.
          </p>
        )}
        <div
          className={styles.directory}
          role="region"
          aria-label="Activity events"
        >
          {p.rows.map((e) => (
            <Link
              key={e.id}
              href={url({ activity_detail: e.id })}
              scroll={false}
              className={styles.row}
              data-event-id={e.id}
              aria-label={`View activity ${e.title} ${e.related}`}
            >
              <span className={styles.dot} aria-hidden="true" />
              <strong>{e.title}</strong>
              <span className={styles.badge} data-category={e.category}>
                {e.category}
              </span>
              <span className={styles.description}>
                {e.description || e.reason || e.related}
              </span>
              <span className={styles.actor}>
                <span>{e.actor}</span>
                <time dateTime={e.at}>{date(e.at)}</time>
                <small>{e.related}</small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
        <nav className={styles.pagination} aria-label="Activity pages">
          {p.offset > 0 && (
            <Link
              href={url({
                offset: String(Math.max(0, p.offset - 50)),
                activity_detail: null,
              })}
            >
              Previous events
            </Link>
          )}
          <span>
            {p.count
              ? `${p.offset + 1}–${Math.min(p.offset + 50, p.count)} of ${p.count}`
              : "0 events"}
          </span>
          {p.offset + 50 < p.count && (
            <Link
              href={url({
                offset: String(p.offset + 50),
                activity_detail: null,
              })}
            >
              Older events
            </Link>
          )}
        </nav>
      </section>
      {p.manager && (
        <section
          id="project-controls"
          className={`surface ${styles.section}`}
          aria-label="Project administration"
        >
          <header className={styles.sectionHeader}>
            <div>
              <h2>Project administration</h2>
              <p>Independent actions preserve project history.</p>
            </div>
            <Settings2 size={18} aria-hidden="true" />
          </header>
          <div className={styles.controls}>
            {[
              ...(p.m.cycles.some((c) => !c.ended_at)
                ? [p.m.state === "On Hold" ? "Resume" : "Hold", "Cancel"]
                : ["Reopen"]),
              "deadline",
              "coordinator",
            ].map((intent) => (
              <button
                key={intent}
                className={`button button-outline ${intent === "Cancel" ? styles.dangerOutline : ""}`}
                onClick={() => setAction(intent)}
              >
                {intent === "deadline"
                  ? "Update deadline"
                  : intent === "coordinator"
                    ? "Add Site Coordinator"
                    : `${intent} Project`}
              </button>
            ))}
          </div>
        </section>
      )}
      {text("activity_detail") && !p.selected && (
        <p role="alert">
          This event is unavailable to your account.{" "}
          <Link href={url({ activity_detail: null })}>Return to activity</Link>
        </p>
      )}
      {p.selected && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className={styles.sheetOverlay} />
            <Dialog.Content
              className={styles.sheet}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                requestAnimationFrame(() => {
                  const target =
                    Array.from(
                      document.querySelectorAll<HTMLElement>(
                        `a[data-event-id="${p.selected!.id}"]`,
                      ),
                    ).find((el) => el.getClientRects().length) ??
                    document.querySelector<HTMLElement>(
                      'input[placeholder="Search activities…"]',
                    );
                  target?.focus({ preventScroll: true });
                });
              }}
            >
              <header className={styles.modalHeader}>
                <div>
                  <Dialog.Title>{p.selected.title}</Dialog.Title>
                  <Dialog.Description>
                    {p.selected.category} · {p.selected.related}
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  className={styles.iconButton}
                  aria-label="Close activity details"
                >
                  <X size={20} />
                </Dialog.Close>
              </header>
              {/* The event body must be keyboard-scrollable even when the selected event has no links. */}
              {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Focusable scroll region for keyboard access. */}
              <div
                className={styles.sheetBody}
                role="region"
                aria-label="Activity detail content"
                tabIndex={0}
              >
                <p className={styles.context}>
                  {p.selected.actor} · {date(p.selected.at)}
                </p>
                <p className={styles.longText}>{p.selected.description}</p>
                {p.selected.reason && (
                  <section>
                    <h3>Recorded reason</h3>
                    <p className={styles.longText}>{p.selected.reason}</p>
                  </section>
                )}
                {p.selected.changes.length > 0 && (
                  <section>
                    <h3>Recorded changes</h3>
                    {changes(p.selected.changes)}
                  </section>
                )}
                {p.versions.length > 0 && (
                  <section>
                    <h3>Activity version history</h3>
                    {p.versions.map((v) => (
                      <article className={styles.version} key={v.number}>
                        <strong>Version {v.number}</strong>
                        <p>
                          {date(v.at)} · {v.actor}
                        </p>
                        <p className={styles.longText}>{v.reason}</p>
                        {changes(v.changes)}
                      </article>
                    ))}
                  </section>
                )}
                {p.files.length > 0 && (
                  <section>
                    <h3>Authorized file versions</h3>
                    {p.files.map((f) => (
                      <ActivityDownload key={f.id} id={f.id} name={f.name} />
                    ))}
                  </section>
                )}
                {p.selected.links.map((l) => (
                  <Link
                    className={styles.contextLink}
                    key={l.href}
                    href={l.href}
                  >
                    {l.label} →
                  </Link>
                ))}
              </div>
              {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
              <footer className={styles.sheetFooter}>
                {p.activity && (
                  <button
                    className="button button-primary"
                    onClick={() => setAction("correction")}
                  >
                    Correct activity
                  </button>
                )}
                <button className="button button-outline" onClick={close}>
                  Close
                </button>
              </footer>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {action && (
        <ActivityActionDialog
          key={action === "correction" ? p.activity?.id : action}
          project={p.project}
          m={p.m}
          intent={action === "correction" ? "activity" : action}
          activity={action === "correction" ? p.activity : undefined}
          options={{
            ...p.options,
            coordinators:
              action === "activity"
                ? p.options.coordinators.filter((c) => c.active)
                : p.options.coordinators,
          }}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}
