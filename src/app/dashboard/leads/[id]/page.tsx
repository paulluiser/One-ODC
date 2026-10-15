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
import { LeadForm, ReviewForm } from "@/components/workflow-forms";
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
  const editable =
    profile.role === "bdm" &&
    lead.bdm_id === profile.id &&
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
      {editable ? (
        <LeadForm
          resourcesEnabled={process.env.ONE_ODC_RESOURCES_ENABLED === "true"}
          id={id}
          lead={lead}
          bdmName={profile.display_name}
        />
      ) : (
        <section className="surface live-form">
          <h2>Request details</h2>
          <dl className="record-details">
            <div>
              <dt>Primary BDM account</dt>
              <dd>{lead.bdm_id}</dd>
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
              <dt>Number of Cabinetries</dt>
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
          {process.env.ONE_ODC_RESOURCES_ENABLED === "true" && (
            <SavedResources links={lead.resource_links} />
          )}
          <AttachmentList files={lead.attachment_metadata} />
          {lead.attachment_metadata.length > 0 && (
            <p className="field-hint">
              Metadata only. These files have not been uploaded.
            </p>
          )}
        </section>
      )}
      {mayReview(profile.role) && lead.status === "Submitted" && (
        <ReviewForm lead={lead} people={people} profile={profile} />
      )}
      {storageEnabled && (
        <LeadAttachments
          leadId={id}
          slots={slots.data}
          editable={editable}
          userId={profile.id}
          attachments={(attached.data ?? []) as StoredAttachment[]}
          versions={(versions.data ?? []) as StoredVersion[]}
        />
      )}
      <details className="surface live-form lead-history">
        <summary>Submission history</summary>
        <h2>Submission history</h2>
        <p className="field-hint">
          Complete snapshots are preserved. Showing the latest 50 submissions.
        </p>
        {(submissions.data as Submission[]).length ? (
          (submissions.data as Submission[]).map((s) => (
            <details className="history-entry" key={s.id}>
              <summary>
                Submission {s.number} · {formatTime(s.submitted_at)}
              </summary>
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
        <summary>Review history</summary>
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
}
