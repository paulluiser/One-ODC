"use client";
import { SpaceReadinessForm } from "./space-readiness-form";
import type { SpaceReadiness } from "@/lib/project-readiness";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, X } from "lucide-react";
import type { Person, FormState } from "@/lib/phase1";
import {
  saveSpaceSchema,
  spaceMutationSchema,
  spaceTransitions,
  type Space,
} from "@/lib/spaces";
import { mutateSpace } from "@/app/dashboard/projects/space-actions";
import { MemberSelect } from "./member-select";
import { Status } from "./ui-r2/primitives";
import { directoryDate } from "@/lib/project-directory-view";
import styles from "./space-details-drawer.module.css";

type Details = {
  name: string;
  deadline: string;
  primary: string;
  support: string[];
};
const signature = (v: Details) =>
  JSON.stringify({ ...v, name: v.name.trim(), support: [...v.support].sort() });
export function SpaceDetailsDrawer({
  space,
  support,
  people,
  manager,
  editable,
  admin,
  held,
  readiness,
}: {
  space: Space;
  support: string[];
  people: Person[];
  manager: boolean;
  editable: boolean;
  admin: boolean;
  held: boolean;
  readiness?: SpaceReadiness;
}) {
  const router = useRouter(),
    path = usePathname(),
    query = useSearchParams();
  const initial = {
    name: space.name,
    deadline: space.deadline ?? "",
    primary: space.primary_designer_id,
    support,
  };
  const [draft, setDraft] = useState<Details>(initial),
    [baseline, setBaseline] = useState(signature(initial));
  const [version, setVersion] = useState(space.version);
  const [reason, setReason] = useState(""),
    [status, setStatus] = useState(""),
    [approval, setApproval] = useState(""),
    [statusReason, setStatusReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false),
    [cancelReason, setCancelReason] = useState("");
  const [results, setResults] = useState<Record<string, FormState>>({});
  const [pending, start] = useTransition();
  const content = useRef<HTMLDivElement>(null),
    detailsForm = useRef<HTMLFormElement>(null),
    statusForm = useRef<HTMLFormElement>(null);
  const writable = editable && !space.cancelled_at;
  const dirtyDetails = signature(draft) !== baseline || !!reason;
  const dirtyStatus = !!status || !!approval || !!statusReason;
  const stale = space.version > version;
  const choices = spaceTransitions(space, manager, admin);
  const metadataValid = saveSpaceSchema.safeParse({
    ...draft,
    id: space.id,
    project: space.project_id,
    version,
    deadline: draft.deadline || null,
    reason,
  }).success;
  const statusValid =
    choices.includes(status as Space["status"]) &&
    !!statusReason.trim() &&
    (status !== "Completed" || admin || !!approval.trim());
  const close = (force = false) => {
    if (pending && !force) return;
    if (
      !force &&
      (dirtyDetails || dirtyStatus || !!cancelReason) &&
      !window.confirm("Discard unsaved Space details and status changes?")
    )
      return;
    content.current?.querySelectorAll<HTMLFormElement>("form").forEach((f) => {
      f.dataset.unsaved = "false";
    });
    const next = new URLSearchParams(query.toString());
    next.delete("space_detail");
    router.push(`${path}?${next}#project-spaces`, { scroll: false });
  };
  const submit = (
    intent: "save" | "status" | "cancel",
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (pending || stale) return;
    setResults((old) => ({ ...old, [intent]: { error: null } }));
    const data = new FormData(event.currentTarget);
    data.set("intent", intent);
    data.set("id", space.id);
    data.set("project", space.project_id);
    data.set("version", String(version));
    if (intent === "save") {
      data.set("primary", draft.primary);
      draft.support.forEach((id) => data.append("support", id));
    }
    start(async () => {
      try {
        const result = await mutateSpace({ error: null }, data);
        setResults((old) => ({ ...old, [intent]: result }));
        if (!result.success) return;
        setVersion(version + 1);
        if (intent === "save") {
          setBaseline(signature(draft));
          setReason("");
          detailsForm.current?.dispatchEvent(
            new Event("one-odc:saved", { bubbles: true }),
          );
        }
        if (intent === "status") {
          setStatus("");
          setApproval("");
          setStatusReason("");
          statusForm.current?.dispatchEvent(
            new Event("one-odc:saved", { bubbles: true }),
          );
        }
        if (intent === "cancel") {
          setCancelOpen(false);
          close(true);
        }
        router.refresh();
      } catch {
        setResults((old) => ({
          ...old,
          [intent]: {
            error: "Unable to save. Your entries are kept. Please retry.",
          },
        }));
      }
    });
  };
  const feedback = (intent: string) => (
    <div aria-live="polite">
      {results[intent]?.error && (
        <p role="alert" className="form-error">
          {results[intent].error}
        </p>
      )}
      {results[intent]?.success && (
        <p role="status">
          {intent === "status"
            ? "Design status updated."
            : results[intent].success}
        </p>
      )}
    </div>
  );
  const fieldError = (key: string) =>
    results.save?.fields?.[key] && (
      <small className="form-error">{results.save.fields[key]}</small>
    );
  const reasonField = (
    label: string,
    value: string,
    change: (v: string) => void,
  ) => (
    <label className={styles.field}>
      {label} *
      <textarea
        name="reason"
        value={value}
        onChange={(e) => change(e.target.value)}
        maxLength={2000}
        required
        rows={3}
        placeholder="Explain the reason for this change…"
      />
      <small>{value.length}/2000</small>
    </label>
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          ref={content}
          className={styles.drawer}
          onEscapeKeyDown={(e) => {
            if (
              pending ||
              cancelOpen ||
              content.current?.querySelector(
                '[role="combobox"][aria-expanded="true"]',
              )
            )
              e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => {
              const target =
                Array.from(
                  document.querySelectorAll<HTMLElement>(
                    `a[data-space-id="${space.id}"]`,
                  ),
                ).find((el) => el.getClientRects().length) ??
                document.querySelector<HTMLElement>(
                  'input[placeholder="Search spaces…"]',
                );
              target?.focus({ preventScroll: true });
            });
          }}
        >
          <header className={styles.header}>
            <div>
              <Dialog.Title>Space details</Dialog.Title>
              <Dialog.Description>
                Manage details, team assignments and design status.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className={styles.icon}
              disabled={pending}
              aria-label="Close space details"
            >
              <X size={21} />
            </Dialog.Close>
          </header>
          <div className={styles.body}>
            <div className={styles.summary}>
              <div>
                <strong>{space.name}</strong>
                <Status>
                  {space.cancelled_at ? "Cancelled" : space.status}
                </Status>
              </div>
              <span>
                <CalendarDays size={17} aria-hidden="true" />
                {directoryDate(space.deadline)}
              </span>
            </div>
            {stale && (
              <p role="alert" className="form-error">
                This Space changed elsewhere. Your drafts are kept. Close and
                reopen it to load the latest version before saving.
              </p>
            )}
            {!writable && (
              <p className={styles.notice}>
                {space.cancelled_at
                  ? `This Space is cancelled. ${space.cancellation_reason ?? ""}`
                  : "You have read-only access to this Space."}
              </p>
            )}
            {readiness && (
              <SpaceReadinessForm
                project={space.project_id}
                space={space.id}
                readiness={readiness}
                manager={manager}
                editable={writable && !held}
              />
            )}
            <form
              ref={detailsForm}
              onSubmit={(e) => submit("save", e)}
              data-unsaved={dirtyDetails}
              aria-label="Space details"
              aria-busy={pending}
            >
              <fieldset disabled={!writable || pending}>
                <section className={styles.section}>
                  <h3>Basic details</h3>
                  <div className={styles.columns}>
                    <label className={styles.field}>
                      Space name *
                      <input
                        name="name"
                        required
                        maxLength={200}
                        value={draft.name}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                      />
                      {fieldError("name")}
                    </label>
                    <label className={styles.field}>
                      Design deadline
                      <input
                        type="date"
                        name="deadline"
                        value={draft.deadline}
                        onChange={(e) =>
                          setDraft({ ...draft, deadline: e.target.value })
                        }
                      />
                      {fieldError("deadline")}
                    </label>
                  </div>
                </section>
                <section className={styles.section}>
                  <h3>Team assignment</h3>
                  <div className={styles.columns}>
                    <MemberSelect
                      label="Primary Designer"
                      required
                      options={people}
                      selected={[draft.primary]}
                      disabled={!manager || !writable || pending}
                      onChange={(ids) =>
                        setDraft({
                          ...draft,
                          primary: ids[0],
                          support: draft.support.filter((id) => id !== ids[0]),
                        })
                      }
                    />
                    <MemberSelect
                      label="Supporting Designers"
                      multiple
                      options={people.filter((p) => p.id !== draft.primary)}
                      selected={draft.support}
                      disabled={!manager || !writable || pending}
                      onChange={(ids) => setDraft({ ...draft, support: ids })}
                    />
                  </div>
                  {!manager && writable && (
                    <p className={styles.notice}>
                      Team assignments are managed by the Lead Designer or
                      System Administrator.
                    </p>
                  )}
                  {fieldError("support")}
                  {fieldError("primary")}
                </section>
                {writable && (
                  <div className={styles.section}>
                    {reasonField("Details change reason", reason, setReason)}
                    {fieldError("reason")}
                    <div className={styles.actions}>
                      <button
                        type="submit"
                        className="button button-primary"
                        disabled={
                          pending ||
                          stale ||
                          !metadataValid ||
                          signature(draft) === baseline
                        }
                      >
                        {pending ? "Saving…" : "Save Space"}
                      </button>
                    </div>
                  </div>
                )}
              </fieldset>
              {feedback("save")}
            </form>
            <form
              ref={statusForm}
              onSubmit={(e) => submit("status", e)}
              data-unsaved={dirtyStatus}
              aria-label="Design status"
              aria-busy={pending}
            >
              <section className={styles.section}>
                <h3>Design status</h3>
                {held ? (
                  <p>Resume the project before changing design status.</p>
                ) : writable && choices.length ? (
                  <fieldset disabled={pending}>
                    <div className={styles.columns}>
                      <label className={styles.field}>
                        Next design status *
                        <select
                          name="status"
                          value={status}
                          required
                          onChange={(e) => {
                            setStatus(e.target.value);
                            setApproval("");
                          }}
                        >
                          <option value="">Choose a status…</option>
                          {choices.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      {status === "Completed" && (
                        <label className={styles.field}>
                          External approval reference
                          {admin ? " (optional)" : " *"}
                          <input
                            name="approval"
                            value={approval}
                            onChange={(e) => setApproval(e.target.value)}
                            maxLength={2000}
                            required={!admin}
                          />
                        </label>
                      )}
                    </div>
                    {admin && (
                      <p className={styles.notice}>
                        Administrator status overrides are recorded in the audit
                        history. Provide a clear reason for the change.
                      </p>
                    )}
                    {reasonField(
                      "Status change reason",
                      statusReason,
                      setStatusReason,
                    )}
                    <div className={styles.actions}>
                      <button
                        type="submit"
                        className="button button-primary"
                        disabled={pending || stale || !statusValid}
                      >
                        Update Status
                      </button>
                    </div>
                  </fieldset>
                ) : (
                  <p>
                    {writable
                      ? "No status transitions are available for your role at this stage."
                      : `Current status: ${space.status}`}
                  </p>
                )}
                {feedback("status")}
              </section>
            </form>
          </div>
          <footer className={styles.footer}>
            {manager && writable && (
              <button
                type="button"
                className={`button button-outline ${styles.destructive}`}
                disabled={pending}
                onClick={() => setCancelOpen(true)}
              >
                Cancel Space
              </button>
            )}
            <button
              type="button"
              className="button button-outline"
              disabled={pending}
              onClick={() => close()}
            >
              Close
            </button>
          </footer>
          <Dialog.Root
            open={cancelOpen}
            onOpenChange={(open) => {
              if (!pending) setCancelOpen(open);
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay className={styles.confirmOverlay} />
              <Dialog.Content className={styles.confirm}>
                <Dialog.Title>Cancel Space</Dialog.Title>
                <Dialog.Description>
                  Cancel {space.name}? It will become read-only and leave the
                  active project scope. Existing records and history are
                  preserved. This cannot be undone.
                </Dialog.Description>
                {(dirtyDetails || dirtyStatus) && (
                  <p className={styles.notice}>
                    Unsaved details and status drafts will be discarded only if
                    cancellation succeeds.
                  </p>
                )}
                <form
                  onSubmit={(e) => submit("cancel", e)}
                  data-unsaved={!!cancelReason}
                  aria-busy={pending}
                >
                  {reasonField(
                    "Cancellation reason",
                    cancelReason,
                    setCancelReason,
                  )}
                  {feedback("cancel")}
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={pending}
                      onClick={() => setCancelOpen(false)}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className={`button button-outline ${styles.destructive}`}
                      disabled={
                        pending ||
                        stale ||
                        !spaceMutationSchema.safeParse({
                          id: space.id,
                          project: space.project_id,
                          version,
                          reason: cancelReason,
                          approval: "",
                        }).success
                      }
                    >
                      Confirm Space Cancellation
                    </button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
