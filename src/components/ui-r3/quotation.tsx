"use client";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useActionState, useId, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ChevronDown,
  History,
  X,
  Pencil,
  LockKeyhole,
  FileText,
} from "lucide-react";
import {
  formatPHP,
  type Quotation,
  type QuotationVersionSummary,
} from "@/lib/quotations";
import { formatTime, type FormState } from "@/lib/phase1";
import { reviewQuotationAction } from "@/app/dashboard/projects/quotation-actions";
import { Status } from "../ui-r2/primitives";
import { CreateQuotation, QuotationSpaceEditor } from "../quotation-editor";
import { QuotationComparison } from "../quotation-comparison";
import { RecordTable } from "../record-table";
import styles from "./quotation-workspace.module.css";
function QuoteFrame({
  title,
  description,
  kind,
  close,
  returnFocus,
  children,
}: {
  title: string;
  description: string;
  kind: "editor" | "history" | "review";
  close: () => void;
  returnFocus: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dismiss = () => {
    if (ref.current?.querySelector('[aria-busy="true"]')) return;
    if (
      ref.current?.querySelector('[data-unsaved="true"]') &&
      !window.confirm("Discard unsaved quotation changes?")
    )
      return;
    close();
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(value) => {
        if (!value) dismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          ref={ref}
          className={`${styles.dialog} ${styles[kind]}`}
          onCloseAutoFocus={(e) => {
            if (returnFocus.current?.isConnected) {
              e.preventDefault();
              returnFocus.current.focus();
            }
          }}
        >
          <header className={styles.dialogHeader}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
            <button
              type="button"
              className={styles.close}
              aria-label={`Close ${title}`}
              onClick={dismiss}
            >
              <X size={20} />
            </button>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function QuotationDecision({
  q,
  intent,
  admin,
  saved,
  close,
}: {
  q: Quotation;
  intent: "submit" | "Approved" | "Returned for Revision";
  admin: boolean;
  saved: (text: string) => void;
  close: () => void;
}) {
  const [remarks, setRemarks] = useState(""),
    [error, setError] = useState("");
  const id = useId();
  const required = admin || intent === "Returned for Revision";
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await reviewQuotationAction(previous, data);
      if (result.success) saved(result.success);
      return result;
    },
    { error: null },
  );
  const label =
    intent === "submit"
      ? "Submit for Review"
      : intent === "Approved"
        ? "Approve quotation"
        : "Return for Revision";
  return (
    <form
      action={action}
      className={styles.decisionForm}
      data-unsaved={!!remarks}
      aria-busy={pending}
      onSubmit={(e) => {
        if (required && !remarks.trim()) {
          e.preventDefault();
          setError("Enter a reason for this action.");
          document.getElementById(id)?.focus();
        }
      }}
    >
      <input type="hidden" name="project" value={q.project_id} />
      <input type="hidden" name="id" value={q.id} />
      <input type="hidden" name="version" value={q.edit_version} />
      <input type="hidden" name="intent" value={intent} />
      <div className={styles.dialogBody}>
        <dl className={styles.summary}>
          <dt>Quotation version</dt>
          <dd>
            Version {q.number} · {q.state}
          </dd>
          <dt>Saved total amount</dt>
          <dd>
            <strong>{formatPHP(q.total)}</strong>
          </dd>
          <dt>Applicable Spaces</dt>
          <dd>{q.spaces.filter((s) => !s.cancelled).length}</dd>
          <dt>Saved items in applicable Spaces</dt>
          <dd>
            {q.spaces
              .filter((s) => !s.cancelled)
              .reduce((sum, s) => sum + s.items.length, 0)}
          </dd>
        </dl>
        <label className={styles.reason} htmlFor={id}>
          {intent === "Returned for Revision"
            ? "Revision remarks"
            : admin
              ? "Administrative reason"
              : "Remarks (optional)"}
          {required ? " *" : ""}
        </label>
        <textarea
          id={id}
          name="remarks"
          className={styles.remarks}
          required={required}
          maxLength={2000}
          value={remarks}
          disabled={pending}
          aria-invalid={!!error}
          onChange={(e) => {
            setRemarks(e.target.value);
            setError("");
          }}
        />
        <small className={styles.counter}>{remarks.length}/2000</small>
        {(error || state.error) && (
          <p className="form-error" role="alert">
            {error || state.error}
          </p>
        )}
      </div>
      <footer className={styles.footer}>
        <button
          type="button"
          className="button button-outline"
          disabled={pending}
          onClick={() => {
            if (
              !remarks ||
              window.confirm("Discard unsaved quotation changes?")
            )
              close();
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={pending}
        >
          {pending ? "Saving…" : label}
        </button>
      </footer>
    </form>
  );
}
export function QuotationWorkspace({
  project,
  quotation: q,
  versions,
  comparison,
  selected,
  compare,
  cancelled,
  role,
}: {
  project: string;
  quotation: Quotation | null;
  versions: QuotationVersionSummary[];
  comparison: Quotation | null;
  selected?: string;
  compare?: string;
  cancelled: boolean;
  role: string;
}) {
  const router = useRouter(),
    path = usePathname(),
    query = useSearchParams(),
    returnFocus = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState<string | null>(selected ?? null),
    [history, setHistory] = useState(false),
    [decision, setDecision] = useState<
      "submit" | "Approved" | "Returned for Revision" | null
    >(null),
    [message, setMessage] = useState("");
  const base = `/dashboard/projects/${project}?tab=quotation`,
    versionId = useId();
  const capture = () => {
    returnFocus.current = document.activeElement as HTMLElement;
  };
  const closeEditor = () => {
    setEditing(null);
    if (query.has("space")) {
      const next = new URLSearchParams(query.toString());
      next.delete("space");
      router.replace(`${path}?${next}`, { scroll: false });
    }
  };
  if (!q)
    return (
      <section className={`surface live-form ${styles.empty}`}>
        <FileText size={26} aria-hidden="true" />
        <h2>Quotation</h2>
        <p>
          {role === "bdm"
            ? "No approved quotation is available."
            : "Start a quotation using the project’s existing Spaces."}
        </p>
        {!cancelled &&
          ["designer", "lead_designer", "system_administrator"].includes(
            role,
          ) && <CreateQuotation project={project} />}
      </section>
    );
  const edit = q.spaces.find(
    (s) => s.id === editing && s.editable && !cancelled && q.state === "Draft",
  );
  const openDecision = (
    intent: "submit" | "Approved" | "Returned for Revision",
  ) => {
    capture();
    setDecision(intent);
  };
  const label =
    decision === "submit"
      ? "Submit for Review"
      : decision === "Approved"
        ? "Approve quotation"
        : "Return for Revision";
  const description =
    decision === "submit"
      ? "Submit all saved quotation items for review. Submission locks this complete version, including Space names and PHP totals. Further changes require a new draft."
      : decision === "Approved"
        ? "Approve this locked version for commercial viewing. Its submitted contents remain unchanged."
        : "Return this locked version with revision remarks. Corrections require a new draft.";
  return (
    <div className={styles.workspace}>
      <section
        className={`surface ${styles.header}`}
        aria-label="Quotation summary"
      >
        <div className={styles.headerLine}>
          <div>
            <span className={styles.eyebrow}>
              PROJECT QUOTATION · VERSION {q.number}
            </span>
            <h2>
              Quotation · {q.state} version {q.number}
            </h2>
            <div className={styles.badges}>
              <Status>{q.state}</Status>
              {q.state !== "Draft" && (
                <span>
                  <LockKeyhole size={13} aria-hidden="true" />
                  Locked snapshot
                </span>
              )}
            </div>
          </div>
          <div className={styles.total}>
            <span>Saved project total</span>
            <strong>{formatPHP(q.total)}</strong>
            <small>
              PHP · {q.spaces.filter((s) => !s.cancelled).length} applicable
              Spaces
            </small>
          </div>
        </div>
        {q.state === "Submitted for Review" && (
          <p className={styles.notice} role="status">
            Pending Lead Designer review.
          </p>
        )}
        {q.state === "Returned for Revision" && (
          <p className={styles.notice}>
            Returned for Revision: {q.review_remarks}
          </p>
        )}
        {cancelled && (
          <p className={styles.notice}>
            Project locked. This quotation is read-only.
          </p>
        )}
        <div className={styles.toolbar}>
          <form method="get" className={styles.versionPicker}>
            <input type="hidden" name="tab" value="quotation" />
            <label htmlFor={versionId}>Quotation version</label>
            <select id={versionId} name="version" defaultValue={q.id}>
              {versions.map((v) => (
                <option value={v.id} key={v.id}>
                  Version {v.number} · {v.state}
                </option>
              ))}
            </select>
            <button className="button button-outline">View version</button>
          </form>
          <div className={styles.actions}>
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                capture();
                setHistory(true);
              }}
            >
              <History size={15} aria-hidden="true" />
              Version history
            </button>
            {!cancelled && (
              <>
                {q.can_submit && (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => openDecision("submit")}
                  >
                    Submit for Review
                  </button>
                )}
                {q.can_review && (
                  <>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => openDecision("Approved")}
                    >
                      Approve quotation
                    </button>
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => openDecision("Returned for Revision")}
                    >
                      Return for Revision
                    </button>
                  </>
                )}
                {q.can_create_draft && versions[0]?.id === q.id && (
                  <CreateQuotation
                    project={project}
                    label={
                      q.state === "Returned for Revision"
                        ? "Create corrected draft"
                        : "Create next quotation draft"
                    }
                  />
                )}
              </>
            )}
          </div>
        </div>
        <div className={styles.activityLink}>
          <Link
            href={`/dashboard/projects/${project}?tab=activity&section=history&quotation_history=${q.id}`}
          >
            View submission and review history in Activity
          </Link>
          {q.source_version_id && (
            <Link href={`${base}&version=${q.source_version_id}`}>
              View source version
            </Link>
          )}
        </div>
      </section>
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      {comparison && comparison.id !== q.id && q.state !== "Draft" && (
        <QuotationComparison
          before={q.number < comparison.number ? q : comparison}
          after={q.number < comparison.number ? comparison : q}
        />
      )}
      {compare && !comparison && (
        <p role="alert" className="form-error">
          Only accessible submitted versions can be compared.
        </p>
      )}
      <section className={styles.itemization} aria-label="Space itemization">
        <div className={styles.sectionTitle}>
          <h2>Space itemization</h2>
          <span>
            {q.state === "Draft"
              ? "Saved values · edits stay in draft"
              : "Historical names and items preserved"}
          </span>
        </div>
        {!q.spaces.length && (
          <div className="surface">
            <p>No Spaces yet. Create Spaces before adding quotation items.</p>
            <Link href={`/dashboard/projects/${project}?tab=spaces`}>
              Open Spaces
            </Link>
          </div>
        )}
        <div className={styles.directory}>
          {q.spaces.map((s, index) => (
            <article className={styles.space} key={s.id}>
              <details>
                <summary>
                  <span className={styles.number}>{index + 1}</span>
                  <strong className={styles.spaceName}>{s.name}</strong>
                  <span className={styles.count}>
                    {s.items.length
                      ? `${s.items.length} ${s.items.length === 1 ? "item" : "items"}`
                      : "No items"}
                  </span>
                  {s.cancelled && (
                    <span className={styles.cancelled}>
                      Cancelled · excluded
                    </span>
                  )}
                  <span className={styles.subtotal}>
                    <small>Space subtotal</small>
                    <strong>{formatPHP(s.subtotal)}</strong>
                  </span>
                  <ChevronDown
                    size={17}
                    className={styles.chevron}
                    aria-hidden="true"
                  />
                </summary>
                <div className={styles.spaceBody}>
                  {s.items.length ? (
                    <RecordTable label={`Saved quotation items for ${s.name}`}>
                      <table className={`live-table ${styles.table}`}>
                        <caption className="sr-only">
                          Saved items for {s.name}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Description</th>
                            <th scope="col">Quantity</th>
                            <th scope="col">Unit price (PHP)</th>
                            <th scope="col">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.items.map((i) => (
                            <tr key={i.id}>
                              <td>{i.description}</td>
                              <td>{i.quantity}</td>
                              <td>{formatPHP(i.unit_price)}</td>
                              <td>{formatPHP(i.line_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </RecordTable>
                  ) : (
                    <p className={styles.muted}>
                      No saved items. Items are only created when you save this
                      Space’s draft.
                    </p>
                  )}
                  <div className={styles.savedSubtotal}>
                    Saved subtotal: <strong>{formatPHP(s.subtotal)}</strong>
                  </div>
                </div>
              </details>
              {s.editable && !cancelled && q.state === "Draft" && (
                <button
                  type="button"
                  className={`button button-outline ${styles.editButton}`}
                  aria-label={`Edit items for ${s.name}`}
                  onClick={() => {
                    capture();
                    setEditing(s.id);
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                  {s.items.length ? "Edit items" : "Add items"}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
      {edit && (
        <QuoteFrame
          kind="editor"
          title={`Edit items for ${edit.name}`}
          description="Add, edit, order or remove items, then save the complete Space draft. Quantities allow 3 decimals; PHP prices allow 2. Each line rounds to centavos before summing."
          close={closeEditor}
          returnFocus={returnFocus}
        >
          <QuotationSpaceEditor
            key={`${q.id}-${edit.id}`}
            quotation={q}
            space={edit}
            rebuild
            dialog
            onCancel={closeEditor}
            onSaved={() => {
              setMessage("Space quotation saved.");
              closeEditor();
              router.refresh();
            }}
          />
        </QuoteFrame>
      )}
      {decision && (
        <QuoteFrame
          kind="review"
          title={label}
          description={description}
          close={() => setDecision(null)}
          returnFocus={returnFocus}
        >
          <QuotationDecision
            q={q}
            intent={decision}
            admin={role === "system_administrator"}
            close={() => setDecision(null)}
            saved={(text) => {
              setMessage(text);
              setDecision(null);
              router.refresh();
            }}
          />
        </QuoteFrame>
      )}
      {history && (
        <QuoteFrame
          kind="history"
          title="Quotation version history"
          description="Open saved versions or compare submitted snapshots. Drafts remain separate from locked historical values."
          close={() => setHistory(false)}
          returnFocus={returnFocus}
        >
          <div className={styles.dialogBody}>
            <ul className={styles.versionList}>
              {versions.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`${base}&version=${v.id}`}
                    aria-current={q.id === v.id ? "page" : undefined}
                  >
                    Version {v.number} · {v.state}
                  </Link>
                  <small>Created {formatTime(v.created_at)}</small>
                  {v.submitted_at && (
                    <small>Submitted {formatTime(v.submitted_at)}</small>
                  )}
                </li>
              ))}
            </ul>
            {q.state !== "Draft" &&
              versions.some((v) => v.state !== "Draft" && v.id !== q.id) && (
                <form method="get" className={styles.compareForm}>
                  <input type="hidden" name="tab" value="quotation" />
                  <input type="hidden" name="version" value={q.id} />
                  <label htmlFor={`${versionId}-compare`}>
                    Compare with version
                  </label>
                  <select
                    id={`${versionId}-compare`}
                    name="compare"
                    defaultValue={compare ?? ""}
                    required
                  >
                    <option value="">Select a version</option>
                    {versions
                      .filter((v) => v.state !== "Draft" && v.id !== q.id)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          Version {v.number} · {v.state}
                        </option>
                      ))}
                  </select>
                  <button className="button button-outline">
                    Compare versions
                  </button>
                </form>
              )}
          </div>
        </QuoteFrame>
      )}
    </div>
  );
}
