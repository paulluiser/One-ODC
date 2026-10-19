"use client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, X, Check } from "lucide-react";
import type { Person, FormState } from "@/lib/phase1";
import { saveSpaceSchema } from "@/lib/spaces";
import {
  planSpaceAssignments,
  selectSpacePage,
  type AssignmentSpace,
} from "@/lib/space-assignment-editor";
import { mutateSpace } from "@/app/dashboard/projects/space-actions";
import { MemberSelect } from "./member-select";
import { SpaceDirectory, type SpaceDirectoryRecord } from "./space-directory";
import styles from "./space-workspace-tools.module.css";
function ErrorText({ children }: { children?: string | null }) {
  return children ? (
    <p role="alert" className="form-error">
      {children}
    </p>
  ) : null;
}
function Frame({
  kind,
  title,
  description,
  dirty,
  pending,
  close,
  children,
}: {
  kind: "create" | "bulk";
  title: string;
  description: string;
  dirty: boolean;
  pending: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const dismiss = () => {
    if (!pending && (!dirty || window.confirm("Discard unsaved changes?")))
      close();
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={kind === "create" ? styles.modal : styles.sheet}
          onEscapeKeyDown={(e) => {
            if (
              document.querySelector('[role="combobox"][aria-expanded="true"]')
            )
              e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() =>
              document.getElementById(`spaces-${kind}-trigger`)?.focus(),
            );
          }}
        >
          <header className={styles.header}>
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
function CreateSpace({
  project,
  people,
  close,
  saved,
}: {
  project: string;
  people: Person[];
  close: () => void;
  saved: (id: string) => void;
}) {
  const [id] = useState(() => crypto.randomUUID()),
    fid = useId();
  const [name, setName] = useState(""),
    [deadline, setDeadline] = useState(""),
    [primary, setPrimary] = useState(""),
    [support, setSupport] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [submitted, setSubmitted] = useState(false);
  const parsed = saveSpaceSchema.safeParse({
    id,
    project,
    version: 0,
    name,
    deadline: deadline || null,
    primary,
    support,
    reason,
  });
  const fields: Record<string, string> = {};
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      fields[String(issue.path[0] ?? "support")] =
        (
          {
            name: "Enter a Space name with up to 200 characters.",
            deadline: "Enter a valid design deadline.",
            primary: "Choose an eligible Primary Designer.",
            support: "Choose up to 50 distinct Supporting Designers.",
            reason: "Enter a reason with up to 2,000 characters.",
          } as Record<string, string>
        )[String(issue.path[0] ?? "support")] ??
        "Check the selected assignments.";
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await mutateSpace(previous, data);
      if (result.success) saved(id);
      return result;
    },
    { error: null },
  );
  const dirty = !!(name || deadline || primary || support.length || reason);
  const error = (key: string) => (
    <ErrorText>{submitted ? fields[key] : null}</ErrorText>
  );
  return (
    <Frame
      kind="create"
      title="Create a space"
      description="Define the space, design deadline and responsible project team."
      dirty={dirty}
      pending={pending}
      close={close}
    >
      <form
        className={styles.form}
        action={action}
        data-unsaved={dirty}
        aria-busy={pending}
        onSubmit={(e) => {
          setSubmitted(true);
          if (!parsed.success) {
            e.preventDefault();
            const field = document.getElementById(
              `${fid}-${Object.keys(fields)[0]}`,
            );
            (
              field?.querySelector<HTMLElement>("button,input,textarea") ??
              field
            )?.focus();
          }
        }}
      >
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="project" value={project} />
        <input type="hidden" name="version" value="0" />
        <input type="hidden" name="primary" value={primary} />
        {support.map((s) => (
          <input type="hidden" name="support" value={s} key={s} />
        ))}
        <div className={styles.body}>
          <fieldset disabled={pending} className={styles.fields}>
            <label>
              Space name *
              <input
                id={`${fid}-name`}
                name="name"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={submitted && !!fields.name}
              />
              {error("name")}
            </label>
            <label>
              Design deadline
              <input
                id={`${fid}-deadline`}
                name="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                aria-invalid={submitted && !!fields.deadline}
              />
              {error("deadline")}
            </label>
            <div id={`${fid}-primary`}>
              <MemberSelect
                label="Primary Designer"
                required
                options={people}
                selected={primary ? [primary] : []}
                onChange={(ids) => {
                  setPrimary(ids[0] ?? "");
                  setSupport((s) => s.filter((id) => id !== ids[0]));
                }}
                disabled={pending}
              />
              {error("primary")}
            </div>
            <div id={`${fid}-support`}>
              <MemberSelect
                label="Supporting Designers"
                multiple
                options={people.filter((p) => p.id !== primary)}
                selected={support}
                onChange={setSupport}
                disabled={pending}
              />
              {error("support")}
            </div>
            <label className={styles.full}>
              Reason *
              <textarea
                id={`${fid}-reason`}
                aria-label="Reason"
                name="reason"
                required
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={submitted && !!fields.reason}
              />
              {error("reason")}
            </label>
          </fieldset>
          <ErrorText>{state.error}</ErrorText>
        </div>
        <footer className={styles.footer}>
          <button
            type="button"
            className="button button-outline"
            disabled={pending}
            onClick={() => {
              if (!dirty || window.confirm("Discard unsaved changes?")) close();
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={pending || !people.length}
          >
            {pending ? "Creating…" : "Create space"}
          </button>
        </footer>
      </form>
    </Frame>
  );
}
function BulkReassignment({
  project,
  people,
  selected,
  setSelected,
  close,
  saved,
}: {
  project: string;
  people: Person[];
  selected: AssignmentSpace[];
  setSelected: (spaces: AssignmentSpace[]) => void;
  close: () => void;
  saved: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0),
    [primaryMode, setPrimaryMode] = useState("keep"),
    [primary, setPrimary] = useState(""),
    [mode, setMode] = useState("keep"),
    [support, setSupport] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const { plan, error: planError } = planSpaceAssignments(
    selected,
    primary,
    mode === "keep" ? null : support,
  );
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await mutateSpace(previous, data);
      if (result.success) saved();
      return result;
    },
    { error: null },
  );
  const name = (id: string) =>
    people.find((p) => p.id === id)?.display_name ??
    "Unavailable project member";
  const dirty = !!(primaryMode !== "keep" || mode !== "keep" || reason);
  const next = () => {
    if (step === 0) {
      if (!selected.length || selected.length > 100) {
        setError("Select 1–100 eligible Spaces.");
        return;
      }
    } else if (
      (primaryMode === "replace" && !primary) ||
      planError ||
      !reason.trim()
    ) {
      setError(
        primaryMode === "replace" && !primary
          ? "Choose a replacement Primary Designer."
          : planError || "Enter a reason for reassignment.",
      );
      return;
    }
    setError("");
    setStep((s) => s + 1);
    requestAnimationFrame(() => body.current?.focus());
  };
  return (
    <Frame
      kind="bulk"
      title="Bulk reassignment"
      description="Review selected Spaces and record assignment changes together."
      dirty={dirty}
      pending={pending}
      close={close}
    >
      <form
        className={styles.form}
        action={action}
        data-unsaved={dirty}
        aria-busy={pending}
        onSubmit={(e) => {
          if (step !== 2 || !plan || !reason.trim()) {
            e.preventDefault();
            setError(
              planError ||
                "Review the assignment changes and provide a reason.",
            );
          }
        }}
      >
        <input type="hidden" name="intent" value="bulk" />
        <input type="hidden" name="project" value={project} />
        <input type="hidden" name="primary" value={plan?.primary ?? ""} />
        {plan?.support.map((id) => (
          <input type="hidden" name="support" value={id} key={id} />
        ))}
        {selected.map((s) => (
          <input
            type="hidden"
            name="spaces"
            key={s.id}
            value={JSON.stringify({ id: s.id, version: s.version })}
          />
        ))}
        <input type="hidden" name="reason" value={reason} />
        <ol className={styles.steps} aria-label="Reassignment steps">
          {["Select spaces", "Configure assignments", "Review & confirm"].map(
            (label, i) => (
              <li key={label} aria-current={step === i ? "step" : undefined}>
                <span>{step > i ? <Check size={13} /> : i + 1}</span>
                {label}
              </li>
            ),
          )}
        </ol>
        <div
          ref={body}
          className={styles.body}
          tabIndex={-1}
          role="group"
          aria-label={
            ["Select spaces", "Configure assignments", "Review and confirm"][
              step
            ]
          }
        >
          <fieldset disabled={pending} className={styles.stack}>
            {step === 0 && (
              <>
                <div className={styles.between}>
                  <strong>
                    {selected.length}{" "}
                    {selected.length === 1 ? "Space" : "Spaces"} selected
                  </strong>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => setSelected([])}
                  >
                    Clear all
                  </button>
                </div>
                <p className={styles.hint}>
                  Use the directory checkboxes to add Spaces. Removing an item
                  here updates the same selection.
                </p>
                <ul className={styles.selected}>
                  {selected.map((s) => (
                    <li key={s.id}>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          Primary: {name(s.primary)} · Supporting:{" "}
                          {s.support.length
                            ? s.support.map(name).join(", ")
                            : "None"}
                        </small>
                      </div>
                      <button
                        type="button"
                        className={styles.icon}
                        aria-label={`Remove ${s.name} from selection`}
                        onClick={() =>
                          setSelected(selected.filter((v) => v.id !== s.id))
                        }
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {step === 1 && (
              <>
                <p className={styles.hint}>
                  Only active Designers on this project are eligible. Unchanged
                  fields retain their existing assignments.
                </p>
                <label>
                  Primary Designer change
                  <select
                    aria-label="Primary Designer change"
                    value={primaryMode}
                    onChange={(e) => {
                      setPrimaryMode(e.target.value);
                      setPrimary("");
                    }}
                  >
                    <option value="keep">Leave unchanged</option>
                    <option value="replace">Replace Primary Designer</option>
                  </select>
                </label>
                {primaryMode === "replace" && (
                  <MemberSelect
                    label="New Primary Designer"
                    required
                    options={people}
                    selected={primary ? [primary] : []}
                    onChange={(ids) => setPrimary(ids[0] ?? "")}
                  />
                )}
                <label>
                  Supporting Designer change
                  <select
                    aria-label="Supporting Designer change"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="keep">Leave unchanged</option>
                    <option value="replace">Replace supporting team</option>
                  </select>
                </label>
                {mode === "replace" && (
                  <>
                    <MemberSelect
                      label="New Supporting Designers"
                      multiple
                      options={people.filter(
                        (p) => p.id !== (primary || plan?.primary),
                      )}
                      selected={support}
                      onChange={setSupport}
                    />
                    <p className={styles.hint}>
                      An empty selection explicitly removes all Supporting
                      Designers.
                    </p>
                  </>
                )}
                <label>
                  Reason for reassignment *
                  <textarea
                    aria-label="Reason for reassignment"
                    required
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <p className={styles.hint}>
                  Changes and previous assignments are recorded in the audit
                  history. Mixed teams require an explicit shared replacement
                  because the existing bulk operation applies one team
                  atomically.
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <div className={styles.summary}>
                  <strong>
                    {selected.length}{" "}
                    {selected.length === 1 ? "Space" : "Spaces"} will be
                    reassigned
                  </strong>
                  <dl>
                    <dt>Primary Designer</dt>
                    <dd>{primary ? name(primary) : "Unchanged"}</dd>
                    <dt>Supporting Designers</dt>
                    <dd>
                      {mode === "keep"
                        ? "Unchanged"
                        : support.length
                          ? support.map(name).join(", ")
                          : "Remove all Supporting Designers"}
                    </dd>
                    <dt>Reason</dt>
                    <dd>{reason}</dd>
                  </dl>
                </div>
                <h3>Current assignments</h3>
                <ul className={styles.selected}>
                  {selected.map((s) => (
                    <li key={s.id}>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          Primary: {name(s.primary)} · Supporting:{" "}
                          {s.support.length
                            ? s.support.map(name).join(", ")
                            : "None"}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </fieldset>
          <ErrorText>{error || state.error}</ErrorText>
          {state.error && (
            <p className={styles.hint}>
              No success is assumed. Your selections and entries are retained.
              For stale records, close this panel, refresh the directory, clear
              and reselect the affected Spaces, then review again.
            </p>
          )}
        </div>
        <footer className={styles.footer}>
          <button
            type="button"
            className="button button-outline"
            disabled={pending}
            onClick={() => {
              if (step) {
                setError("");
                setStep((s) => s - 1);
                requestAnimationFrame(() => body.current?.focus());
              } else if (!dirty || window.confirm("Discard unsaved changes?"))
                close();
            }}
          >
            {step ? "Back" : "Cancel"}
          </button>
          {step < 2 ? (
            <button
              type="button"
              className="button button-primary"
              disabled={pending || !selected.length}
              key="next"
              onClick={(e) => {
                e.preventDefault();
                next();
              }}
            >
              Next
            </button>
          ) : (
            <button
              key="confirm"
              type="submit"
              className="button button-primary"
              disabled={pending || !plan}
            >
              {pending ? "Reassigning…" : "Confirm reassignment"}
            </button>
          )}
        </footer>
      </form>
    </Frame>
  );
}
export function SpaceWorkspaceTools({
  project,
  people,
  all,
  rows,
  canManage,
  children,
}: {
  project: string;
  people: Person[];
  all: AssignmentSpace[];
  rows: SpaceDirectoryRecord[];
  canManage: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AssignmentSpace[]>([]),
    [selecting, setSelecting] = useState(false),
    [open, setOpen] = useState<"create" | "bulk" | null>(null),
    [message, setMessage] = useState(""),
    [created, setCreated] = useState("");
  useEffect(() => {
    const sync = () => {
      if (canManage && window.location.hash === "#space-create")
        setOpen("create");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [canManage]);
  const active = selected.filter((s) =>
    all.some((a) => a.id === s.id && a.eligible),
  );
  const feedback =
    created && all.some((s) => s.id === created)
      ? rows.some((s) => s.id === created)
        ? "Space created."
        : "Space created. It is hidden by the current filters; clear filters to view it."
      : message;
  const select = (id: string, checked: boolean) => {
    setCreated("");
    const record = all.find((s) => s.id === id && s.eligible);
    if (!record) return;
    if (checked && selected.length >= 100) {
      setMessage("Select up to 100 Spaces per operation.");
      return;
    }
    setSelected((old) =>
      checked
        ? [...old.filter((s) => s.id !== id), record]
        : old.filter((s) => s.id !== id),
    );
  };
  return (
    <>
      <div className={styles.heading}>
        <h2>Spaces</h2>
        <div className={styles.actions} id="space-create">
          {canManage && (
            <>
              <button
                id="spaces-bulk-trigger"
                type="button"
                className="button button-outline"
                aria-pressed={selecting}
                disabled={selecting && !active.length}
                onClick={() => {
                  if (!selecting) {
                    setSelecting(true);
                    return;
                  }
                  setCreated("");
                  setSelected(active);
                  setOpen("bulk");
                }}
              >
                <Users size={16} />
                Bulk reassignment{active.length ? ` (${active.length})` : ""}
              </button>
              {selecting && (
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => {
                    setSelected([]);
                    setSelecting(false);
                  }}
                >
                  Cancel selection
                </button>
              )}
              <button
                id="spaces-create-trigger"
                type="button"
                className="button button-primary"
                onClick={() => setOpen("create")}
              >
                <Plus size={16} />
                Create a space
              </button>
            </>
          )}
        </div>
      </div>
      {selecting && !selected.length && (
        <p className={styles.selectionHint} role="status">
          Select Spaces below, then click Bulk reassignment to continue.
        </p>
      )}
      {children}
      {feedback && (
        <p role="status" className={styles.feedback}>
          {feedback}
        </p>
      )}
      {selected.length > 0 && (
        <div className={styles.between}>
          <span>
            {active.length} selected
            {selected.length !== active.length
              ? " · Some selected Spaces are no longer eligible."
              : ""}
            {active.some((s) => !rows.some((r) => r.id === s.id))
              ? " · Includes Spaces hidden by filters."
              : ""}
          </span>
          <button
            type="button"
            className={styles.link}
            onClick={() => setSelected([])}
          >
            Clear selection
          </button>
        </div>
      )}
      {rows.length > 0 && (
        <SpaceDirectory
          rows={rows}
          selection={
            canManage && selecting
              ? {
                  ids: active.map((s) => s.id),
                  eligible: all.filter((s) => s.eligible).map((s) => s.id),
                  toggle: select,
                  togglePage: (checked) => {
                    const page = all.filter((s) =>
                      rows.some((r) => r.id === s.id),
                    );
                    const next = selectSpacePage(active, page, checked);
                    if (next) setSelected(next);
                    else setMessage("Select up to 100 Spaces per operation.");
                  },
                }
              : undefined
          }
        />
      )}{" "}
      {open === "create" && canManage && (
        <CreateSpace
          project={project}
          people={people}
          close={() => setOpen(null)}
          saved={(id) => {
            setCreated(id);
            setMessage("Space created. Refreshing the current view…");
            setOpen(null);
            router.refresh();
          }}
        />
      )}
      {open === "bulk" && canManage && (
        <BulkReassignment
          project={project}
          people={people}
          selected={active}
          setSelected={setSelected}
          close={() => setOpen(null)}
          saved={() => {
            setSelected([]);
            setSelecting(false);
            setMessage("Selected Spaces reassigned together.");
            setOpen(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
