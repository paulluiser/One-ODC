import r2 from "@/components/ui-r2/ui-r2.module.css";
import {
  DisclosureSummary,
  Scope,
  Heading,
  Status,
} from "@/components/ui-r2/primitives";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import {
  leadSchema,
  mayReview,
  leadAge,
  formatTime,
  type Person,
  type Submission,
  type Review,
} from "@/lib/phase1";
import {
  LeadForm,
  ReviewForm,
  LeadDesignerAssignmentForm,
} from "@/components/workflow-forms";
import { AttachmentList } from "@/components/lead-fields";
import {
  LeadAttachments,
  type StoredAttachment,
  type StoredVersion,
} from "@/components/lead-attachments";
import { PageIntro } from "@/components/live-data";
import { SavedResources } from "@/components/resource-links";
export default async function LeadDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, profile } = await requireRole([
    "bdm",
    "lead_designer",
    "system_administrator",
  ]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const record = await client
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  checkDatabase(record.error);
  if (!record.data) notFound();
  const lead = leadSchema.parse(record.data);
  const designers = await client.rpc("list_lead_designers");
  checkDatabase(designers.error);
  const storageEnabled = process.env.ONE_ODC_ATTACHMENTS_ENABLED === "true";
  const [submissions, reviews, origin, peopleResult, attached, slots] =
    await Promise.all([
      client
        .from("lead_submissions")
        .select("*")
        .eq("lead_id", id)
        .order("number", { ascending: false })
        .limit(50),
      client
        .from("lead_reviews")
        .select("*")
        .eq("lead_id", id)
        .order("reviewed_at", { ascending: false })
        .limit(50),
      client
        .from("project_origins")
        .select("project_id")
        .eq("lead_id", id)
        .maybeSingle(),
      mayReview(profile.role) && lead.status === "Submitted"
        ? client.rpc("list_assignable_people")
        : { data: null, error: null },
      storageEnabled
        ? client
            .from("attachments")
            .select("id,archived_at")
            .eq("lead_id", id)
            .order("created_at")
        : { data: [], error: null },
      storageEnabled && process.env.ONE_ODC_RESOURCES_ENABLED === "true"
        ? client.rpc("get_attachment_slots", { p_lead: id })
        : { data: undefined, error: null },
    ]);
  for (const r of [submissions, reviews, origin, peopleResult, attached, slots])
    checkDatabase(r.error);
  const people: Person[] = peopleResult.data ?? [];
  const author =
    profile.role === "system_administrator"
      ? await client
          .from("audit_events")
          .select("actor_id")
          .eq("entity_type", "lead")
          .eq("entity_id", id)
          .in("action", ["lead.draft_saved", "lead.submitted"])
          .eq("new_value->>version", "1")
          .maybeSingle()
      : null;
  checkDatabase(author?.error ?? null);
  const editable =
    ((profile.role === "bdm" && lead.bdm_id === profile.id) ||
      (profile.role === "system_administrator" &&
        author?.data?.actor_id === profile.id)) &&
    ["Draft", "Returned for Clarification"].includes(lead.status);
  const versions = attached.data?.length
    ? await client
        .from("attachment_versions")
        .select("*")
        .in(
          "attachment_id",
          attached.data.map((a) => a.id),
        )
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  checkDatabase(versions.error);
  const rebuild = process.env.ONE_ODC_UI_R0_ENABLED === "true";
  const brief = editable ? (
    <LeadForm
      rebuild={rebuild}
      id={id}
      lead={lead}
      bdms={
        profile.role === "system_administrator"
          ? [{ id: lead.bdm_id, display_name: "Assigned BDM", role: "bdm" }]
          : undefined
      }
      leadDesigners={designers.data ?? []}
      bdmName={profile.display_name}
    />
  ) : (
    <section className="surface live-form lead-brief">
      <h2>Request details</h2>
      {mayReview(profile.role) &&
        ["Submitted", "Returned for Clarification"].includes(lead.status) && (
          <details className="workspace-disclosure">
            <DisclosureSummary>Assign Lead Designer</DisclosureSummary>
            <LeadDesignerAssignmentForm
              id={id}
              kind="lead"
              current={lead.assigned_lead_designer_id}
              version={lead.version}
              people={designers.data ?? []}
            />
          </details>
        )}
      <dl className="record-details">
        <div>
          <dt>Primary BDM account</dt>
          <dd>
            {lead.bdm_id === profile.id
              ? profile.display_name
              : people.find((person) => person.id === lead.bdm_id)
                  ?.display_name || "Originating BDM"}
            <details className="record-identifiers">
              <DisclosureSummary>Account reference</DisclosureSummary>
              {lead.bdm_id}
            </details>
          </dd>
        </div>
        <div>
          <dt>Request Lead Designer</dt>
          <dd>
            {designers.data?.find(
              (p: Person) => p.id === lead.assigned_lead_designer_id,
            )?.display_name ??
              (lead.assigned_lead_designer_id
                ? "Inactive Lead Designer"
                : lead.status === "Accepted"
                  ? "See accepted Project"
                  : "Awaiting assignment")}
          </dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd>{lead.address}</dd>
        </div>
        <div>
          <dt>Brand</dt>
          <dd>{lead.brand || "Not specified"}</dd>
        </div>
        <div>
          <dt>Estimated Cabinetries</dt>
          <dd>{lead.cabinetry_count ?? "Not specified"}</dd>
        </div>
        <div>
          <dt>Date Needed</dt>
          <dd>{lead.date_needed || "Not specified"}</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {lead.notes || "No notes"}
          </dd>
        </div>
      </dl>
      <SavedResources links={lead.resource_links} />
      <AttachmentList files={lead.attachment_metadata} />
      {lead.attachment_metadata.length > 0 && (
        <p className="field-hint">
          Metadata only. These files have not been uploaded.
        </p>
      )}
    </section>
  );
  const files = storageEnabled && !!attached.data?.length && (
    <LeadAttachments
      leadId={id}
      allowUploads={false}
      slots={slots.data}
      editable={editable}
      userId={profile.id}
      attachments={(attached.data ?? []) as StoredAttachment[]}
      versions={(versions.data ?? []) as StoredVersion[]}
    />
  );
  const review = mayReview(profile.role) && lead.status === "Submitted" && (
    <ReviewForm lead={lead} people={people} profile={profile} />
  );
  const history = (
    <>
      <details className="surface live-form lead-history">
        <DisclosureSummary>Submission history</DisclosureSummary>
        <h2>Submission history</h2>
        <p className="field-hint">
          Complete snapshots are preserved. Showing the latest 50 submissions.
        </p>
        {(submissions.data as Submission[]).length ? (
          (submissions.data as Submission[]).map((s) => (
            <details className="history-entry" key={s.id}>
              <DisclosureSummary>
                Submission {s.number} · {formatTime(s.submitted_at)}
              </DisclosureSummary>
              <dl className="record-details">
                <div>
                  <dt>Project</dt>
                  <dd>{s.snapshot.project_name}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{s.snapshot.address}</dd>
                </div>
                <div>
                  <dt>Cabinetries / Brand</dt>
                  <dd>
                    {s.snapshot.cabinetry_count} /{" "}
                    {s.snapshot.brand || "Not specified"}
                  </dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{s.snapshot.notes || "No notes"}</dd>
                </div>
                <div>
                  <dt>Date Needed</dt>
                  <dd>{s.snapshot.date_needed || "Not specified"}</dd>
                </div>
                {s.snapshot.duplicate_override_reason && (
                  <div>
                    <dt>Duplicate review reason</dt>
                    <dd>{s.snapshot.duplicate_override_reason}</dd>
                  </div>
                )}
              </dl>
              <AttachmentList files={s.snapshot.attachment_metadata} />
              {s.snapshot.uploaded_attachments?.map((file) => (
                <p key={file.version_id}>
                  {file.original_name} · {file.actual_size.toLocaleString()}{" "}
                  bytes · Verified version {file.version_id}
                </p>
              ))}
            </details>
          ))
        ) : (
          <p className="field-hint">This draft has not been submitted.</p>
        )}
      </details>
      <details className="surface live-form lead-history">
        <DisclosureSummary>Review history</DisclosureSummary>
        <h2>Review history</h2>
        {(reviews.data as Review[]).length ? (
          (reviews.data as Review[]).map((r) => (
            <article className="history-entry" key={r.id}>
              <h3>{r.decision}</h3>
              <p>{r.remarks || "Accepted without additional remarks."}</p>
              <small>
                {formatTime(r.reviewed_at)} · Reviewer {r.reviewer_id}
              </small>
            </article>
          ))
        ) : (
          <p className="field-hint">No review decisions yet.</p>
        )}
      </details>
    </>
  );
  if (rebuild)
    return (
      <Scope>
        <Heading
          title={lead.project_name || "Untitled draft"}
          description={`${lead.reference} · Saved ${formatTime(lead.updated_at)} · Revision ${lead.version}`}
          action={
            origin.data && (
              <Link
                className="button button-outline"
                href={`/dashboard/projects/${origin.data.project_id}`}
              >
                Open Project
              </Link>
            )
          }
        />
        <div>
          <Status>{lead.status}</Status>{" "}
          <span className="field-hint">
            {leadAge(lead) === null
              ? "Not submitted"
              : `${leadAge(lead)} calendar days since submission`}
          </span>
        </div>
        {editable ? (
          <>
            {brief}
            {files}
          </>
        ) : (
          <div className={r2.leadGrid}>
            <div>{brief}</div>
            <div>
              {review}
              {files}
            </div>
          </div>
        )}
        <div className={r2.workspaceAside}>{history}</div>
      </Scope>
    );
  return (
    <>
      <PageIntro
        title={lead.project_name || "Untitled draft"}
        description={`${lead.reference} · ${lead.status} · ${leadAge(lead) === null ? "Not submitted" : `${leadAge(lead)} calendar days`}`}
      >
        {origin.data && (
          <Link
            className="button button-outline"
            href={`/dashboard/projects/${origin.data.project_id}`}
          >
            Open Project →
          </Link>
        )}
      </PageIntro>
      <p className="live-updated">
        Last saved {formatTime(lead.updated_at)} · Revision {lead.version}
      </p>
      {brief}
      {files}
      {review}
      {history}
    </>
  );
}
