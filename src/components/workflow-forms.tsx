"use client";
import { OperationSummary } from "./ui-r4/primitives";
import { Disclosure } from "./ui-r2/primitives";
import r2 from "./ui-r2/ui-r2.module.css";
import { OperationFeedback } from "./operation-feedback";
import { FormPending } from "./form-pending";
import { useActionState, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LeadFields,
  ReviewFields,
  AssignmentFields,
  AttachmentList,
  type LeadValues,
} from "./lead-fields";
import {
  emptyLead,
  attachmentSchema,
  roleLabels,
  type FormState,
  type Lead,
  type Person,
  type Profile,
  type Member,
  type Attachment,
} from "@/lib/phase1";
import { roles } from "@/lib/domain";
import {
  saveLead,
  reviewLead,
  assignPersonnel,
  updateUserAccess,
  inviteUser,
} from "@/app/dashboard/actions";
import { ResourceLinks } from "./resource-links";
const initial: FormState = { error: null };
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
  lead,
  resourcesEnabled = false,
  rebuild = false,
}: {
  id: string;
  bdmName: string;
  lead?: Lead;
  resourcesEnabled?: boolean;
  rebuild?: boolean;
}) {
  const [state, action, pending] = useActionState(saveLead, initial);
  const base = lead ?? emptyLead;
  const [values, setValues] = useState<LeadValues>({
    ...base,
    cabinetry_count:
      base.cabinetry_count === null ? "" : String(base.cabinetry_count),
  });
  const [links, setLinks] = useState(base.resource_links ?? []);
  const [files, setFiles] = useState<Attachment[]>(base.attachment_metadata);
  const [fileError, setFileError] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    const first = Object.keys(state.fields ?? {})[0];
    if (first) document.getElementById(first)?.focus();
  }, [state]);
  const fields = (
    <LeadFields
      values={values}
      errors={state.fields}
      disabled={pending}
      onValue={(k, v) => setValues({ ...values, [k]: v })}
    />
  );
  const resources = (
    <>
      {" "}
      <div className="lead-files-guidance">
        <h3 className="form-section-label">03 · Files and references</h3>
        <p>
          Save your draft to upload up to three active files, each up to 50 MiB.
          Use Files and Resources links for additional documents.
        </p>
      </div>
      {resourcesEnabled && (
        <ResourceLinks
          links={links}
          onChange={setLinks}
          disabled={pending}
          error={state.fields?.resource_links}
        />
      )}
    </>
  );
  const metadata = (
    <div className="live-field">
      <label htmlFor="supporting-files">Supporting file metadata</label>
      <p className="field-hint" id="file-note">
        Files selected here are recorded by name, type, and size only. Their
        contents are not uploaded or stored. Save a draft to upload actual files
        in the private attachments panel. Metadata does not consume
        uploaded-file slots.
      </p>
      <input
        id="supporting-files"
        type="file"
        multiple
        disabled={pending}
        aria-describedby="file-note"
        onChange={(e) => {
          const selected = [...(e.target.files ?? [])].map((f) => ({
            name: f.name,
            size: f.size,
            mime_type: f.type,
            state: "not_uploaded" as const,
          }));
          if (
            selected.length > 5 ||
            selected.some((f) => !attachmentSchema.safeParse(f).success)
          ) {
            setFileError(
              "Choose up to five files, each no larger than 50 MiB. No file contents have been uploaded.",
            );
            return;
          }
          setFiles(selected);
          setFileError("");
        }}
      />
      {fileError && (
        <p className="field-error" role="alert">
          {fileError}
        </p>
      )}
      <AttachmentList files={files} />
      {files.length > 0 && (
        <button
          type="button"
          className="text-link"
          onClick={() => setFiles([])}
          disabled={pending}
        >
          Clear file metadata
        </button>
      )}
    </div>
  );
  const duplicateReview = (
    <>
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
    </>
  );
  return (
    <form action={action} className="surface live-form lead-request-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expected_version" value={lead?.version ?? 0} />
      <input
        type="hidden"
        name="attachment_metadata"
        value={JSON.stringify(files)}
      />
      <div className="form-heading">
        <h2>Project Quotation Request</h2>
        <p>
          BDM: <strong>{bdmName}</strong> · derived from your signed-in account.
        </p>
      </div>
      {rebuild ? (
        <div className={r2.formColumns}>
          <div>{fields}</div>
          <aside>
            {resources}
            <Disclosure title="File metadata (not uploaded)">
              {metadata}
            </Disclosure>
            {duplicateReview}
          </aside>
        </div>
      ) : (
        <>
          {fields}
          {resources}
          {metadata}
          {duplicateReview}
        </>
      )}
      <ActionStatus state={state} />
      <div className="form-actions">
        <Button
          type="submit"
          name="intent"
          value="submit"
          disabled={pending || !!fileError}
        >
          <Pending
            pending={pending}
            label={lead?.first_submitted_at ? "Resubmit lead" : "Submit lead"}
          />
        </Button>
        <Button
          type="submit"
          variant="outline"
          name="intent"
          value="draft"
          formNoValidate
          disabled={pending || !!fileError}
        >
          Save draft
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
  const [decision, setDecision] = useState("");
  const [remarks, setRemarks] = useState("");
  const [primary, setPrimary] = useState(
    profile.role === "lead_designer" ? profile.id : "",
  );
  const [support, setSupport] = useState<string[]>([]);
  const [ops, setOps] = useState<string[]>([]);
  const [leadDesigner, setLeadDesigner] = useState("");
  return (
    <form action={action} className="surface live-form lead-review-form">
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
          {profile.role === "system_administrator" ? (
            <div className="live-field">
              <label htmlFor="lead_designer">Lead Designer *</label>
              <select
                name="lead_designer"
                id="lead_designer"
                value={leadDesigner}
                onChange={(e) => setLeadDesigner(e.target.value)}
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
          ) : (
            <p className="field-hint">
              Lead Designer: {profile.display_name}. You may assign yourself to
              design work.
            </p>
          )}
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
  const [name, setName] = useState("");
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
          <label htmlFor="invite-name">Name *</label>
          <input
            id="invite-name"
            name="display_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
