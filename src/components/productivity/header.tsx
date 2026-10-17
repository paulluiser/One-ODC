"use client";
import { useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { HelpCircle, Star, X } from "lucide-react";
import type { Profile } from "@/lib/phase1";
import { productivityRequest, ErrorNotice } from "./common";
import styles from "./productivity.module.css";
const guidance: Record<string, string[]> = {
  system_administrator: [
    "Invite colleagues from Team access and assign their roles.",
    "Review access, assignments and audit history. Administrative corrections require a reason.",
  ],
  lead_designer: [
    "Review submitted leads: accept, request clarification or reject.",
    "Assign the project team and Spaces. Review submitted designs and quotations before approval.",
    "Confirm commercial handoff and operational readiness using existing project controls.",
  ],
  designer: [
    "Open your assigned projects and Spaces. Update only the Spaces assigned to you.",
    "Move work through In Progress and Submitted. Your Lead Designer completes approved designs.",
    "Prepare quotation drafts and track installation responsibilities where assigned.",
  ],
  bdm: [
    "Save a lead draft, then upload up to three active files or add HTTPS resource links.",
    "Submit for review and respond to clarification. Acceptance creates the project.",
    "Monitor related projects and approved quotations; manage authorized Sale information.",
  ],
  operations_admin: [
    "Before commercial closure, assigned projects provide a limited pipeline preview.",
    "After closure, acknowledge the handoff and manage authorized logistics and installation work.",
    "Quotations and restricted financial details stay unavailable.",
  ],
};
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content
        className={`detail-dialog ${styles.dialog}`}
        aria-describedby={undefined}
      >
        <div className={styles.row}>
          <Dialog.Title>{title}</Dialog.Title>
          <button
            type="button"
            aria-label="Close"
            className="button button-outline"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
export function WorkspaceHelp({
  profile,
  className,
}: {
  profile: Profile;
  className: string;
}) {
  const [open, setOpen] = useState(false),
    [dismissed, setDismissed] = useState(false);
  const orientation =
    useSyncExternalStore(
      (fn) => {
        window.addEventListener("storage", fn);
        return () => window.removeEventListener("storage", fn);
      },
      () => {
        try {
          return (
            localStorage.getItem(
              `one-odc-help:${profile.id}:${profile.role}`,
            ) !== "dismissed"
          );
        } catch {
          return true;
        }
      },
      () => false,
    ) && !dismissed;
  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(
        `one-odc-help:${profile.id}:${profile.role}`,
        "dismissed",
      );
    } catch {
      /* Session-only dismissal remains available. */
    }
  }
  return (
    <>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            className={className}
            type="button"
            aria-label="Workspace help"
            title="Help"
          >
            <HelpCircle size={18} />
          </button>
        </Dialog.Trigger>
        <Modal title="Your One ODC workspace" close={() => setOpen(false)}>
          <ol className={styles.guidance}>
            {guidance[profile.role]?.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
          <p>
            Use project directories to find authorized records. Project links
            never grant access. File previews are private and may require
            refreshing. Calendar combines permitted deadlines with your own
            events.
          </p>
          <p>
            For access or invitation help, contact your System Administrator.
          </p>
        </Modal>
      </Dialog.Root>
      {orientation && (
        <aside className={styles.orientation} aria-label="First-use guidance">
          <p>{guidance[profile.role]?.[0]}</p>
          <button
            className="button button-outline"
            type="button"
            onClick={() => setOpen(true)}
          >
            Quick help
          </button>
          <button
            className="button button-outline"
            type="button"
            onClick={dismiss}
          >
            Dismiss guidance
          </button>
        </aside>
      )}
    </>
  );
}
type Shortcut = {
  project_id: string;
  favorite: boolean;
  viewed_at: string;
  projects: { id: string; name: string; reference: string };
};
export function ProjectShortcuts({ className }: { className: string }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Shortcut[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    setRows([]);
    try {
      setRows(
        (
          await productivityRequest<{ records: Shortcut[] }>({
            action: "shortcuts",
          })
        ).records,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void load();
        else setRows([]);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className={className}
          type="button"
          aria-label="Favorite and recent projects"
          title="Project shortcuts"
        >
          <Star size={18} />
        </button>
      </Dialog.Trigger>
      <Modal title="Your project shortcuts" close={() => setOpen(false)}>
        {busy && <p role="status">Loading authorized projects…</p>}
        <ErrorNotice message={error} retry={() => void load()} />
        {["Favorites", "Recently viewed"].map((label, i) => (
          <section key={label}>
            <h3>{label}</h3>
            {rows
              .filter((r) => i === 1 || r.favorite)
              .sort((a, b) =>
                i === 1 ? b.viewed_at.localeCompare(a.viewed_at) : 0,
              )
              .slice(0, i ? 10 : 100)
              .map((r) => (
                <Link
                  className={styles.result}
                  key={r.project_id}
                  href={`/dashboard/projects/${r.project_id}`}
                  onClick={() => setOpen(false)}
                >
                  {r.projects.name}
                  <small>{r.projects.reference}</small>
                </Link>
              ))}
            {!busy && !rows.some((r) => i === 1 || r.favorite) && (
              <p>No {label.toLowerCase()} projects yet.</p>
            )}
          </section>
        ))}
      </Modal>
    </Dialog.Root>
  );
}
