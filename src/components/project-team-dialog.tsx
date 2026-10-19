"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, UserRoundCog, X } from "lucide-react";
import { assignPersonnel, changeLeadDesigner } from "@/app/dashboard/actions";
import type { FormState, Person, Member } from "@/lib/phase1";
import { designerOptions, orderedOperations } from "@/lib/project-team-editor";
import { MemberSelect } from "./member-select";
import styles from "./project-team-dialog.module.css";
type Shared = {
  id: string;
  people: Person[];
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (pending: boolean) => void;
};
function TeamAssignments({
  id,
  people,
  team,
  closed,
  onCancel,
  onDirty,
  onBusy,
}: { team: Member[]; closed: boolean } & Shared) {
  const router = useRouter(),
    fid = useId();
  const [primary, setPrimary] = useState(
      team.find((m) => m.membership_role === "designer" && m.is_primary)
        ?.user_id ?? "",
    ),
    [support, setSupport] = useState(
      team
        .filter((m) => m.membership_role === "designer" && !m.is_primary)
        .map((m) => m.user_id),
    ),
    [ops, setOps] = useState(
      team
        .filter((m) => m.membership_role === "operations_admin")
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((m) => m.user_id),
    ),
    [primaryOps, setPrimaryOps] = useState(
      team.find((m) => m.membership_role === "operations_admin" && m.is_primary)
        ?.user_id ?? "",
    ),
    [reason, setReason] = useState(""),
    [submitted, setSubmitted] = useState(false);
  const signature = JSON.stringify({ primary, support, ops, primaryOps }),
    [baseline, setBaseline] = useState(signature),
    dirty = signature !== baseline || !!reason;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await assignPersonnel(previous, data);
      if (result.success) {
        setBaseline(signature);
        setReason("");
        router.refresh();
      }
      return result;
    },
    { error: null },
  );
  useEffect(() => onBusy(pending), [pending, onBusy]);
  const operations = people.filter((p) => p.role === "operations_admin");
  const errors: Record<string, string> = {};
  if (!primary) errors.primary = "Choose a Primary Designer.";
  if (closed && !ops.length)
    errors.ops = "A Closed project requires an Operations Admin.";
  if (ops.length && !ops.includes(primaryOps))
    errors.primary_ops =
      "Choose a primary administrator from the assigned Operations team.";
  if (!reason.trim())
    errors.reason = "Enter a reason for these assignment changes.";
  if (reason.trim().length > 2000)
    errors.reason = "Use 2,000 characters or fewer.";
  if (support.length > 50 || ops.length > 50)
    errors.support = "Select no more than 50 members per supporting group.";
  const error = (key: string) =>
    submitted && (errors[key] || state.fields?.[key]) ? (
      <p className={styles.error} role="alert">
        {errors[key] || state.fields?.[key]}
      </p>
    ) : null;
  return (
    <form
      className={styles.form}
      action={action}
      data-unsaved={dirty}
      aria-busy={pending}
      onSubmit={(e) => {
        setSubmitted(true);
        if (Object.keys(errors).length) {
          e.preventDefault();
          const field = document.getElementById(
            `${fid}-${Object.keys(errors)[0]}`,
          );
          (
            field?.querySelector<HTMLElement>("button,input,textarea") ?? field
          )?.focus();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="primary" value={primary} />
      {support.map((value) => (
        <input type="hidden" name="support" value={value} key={value} />
      ))}
      {orderedOperations(ops, primaryOps).map((value) => (
        <input type="hidden" name="ops" value={value} key={value} />
      ))}
      <div className={styles.body}>
        <fieldset disabled={pending} className={styles.fields}>
          <section>
            <h3>
              <Users size={18} aria-hidden="true" />
              Design team
            </h3>
            <p>Set the primary design responsibility and supporting team.</p>
            <div id={`${fid}-primary`}>
              <MemberSelect
                label="Primary Designer"
                required
                options={designerOptions(people)}
                selected={primary ? [primary] : []}
                onChange={(ids) => {
                  setPrimary(ids[0] ?? "");
                  setSupport((old) => old.filter((id) => id !== ids[0]));
                }}
                disabled={pending}
              />
              {error("primary")}
            </div>
            <MemberSelect
              label="Supporting Designers"
              multiple
              options={designerOptions(people, primary)}
              selected={support}
              onChange={setSupport}
              disabled={pending}
            />
            {error("support")}
          </section>
          <section>
            <h3>
              <UserRoundCog size={18} aria-hidden="true" />
              Operations team
            </h3>
            <p>
              Operations assignments are optional before commercial closure.
            </p>
            <div id={`${fid}-ops`}>
              <MemberSelect
                label="Operations Admins"
                multiple
                options={operations}
                selected={ops}
                onChange={(ids) => {
                  setOps(ids);
                  if (!ids.includes(primaryOps)) setPrimaryOps("");
                }}
                disabled={pending}
              />
              {error("ops")}
            </div>
            <div id={`${fid}-primary_ops`}>
              <MemberSelect
                label="Primary Operations Admin"
                required={ops.length > 0 || closed}
                options={operations.filter((p) => ops.includes(p.id))}
                selected={primaryOps ? [primaryOps] : []}
                onChange={(ids) => setPrimaryOps(ids[0] ?? "")}
                disabled={pending || !ops.length}
              />
              {error("primary_ops")}
            </div>
          </section>
          <label className={styles.reason} htmlFor={`${fid}-reason`}>
            <span id={`${fid}-reason-label`}>Change reason *</span>
            <textarea
              id={`${fid}-reason`}
              name="reason"
              aria-labelledby={`${fid}-reason-label`}
              aria-describedby={`${fid}-reason-help`}
              value={reason}
              required
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={submitted && !!errors.reason}
            />
            <small id={`${fid}-reason-help`}>
              Explain the team changes. The reason is retained in assignment
              history.
            </small>
          </label>
          {error("reason")}
        </fieldset>
        {state.error && submitted && (
          <p role="alert" className={styles.error}>
            {state.error} Your entries are kept.
          </p>
        )}
        {state.success && (
          <p role="status" className="form-success">
            {state.success}
          </p>
        )}
      </div>
      <footer className={styles.footer}>
        <button
          type="button"
          className="button button-outline"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={pending}
        >
          {pending ? "Saving…" : "Save assignments"}
        </button>
      </footer>
    </form>
  );
}
function LeadAssignment({
  id,
  people,
  current,
  viewer,
  teamDirty,
  onTransferred,
  onCancel,
  onDirty,
  onBusy,
}: {
  current: string;
  viewer: { id: string; role: string };
  teamDirty: boolean;
  onTransferred: (url: string) => void;
} & Shared) {
  const router = useRouter(),
    fid = useId(),
    [designer, setDesigner] = useState(current),
    [reason, setReason] = useState(""),
    [baseline, setBaseline] = useState(current),
    [submitted, setSubmitted] = useState(false),
    dirty = designer !== baseline || !!reason;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await changeLeadDesigner(previous, data);
      if (result.success) {
        setBaseline(designer);
        setReason("");
        if (viewer.role !== "system_administrator" && designer !== viewer.id) {
          onTransferred(result.redirectTo ?? "/dashboard/projects");
        } else router.refresh();
      }
      return result;
    },
    { error: null },
  );
  useEffect(() => onBusy(pending), [pending, onBusy]);
  const leads = people.filter((p) => p.role === "lead_designer");
  const errors: Record<string, string> = {};
  if (!designer) errors.designer = "Choose a Lead Designer.";
  if (!reason.trim()) errors.reason = "Enter an assignment reason.";
  return (
    <form
      className={styles.form}
      action={action}
      data-unsaved={dirty}
      aria-busy={pending}
      onSubmit={(e) => {
        setSubmitted(true);
        if (Object.keys(errors).length) {
          e.preventDefault();
          document.getElementById(`${fid}-reason`)?.focus();
          return;
        }
        if (
          teamDirty &&
          viewer.role !== "system_administrator" &&
          designer !== viewer.id &&
          !window.confirm(
            "This transfer changes your access and leaves the project. Discard the unsaved Team Assignments draft?",
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value="project" />
      <input type="hidden" name="expected_designer" value={current} />
      <input type="hidden" name="designer" value={designer} />
      <div className={styles.body}>
        <fieldset
          className={`${styles.fields} ${styles.leadFields}`}
          disabled={pending}
        >
          <section>
            <h3>
              <Users size={18} aria-hidden="true" />
              Lead Designer
            </h3>
            <p>
              Current Lead Designer:{" "}
              <strong>
                {people.find((p) => p.id === current)?.display_name ??
                  "Assigned Lead Designer"}
              </strong>
            </p>
            <MemberSelect
              label="Lead Designer"
              required
              options={leads}
              selected={designer ? [designer] : []}
              onChange={(ids) => setDesigner(ids[0] ?? "")}
              disabled={pending}
            />
            {submitted && errors.designer && (
              <p role="alert" className={styles.error}>
                {errors.designer}
              </p>
            )}
          </section>
          <label className={styles.reason} htmlFor={`${fid}-reason`}>
            <span id={`${fid}-reason-label`}>Assignment reason *</span>
            <textarea
              id={`${fid}-reason`}
              name="reason"
              aria-labelledby={`${fid}-reason-label`}
              aria-describedby={`${fid}-reason-help`}
              required
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={submitted && !!errors.reason}
            />
            <small id={`${fid}-reason-help`}>
              The new Lead Designer receives a notification. Project access
              follows the new assignment; audit history is preserved.
            </small>
          </label>
          {submitted && errors.reason && (
            <p role="alert" className={styles.error}>
              {errors.reason}
            </p>
          )}
        </fieldset>
        {state.error && submitted && (
          <p role="alert" className={styles.error}>
            {state.error} Your entries are kept.
          </p>
        )}
        {state.success && (
          <p role="status" className="form-success">
            {state.success}
          </p>
        )}
      </div>
      <footer className={styles.footer}>
        <button
          type="button"
          className="button button-outline"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={pending || !leads.length}
        >
          {pending ? "Saving…" : "Assign Lead Designer"}
        </button>
      </footer>
    </form>
  );
}
export function ProjectTeamDialog({
  id,
  people,
  team,
  current,
  closed,
  canAssign,
  canTransfer,
  viewer,
}: {
  id: string;
  people: Person[];
  team: Member[];
  current: string;
  closed: boolean;
  canAssign: boolean;
  canTransfer: boolean;
  viewer: { id: string; role: string };
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState(canAssign ? "team" : "lead"),
    [session, setSession] = useState(0),
    [teamDirty, setTeamDirty] = useState(false),
    [leadDirty, setLeadDirty] = useState(false),
    [teamBusy, setTeamBusy] = useState(false),
    [leadBusy, setLeadBusy] = useState(false);
  const content = useRef<HTMLDivElement>(null),
    tabs = useId();
  const changeOpen = (next: boolean) => {
    if (!next) {
      if (teamBusy || leadBusy) return;
      if (
        (teamDirty || leadDirty) &&
        !window.confirm("Discard unsaved changes?")
      )
        return;
      setSession((v) => v + 1);
      setTeamDirty(false);
      setLeadDirty(false);
    }
    setOpen(next);
  };
  const transferred = (url: string) => {
    content.current?.querySelectorAll("form").forEach((form) => {
      form.dispatchEvent(new Event("one-odc:saved", { bubbles: true }));
      form.dataset.unsaved = "false";
    });
    window.location.assign(url);
  };
  const switchTab = (next: string) => {
    content.current
      ?.querySelectorAll<HTMLElement>('[aria-expanded="true"]')
      .forEach((element) => {
        if (element.tagName === "BUTTON") element.click();
      });
    setTab(next);
  };
  const onTabKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    next: string,
  ) => {
    if (
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) &&
      canAssign &&
      canTransfer
    ) {
      event.preventDefault();
      const target =
        event.key === "Home" ? "team" : event.key === "End" ? "lead" : next;
      switchTab(target);
      document.getElementById(`${tabs}-${target}-tab`)?.focus();
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="button button-outline">
          Manage team
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          ref={content}
          className={styles.dialog}
          onEscapeKeyDown={(e) => {
            if (
              content.current?.querySelector(
                '[role="combobox"][aria-expanded="true"]',
              )
            )
              e.preventDefault();
          }}
        >
          <header className={styles.header}>
            <Dialog.Title>Manage project team</Dialog.Title>
            <Dialog.Description>
              Update project assignments. Changes require a reason and remain in
              the audit history.
            </Dialog.Description>
            <Dialog.Close
              className={styles.close}
              aria-label="Close team management"
            >
              <X size={20} />
            </Dialog.Close>
          </header>
          <div
            role="tablist"
            aria-label="Team management"
            className={styles.tabs}
          >
            {canAssign && (
              <button
                id={`${tabs}-team-tab`}
                type="button"
                role="tab"
                aria-selected={tab === "team"}
                aria-controls={`${tabs}-team-panel`}
                tabIndex={tab === "team" ? 0 : -1}
                onClick={() => switchTab("team")}
                onKeyDown={(e) => onTabKey(e, "lead")}
              >
                Team Assignments
              </button>
            )}
            {canTransfer && (
              <button
                id={`${tabs}-lead-tab`}
                type="button"
                role="tab"
                aria-selected={tab === "lead"}
                aria-controls={`${tabs}-lead-panel`}
                tabIndex={tab === "lead" ? 0 : -1}
                onClick={() => switchTab("lead")}
                onKeyDown={(e) => onTabKey(e, "team")}
              >
                Lead Designer
              </button>
            )}
          </div>
          <div key={session} className={styles.panels}>
            {canAssign && (
              <div
                role="tabpanel"
                hidden={tab !== "team"}
                id={`${tabs}-team-panel`}
                aria-labelledby={`${tabs}-team-tab`}
              >
                <TeamAssignments
                  id={id}
                  people={people}
                  team={team}
                  closed={closed}
                  onCancel={() => changeOpen(false)}
                  onDirty={setTeamDirty}
                  onBusy={setTeamBusy}
                />
              </div>
            )}
            {canTransfer && (
              <div
                role="tabpanel"
                hidden={tab !== "lead"}
                id={`${tabs}-lead-panel`}
                aria-labelledby={`${tabs}-lead-tab`}
              >
                <LeadAssignment
                  id={id}
                  people={people}
                  current={current}
                  viewer={viewer}
                  teamDirty={teamDirty}
                  onTransferred={transferred}
                  onCancel={() => changeOpen(false)}
                  onDirty={setLeadDirty}
                  onBusy={setLeadBusy}
                />
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
