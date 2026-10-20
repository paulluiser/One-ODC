"use client";
import { OperationSummary } from "./ui-r4/primitives";
import styles from "./lead-request.module.css";
import { OperationFeedback } from "./operation-feedback";
import { FormPending } from "./form-pending";
import { useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LeadFields,
  ReviewFields,
  AssignmentFields,
  type LeadValues,
} from "./lead-fields";
import {
  emptyLead,
  roleLabels,
  type FormState,
  type Lead,
  type Person,
  type Profile,
  type Member,
} from "@/lib/phase1";
import { roles } from "@/lib/domain";
import {
  changeLeadDesigner,
  saveLead,
  reviewLead,
  assignPersonnel,
  updateUserAccess,
  inviteUser,
} from "@/app/dashboard/actions";
import { ResourceLinks } from "./resource-links";
const initial: FormState = { error: null };
// Confirm a successful save before navigating, so the existing unsaved-change guard
// cannot cancel a server-action redirect after ownership or form contents changed.
function useSavedNavigation(state: FormState) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.redirectTo || state.error) return;
    form.current?.dispatchEvent(new Event("one-odc:saved", { bubbles: true }));
    window.location.assign(state.redirectTo);
  }, [state]);
  return form;
}

export function ActionStatus({ state }: { state: FormState }) {
  return <OperationFeedback error={state.error} success={state.success} />;
}
function Pending({ pending, label }: { pending: boolean; label: string }) {
  return (
    <>
      {pending && <LoaderCircle size={16} className="spin" />}
      {pending ? "Saving…" : label}
    </>
  );
}
export function LeadForm({
  id,
  bdmName,
  bdms,
  suppliers = [],
  leadDesigners = [],
  lead,
  rebuild = false,
}: {
  id: string;
  bdmName: string;
  bdms?: Person[];
  suppliers?: { id: string; name: string; brand: string | null }[];
  leadDesigners?: Person[];
  lead?: Lead;
  rebuild?: boolean;
}) {
  const [state, action, pending] = useActionState(saveLead, initial);
  const formRef = useSavedNavigation(state);
  const base = lead ?? emptyLead;
  const [values, setValues] = useState<LeadValues>({
    ...base,
    cabinetry_count:
      base.cabinetry_count === null ? "" : String(base.cabinetry_count),
  });
  const [links, setLinks] = useState(base.resource_links ?? []);
  const [bdm, setBdm] = useState(lead?.bdm_id ?? "");
  const [reason, setReason] = useState("");
  useEffect(() => {
    const first = Object.keys(state.fields ?? {})[0];
    if (first) document.getElementById(first)?.focus();
  }, [state]);
  const owner = bdms ? (
    <div className="live-field">
      <label htmlFor="bdm_id">Responsible BDM *</label>
      <select
        id="bdm_id"
        name="bdm_id"
        required
        value={bdm}
        onChange={(event) => setBdm(event.target.value)}
        disabled={pending || !!lead}
        aria-invalid={!!state.fields?.bdm_id}
        aria-describedby={state.fields?.bdm_id ? "bdm-error" : undefined}
      >
        <option value="">Choose a BDM</option>
        {bdms.map((p) => (
          <option value={p.id} key={p.id}>
            {p.display_name}
          </option>
        ))}
      </select>
      {lead && <input type="hidden" name="bdm_id" value={lead.bdm_id} />}
      {state.fields?.bdm_id && (
        <span id="bdm-error" className="field-error">
          {state.fields.bdm_id}
        </span>
      )}
    </div>
  ) : (
    <div className="live-field">
      <label htmlFor="responsible-bdm">Responsible BDM *</label>
      <input id="responsible-bdm" value={bdmName} readOnly />
    </div>
  );
  const designer = (
    <div className="live-field">
      <label htmlFor="assigned_lead_designer_id">Lead Designer *</label>
      <select
        id="assigned_lead_designer_id"
        name="assigned_lead_designer_id"
        value={values.assigned_lead_designer_id ?? ""}
        onChange={(e) =>
          setValues({
            ...values,
            assigned_lead_designer_id: e.target.value || null,
          })
        }
        disabled={pending}
        aria-invalid={!!state.fields?.assigned_lead_designer_id}
        required
        aria-describedby={
          state.fields?.assigned_lead_designer_id
            ? "lead-designer-error"
            : undefined
        }
      >
        <option value="">Choose a Lead Designer</option>
        {leadDesigners.map((person) => (
          <option key={person.id} value={person.id}>
            {person.display_name}
          </option>
        ))}
      </select>
      {!leadDesigners.length && (
        <p role="status" className="field-hint">
          No active Lead Designers are available. Save a draft and contact your
          System Administrator.
        </p>
      )}
      {state.fields?.assigned_lead_designer_id && (
        <span id="lead-designer-error" className="field-error">
          {state.fields.assigned_lead_designer_id}
        </span>
      )}
    </div>
  );
  const fields = (
    <LeadFields
      suppliers={suppliers}
      supplierName={lead?.supplier_name}
      values={values}
      errors={state.fields}
      disabled={pending}
      owner={owner}
      designer={designer}
      onValue={(k, v) =>
        setValues({
          ...values,
          [k]: v || (k === "supplier_id" ? null : v),
          ...(k === "supplier_id"
            ? {
                brand:
                  (suppliers.find((supplier) => supplier.id === v)
                    ?.brand as LeadValues["brand"]) ?? null,
              }
            : {}),
        })
      }
    />
  );
  const resources = (
    <ResourceLinks
      compact
      links={links}
      onChange={setLinks}
      disabled={pending}
      error={state.fields?.resource_links}
    />
  );
  const duplicateReview =
    (state.duplicates?.length ?? 0) > 0 || state.fields?.duplicate_reason ? (
      <div className={styles.duplicates}>
        {(state.duplicates?.length ?? 0) > 0 && (
          <div className="duplicate-warning">
            <h3>Possible duplicate requests</h3>
            <ul>
              {state.duplicates!.map((d) => (
                <li key={d.id}>
                  {d.reference} · {d.project_name}
                </li>
              ))}
            </ul>
            <p>
              You may continue with a reason. Other BDMs’ private leads are not
              disclosed.
            </p>
          </div>
        )}
        <div className="live-field">
          <label htmlFor="duplicate_reason">
            Duplicate override reason (when applicable)
          </label>
          <textarea
            id="duplicate_reason"
            name="duplicate_reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
            rows={2}
            aria-invalid={!!state.fields?.duplicate_reason}
          />
          {state.fields?.duplicate_reason && (
            <span className="field-error">{state.fields.duplicate_reason}</span>
          )}
        </div>
      </div>
    ) : null;
  return (
    <form
      ref={formRef}
      action={action}
      onReset={(event) => event.preventDefault()}
      className={`surface live-form lead-request-form ${styles.request}`}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expected_version" value={lead?.version ?? 0} />
      <input
        type="hidden"
        name="attachment_metadata"
        value={JSON.stringify(base.attachment_metadata)}
      />
      <div className={styles.columns} data-rebuild={rebuild || undefined}>
        <section className={styles.main} aria-label="Project quotation request">
          <h2>Project quotation request</h2>
          {fields}
          {duplicateReview}
        </section>
        <aside className={styles.references} aria-label="Files and references">
          {resources}
        </aside>
      </div>
      <ActionStatus state={state} />
      <div className={`form-actions ${styles.actions}`}>
        <Button type="submit" name="intent" value="submit" disabled={pending}>
          <Pending
            pending={pending}
            label={lead?.first_submitted_at ? "Resubmit Lead" : "Submit Lead"}
          />
        </Button>
        <Button
          type="submit"
          variant="outline"
          name="intent"
          value="draft"
          formNoValidate
          disabled={pending}
        >
          Save Draft
        </Button>
        <span className="field-hint">
          Submitted requests are locked until returned for clarification.
        </span>
      </div>
      <FormPending />
    </form>
  );
}
export function ReviewForm({
  lead,
  people,
  profile,
}: {
  lead: Lead;
  people: Person[];
  profile: Profile;
}) {
  const [state, action, pending] = useActionState(reviewLead, initial);
  const formRef = useSavedNavigation(state);
  const [decision, setDecision] = useState("");
  const [remarks, setRemarks] = useState("");
  const [primary, setPrimary] = useState(
    profile.role === "lead_designer" ? profile.id : "",
  );
  const [support, setSupport] = useState<string[]>([]);
  const [ops] = useState<string[]>([]);
  const [leadDesigner] = useState(lead.assigned_lead_designer_id ?? "");
  return (
    <form
      ref={formRef}
      action={action}
      className="surface live-form lead-review-form"
    >
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="expected_version" value={lead.version} />
      <h2>Lead Designer review</h2>
      <ReviewFields
        decision={decision}
        remarks={remarks}
        onDecision={setDecision}
        onRemarks={setRemarks}
        disabled={pending}
        error={state.fields?.remarks}
      />
      {decision === "Accepted" && (
        <>
          <p className="field-hint">
            Acceptance creates one Project and preserves this Lead and its
            history.
          </p>
          <input type="hidden" name="lead_designer" value={leadDesigner} />
          <p className="field-hint">
            Lead Designer:{" "}
            {people.find((person) => person.id === leadDesigner)
              ?.display_name ??
              "Not assigned — assign a Lead Designer before acceptance."}
          </p>
          <AssignmentFields
            showOps={false}
            people={people}
            primary={primary}
            onPrimary={setPrimary}
            support={support}
            onSupport={setSupport}
            ops={ops}
            onOps={undefined}
            disabled={pending}
          />
        </>
      )}
      <ActionStatus state={state} />
      <div className="form-actions">
        <Button disabled={pending || !decision} type="submit">
          <Pending
            pending={pending}
            label={
              !decision
                ? "Choose a review decision"
                : decision === "Accepted"
                  ? "Accept and create Project"
                  : decision === "Rejected"
                    ? "Reject lead"
                    : "Return for Clarification"
            }
          />
        </Button>
      </div>
      <FormPending />
    </form>
  );
}
export function AssignmentForm({
  id,
  people,
  team,
}: {
  id: string;
  people: Person[];
  team: Member[];
}) {
  const [state, action, pending] = useActionState(assignPersonnel, initial);
  const [primary, setPrimary] = useState(
    team.find((m) => m.membership_role === "designer" && m.is_primary)
      ?.user_id ?? "",
  );
  const [support, setSupport] = useState(
    team
      .filter((m) => m.membership_role === "designer" && !m.is_primary)
      .map((m) => m.user_id),
  );
  const [ops, setOps] = useState(
    team
      .filter((m) => m.membership_role === "operations_admin")
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((m) => m.user_id),
  );
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="surface live-form">
      <h2>Project assignments</h2>
      <input type="hidden" name="id" value={id} />
      <AssignmentFields
        people={people}
        primary={primary}
        onPrimary={setPrimary}
        support={support}
        onSupport={setSupport}
        ops={ops}
        onOps={setOps}
        disabled={pending}
      />
      <div className="live-field">
        <label htmlFor="reason">Change reason *</label>
        <textarea
          id="reason"
          name="reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
          rows={2}
        />
      </div>
      <ActionStatus state={state} />
      <Button type="submit" disabled={pending}>
        <Pending pending={pending} label="Save assignments" />
      </Button>
      <FormPending />
    </form>
  );
}
export function UserAccessForm({
  profile,
  rebuild = false,
}: {
  profile: Profile;
  rebuild?: boolean;
}) {
  const [state, action, pending] = useActionState(updateUserAccess, initial);
  const [role, setRole] = useState(profile.role);
  const [active, setActive] = useState(profile.active);
  const [name, setName] = useState(profile.display_name);
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="surface live-form" aria-busy={pending}>
      <input type="hidden" name="id" value={profile.id} />
      <h2>{profile.display_name}</h2>
      {rebuild ? (
        <details>
          <OperationSummary>Account reference</OperationSummary>
          <p>{profile.id}</p>
        </details>
      ) : (
        <p className="field-hint">{profile.id}</p>
      )}
      <div className="live-form-grid">
        <div className="live-field">
          <label htmlFor={`name-${profile.id}`}>Display name</label>
          <input
            id={`name-${profile.id}`}
            name="display_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={pending}
          />
        </div>
        <div className="live-field">
          <label htmlFor={`role-${profile.id}`}>Role</label>
          <select
            id={`role-${profile.id}`}
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Profile["role"])}
            disabled={pending}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          disabled={pending}
        />
        Active account
      </label>
      <input name="active" type="hidden" value={String(active)} />
      <div className="live-field">
        <label htmlFor={`reason-${profile.id}`}>Change reason *</label>
        <input
          id={`reason-${profile.id}`}
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          disabled={pending}
        />
      </div>
      <ActionStatus state={state} />
      <Button type="submit" disabled={pending}>
        <Pending pending={pending} label="Update access" />
      </Button>
      <FormPending />
    </form>
  );
}
export function InvitationForm({
  configured,
  rebuild = false,
}: {
  configured: boolean;
  rebuild?: boolean;
}) {
  const [state, action, pending] = useActionState(inviteUser, initial);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("designer");
  return (
    <form action={action} className="surface live-form">
      {!rebuild && <h2>Invite a team member</h2>}
      {!configured && (
        <p className="field-hint">
          {rebuild
            ? "Invitation delivery is unavailable in this preview. Existing accounts can still be managed from Team accounts."
            : "Set the backend-only Supabase secret key to enable invitations. You may also invite from Supabase Auth and provision the resulting inactive profile below."}
        </p>
      )}
      <div className="live-form-grid">
        <div className="live-field">
          <label htmlFor="invite-first-name">First name *</label>
          <input
            id="invite-first-name"
            name="first_name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            disabled={pending}
          />
        </div>
        <div className="live-field">
          <label htmlFor="invite-last-name">Last name *</label>
          <input
            id="invite-last-name"
            name="last_name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            disabled={pending}
          />
        </div>
        <div className="live-field">
          <label htmlFor="invite-email">Work email *</label>
          <input
            id="invite-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={pending}
          />
        </div>
      </div>
      <div className="live-field">
        <label htmlFor="invite-role">Role</label>
        <select
          id="invite-role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={pending}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabels[r]}
            </option>
          ))}
        </select>
      </div>
      <ActionStatus state={state} />
      <Button type="submit" disabled={pending || !configured}>
        <Pending pending={pending} label="Send invitation" />
      </Button>
      <FormPending />
    </form>
  );
}

