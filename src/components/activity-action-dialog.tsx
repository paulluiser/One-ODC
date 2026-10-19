"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { monitorAction } from "@/app/dashboard/projects/monitoring-actions";
import { MonitorField } from "./monitoring-forms";
import type { Activity, Monitoring } from "@/lib/monitoring";
import { localDate } from "@/lib/monitoring";
import type { FormState } from "@/lib/phase1";
import styles from "./activity-workspace.module.css";
export type ActivityFormOptions = {
  spaces: { id: string; name: string }[];
  coordinators: { id: string; name: string; active?: boolean }[];
  attachments: { id: string; name: string }[];
  categories: string[];
};
export function ActivityActionDialog({
  project,
  m,
  intent,
  activity,
  options,
  onClose,
}: {
  project: string;
  m: Monitoring;
  intent: string;
  activity?: Activity;
  options: ActivityFormOptions;
  onClose: () => void;
}) {
  const router = useRouter(),
    form = useRef<HTMLFormElement>(null),
    done = useRef(false);
  const [identity] = useState(() => activity?.id ?? crypto.randomUUID()),
    [version] = useState(
      activity?.version ??
        (intent === "activity" || intent === "coordinator" ? 0 : m.version),
    );
  const [dirty, setDirty] = useState(false),
    [refs, setRefs] = useState(activity?.attachment_versions ?? []);
  const [state, action, pending] = useActionState(monitorAction, {
    error: null,
  } as FormState);
  useEffect(() => {
    if (state.success && !pending && !done.current) {
      done.current = true;
      form.current?.dispatchEvent(
        new Event("one-odc:saved", { bubbles: true }),
      );
      onClose();
      router.refresh();
    }
  }, [state.success, pending, onClose, router]);
  const close = () => {
    if (!pending && (!dirty || confirm("Discard unsaved activity changes?"))) {
      if (form.current) form.current.dataset.unsaved = "false";
      onClose();
    }
  };
  const title =
    intent === "activity"
      ? activity
        ? "Correct activity"
        : "Record activity"
      : intent === "deadline"
        ? "Update project deadline"
        : intent === "coordinator"
          ? "Add Site Coordinator"
          : `${intent} Project`;
  const descriptions: Record<string, string> = {
    Hold: "Calendar-day aging continues while the project is on hold. Existing statuses and deadlines are preserved.",
    Resume:
      "Resume active work while preserving hold history, statuses and deadlines.",
    Cancel:
      "Cancel active work while retaining records and payments. Cancelled projects cannot be restored.",
    Reopen:
      "Start a new operational cycle while preserving the previous completion and deadlines.",
    deadline:
      "Update the target date or clear it. Previous deadlines remain in the audit history.",
    coordinator:
      "Add a reference contact for activity tagging. This does not create an authenticated account.",
    activity: activity
      ? "Correct this activity while preserving all previous versions."
      : "Record actual work and link authorized project files.",
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.modalOverlay} />
        <Dialog.Content
          className={styles.modal}
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <header className={styles.modalHeader}>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{descriptions[intent]}</Dialog.Description>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Close ${title}`}
              onClick={close}
              disabled={pending}
            >
              <X size={20} />
            </button>
          </header>
          <form
            ref={form}
            action={action}
            data-unsaved={dirty}
            onInput={() => setDirty(true)}
            onChange={() => setDirty(true)}
            aria-busy={pending}
          >
            <input type="hidden" name="project" value={project} />
            <input type="hidden" name="id" value={identity} />
            <input type="hidden" name="version" value={version} />
            <input type="hidden" name="intent" value={intent} />
            <div className={styles.modalBody}>
              <fieldset disabled={pending}>
                {intent === "deadline" && (
                  <div className={styles.columns}>
                    <MonitorField
                      name="deadline"
                      label="Project deadline"
                      type="date"
                      value={m.deadline ?? ""}
                    />
                    <MonitorField
                      name="timezone"
                      label="Project timezone"
                      value={m.timezone}
                      required
                    />
                  </div>
                )}
                {intent === "coordinator" && (
                  <MonitorField
                    name="name"
                    label="Site Coordinator name"
                    required
                  />
                )}
                {intent === "activity" && (
                  <>
                    <div className={styles.columns}>
                      <MonitorField
                        name="category"
                        label="Activity category"
                        value={activity?.category}
                        options={options.categories.map((c) => ({
                          id: c,
                          name: c,
                        }))}
                        required
                      />
                      <MonitorField
                        name="date"
                        label="Actual activity date"
                        type="date"
                        value={
                          activity?.activity_date ??
                          localDate(new Date().toISOString(), m.timezone)
                        }
                        required
                      />
                      <MonitorField
                        name="space"
                        label="Activity space"
                        value={activity?.space_id ?? ""}
                        options={options.spaces}
                      />
                      <MonitorField
                        name="coordinator"
                        label="Tagged Site Coordinator"
                        value={activity?.coordinator_id ?? ""}
                        options={options.coordinators}
                      />
                    </div>
                    <MonitorField
                      name="description"
                      label="Activity description"
                      type="textarea"
                      value={activity?.description}
                      required
                    />
                    <fieldset className={styles.files}>
                      <legend>
                        Authorized project file versions (up to five)
                      </legend>
                      {options.attachments.length ? (
                        options.attachments.map((a) => (
                          <label key={a.id}>
                            <input
                              type="checkbox"
                              name="attachments"
                              value={a.id}
                              checked={refs.includes(a.id)}
                              disabled={
                                !refs.includes(a.id) && refs.length >= 5
                              }
                              onChange={(e) => {
                                setRefs((old) =>
                                  e.target.checked
                                    ? [...old, a.id]
                                    : old.filter((id) => id !== a.id),
                                );
                                setDirty(true);
                              }}
                            />
                            {a.name}
                          </label>
                        ))
                      ) : (
                        <p>No authorized uploaded project files available.</p>
                      )}
                      {refs
                        .filter(
                          (id) => !options.attachments.some((a) => a.id === id),
                        )
                        .map((id) => (
                          <label key={id}>
                            <input
                              type="checkbox"
                              checked
                              onChange={() => {
                                setRefs(refs.filter((v) => v !== id));
                                setDirty(true);
                              }}
                            />
                            Previously linked file unavailable — remove to
                            continue
                          </label>
                        ))}
                    </fieldset>
                  </>
                )}
                <MonitorField
                  name="reason"
                  label="Change reason"
                  type="textarea"
                  required
                />
              </fieldset>
              {state.error && (
                <p className={styles.error} role="alert">
                  {state.error}
                </p>
              )}
            </div>
            <footer className={styles.modalFooter}>
              <button
                className="button button-outline"
                type="button"
                disabled={pending}
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`button button-primary ${intent === "Cancel" ? styles.destructive : ""}`}
                disabled={
                  pending ||
                  !dirty ||
                  refs.some(
                    (id) => !options.attachments.some((a) => a.id === id),
                  )
                }
              >
                {pending
                  ? "Saving…"
                  : intent === "activity"
                    ? activity
                      ? "Save activity correction"
                      : "Record activity"
                    : intent === "deadline"
                      ? "Save project deadline"
                      : intent === "coordinator"
                        ? "Add Site Coordinator"
                        : `Confirm ${intent.toLowerCase()}`}
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
