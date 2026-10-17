"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { Search, HelpCircle, Star, X } from "lucide-react";
import type { Profile } from "@/lib/phase1";
import type { SearchHit } from "@/lib/productivity";
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
export function GlobalSearch({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const id = useId();
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void productivityRequest<{ results: SearchHit[] }>(
        { action: "search", q },
        controller.signal,
      )
        .then((data) => {
          if (!controller.signal.aborted) setHits(data.results);
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(
              e instanceof Error
                ? e.message
                : "Search could not be loaded. Please retry.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, q, retry]);
  const ready = q.trim().length >= 2;
  return (
    <div
      ref={root}
      className={`${styles.inlineSearch} ${className}`}
      role="search"
      aria-label="Workspace search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <div className={styles.searchBar}>
        <Search size={20} strokeWidth={1.8} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          aria-label="Search workspace"
          placeholder="Search"
          autoComplete="off"
          maxLength={200}
          aria-controls={open && ready ? `${id}-results` : undefined}
          aria-describedby={open && ready ? `${id}-status` : undefined}
          value={q}
          onFocus={() => {
            if (!open) {
              setOpen(true);
              setBusy(ready);
              setHits([]);
              setError("");
            }
          }}
          onClick={() => {
            if (!open) {
              setOpen(true);
              setBusy(ready);
              setHits([]);
              setError("");
            }
          }}
          onChange={(event) => {
            setQ(event.target.value);
            setOpen(true);
            setBusy(event.target.value.trim().length >= 2);
            setHits([]);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
            if (
              (event.key === "ArrowDown" || event.key === "ArrowUp") &&
              hits.length
            ) {
              event.preventDefault();
              refs.current[
                event.key === "ArrowDown" ? 0 : hits.length - 1
              ]?.focus();
            }
            if (event.key === "Enter" && hits.length) {
              event.preventDefault();
              refs.current[0]?.click();
            }
          }}
        />
      </div>
      {open && ready && (
        <div
          id={`${id}-results`}
          className={styles.searchDropdown}
          role="region"
          aria-label="Search results"
          aria-busy={busy}
        >
          <p id={`${id}-status`} role="status" className={styles.searchStatus}>
            {busy
              ? "Searching authorized records…"
              : !ready
                ? "Search projects, leads, spaces or suppliers. Enter at least two characters."
                : error
                  ? ""
                  : !hits.length
                    ? "No matching records."
                    : `${hits.length} matching records`}
          </p>
          <ErrorNotice
            message={error}
            retry={() => {
              setBusy(true);
              setError("");
              setRetry((v) => v + 1);
            }}
          />
          <div className={styles.results}>
            {hits.map((hit, index) => (
              <div key={hit.href}>
                {(index === 0 || hits[index - 1].kind !== hit.kind) && (
                  <h3 className={styles.searchGroup}>{hit.kind}</h3>
                )}
                <Link
                  ref={(el) => {
                    refs.current[index] = el;
                  }}
                  href={hit.href}
                  className={styles.result}
                  onClick={() => {
                    setOpen(false);
                    setQ("");
                    setHits([]);
                    setBusy(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      input.current?.focus();
                      setOpen(false);
                    }
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      const next = index + (event.key === "ArrowDown" ? 1 : -1);
                      if (next < 0 || next >= hits.length)
                        input.current?.focus();
                      else refs.current[next]?.focus();
                    }
                  }}
                >
                  <strong>{hit.title}</strong>
                  {hit.detail && <small>{hit.detail}</small>}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
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
            Use Search to find authorized records. Project links never grant
            access. File previews are private and may require refreshing.
            Calendar combines permitted deadlines with your own events.
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