export function LeadDesignerAssignmentForm({
  id,
  current,
  version,
  kind,
  people,
}: {
  id: string;
  current?: string | null;
  version?: number;
  kind: "lead" | "project";
  people: Person[];
}) {
  const [state, action, pending] = useActionState(changeLeadDesigner, initial);
  const formRef = useSavedNavigation(state);
  return (
    <form
      ref={formRef}
      action={action}
      className="live-form"
      aria-busy={pending}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="expected_designer" value={current ?? ""} />
      <input type="hidden" name="expected_version" value={version ?? ""} />
      <div className="live-field">
        <label htmlFor={`designer-${id}`}>Lead Designer *</label>
        <select
          id={`designer-${id}`}
          name="designer"
          defaultValue={current ?? ""}
          required
          disabled={pending}
        >
          <option value="">Choose a Lead Designer</option>
          {people
            .filter((p) => p.role === "lead_designer")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
        </select>
      </div>
      <div className="live-field">
        <label htmlFor={`assignment-reason-${id}`}>Assignment reason *</label>
        <textarea
          id={`assignment-reason-${id}`}
          name="reason"
          rows={2}
          maxLength={2000}
          required
          disabled={pending}
        />
      </div>
      <p className="field-hint">
        The new Lead Designer receives a notification. Access follows the new
        assignment; history is preserved.
      </p>
      <ActionStatus state={state} />
      <Button type="submit" disabled={pending || !people.length}>
        <Pending pending={pending} label="Assign Lead Designer" />
      </Button>
    </form>
  );
}
