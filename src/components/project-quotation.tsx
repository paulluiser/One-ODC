import { projectIsLost } from "@/lib/workspace-session";
import { QuotationWorkspace } from "./ui-r3/quotation";
import Link from "next/link";
import { z } from "zod";
import { formatTime } from "@/lib/phase1";
import { QuotationReviewForm } from "./quotation-review-form";
import { QuotationComparison } from "./quotation-comparison";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import {
  formatPHP,
  type Quotation,
  type QuotationVersionSummary,
} from "@/lib/quotations";
import { CreateQuotation, QuotationSpaceEditor } from "./quotation-editor";
export async function ProjectQuotation({
  project,
  selected,
  version,
  compare,
}: {
  project: string;
  selected?: string;
  version?: string;
  compare?: string;
}) {
  const { client, profile } = await requireWorkspace();
  const lost = await projectIsLost(project);
  const [r, control, listed] = await Promise.all([
    client.rpc("get_project_quotation", { p_project: project }),
    client.from("projects").select("is_cancelled").eq("id", project).single(),
    client.rpc("list_quotation_versions", { p_project: project }),
  ]);
  for (const result of [r, control, listed]) checkDatabase(result.error);
  const cancelled = lost || control.data?.is_cancelled === true;
  const versions = (listed.data ?? []) as QuotationVersionSummary[];
  let quotation = r.data as Quotation | null;
  if (version) {
    if (
      !z.uuid().safeParse(version).success ||
      !versions.some((v) => v.id === version)
    )
      return (
        <section className="surface live-form">
          <h2>Quotation version unavailable</h2>
          <p>This version does not exist or is not available to your role.</p>
          <Link href={`/dashboard/projects/${project}?tab=quotation`}>
            Return to current quotation
          </Link>
        </section>
      );
    const specific = await client.rpc("get_quotation_version", {
      p_project: project,
      p_version: version,
    });
    checkDatabase(specific.error);
    quotation = specific.data as Quotation;
  }
  if (lost && quotation)
    quotation = {
      ...quotation,
      can_submit: false,
      can_review: false,
      can_create_draft: false,
      spaces: quotation.spaces.map((s) => ({ ...s, editable: false })),
    };
  let comparison: Quotation | null = null;
  if (
    compare &&
    quotation?.state !== "Draft" &&
    versions.some((v) => v.id === compare && v.state !== "Draft") &&
    z.uuid().safeParse(compare).success
  ) {
    const c = await client.rpc("get_quotation_version", {
      p_project: project,
      p_version: compare,
    });
    checkDatabase(c.error);
    comparison = c.data as Quotation;
  }
  if (process.env.ONE_ODC_UI_R0_ENABLED === "true")
    return (
      <QuotationWorkspace
        project={project}
        quotation={quotation}
        versions={versions}
        comparison={comparison}
        selected={selected}
        compare={compare}
        cancelled={cancelled}
        role={profile.role}
      />
    );
  if (!quotation)
    return (
      <section className="surface live-form">
        <h2>Quotation</h2>
        <p>
          {profile.role === "bdm"
            ? "No approved quotation is available."
            : "No quotation draft yet. Create an empty draft, then add items to existing spaces."}
        </p>
        {!cancelled &&
          ["designer", "lead_designer", "system_administrator"].includes(
            profile.role,
          ) && <CreateQuotation project={project} />}
      </section>
    );
  const editSpace = quotation.spaces.find(
    (s) => s.id === selected && s.editable,
  );
  // Scrollable regions need keyboard focus to expose overflowed financial columns.
  /* eslint-disable jsx-a11y/no-noninteractive-tabindex */
  return (
    <>
      <section className="surface live-form quotation-summary">
        <h2>
          Quotation · {quotation.state} version {quotation.number}
        </h2>
        <p className="quotation-grand-total">
          Saved project total: <strong>{formatPHP(quotation.total)}</strong>
        </p>
        <p className="field-hint">
          {quotation.state === "Draft"
            ? "PHP · Cancelled spaces are excluded. Pricing is independent of design progress and commercial stage."
            : "Read-only submitted snapshot. Space names, items and PHP totals are fixed at submission."}
        </p>
        {cancelled && <p>Project cancelled. This quotation is read-only.</p>}
        {quotation.state === "Submitted for Review" && (
          <p role="status">Pending Lead Designer review.</p>
        )}
        {quotation.state === "Returned for Revision" && (
          <p>Returned for Revision: {quotation.review_remarks}</p>
        )}
        {quotation.submitted_at && (
          <p>Submitted {formatTime(quotation.submitted_at)}</p>
        )}
        {quotation.reviewed_at && (
          <p>
            {quotation.state} {formatTime(quotation.reviewed_at)}
            {quotation.review_remarks ? ` · ${quotation.review_remarks}` : ""}
          </p>
        )}
        {(quotation.submitted_by || quotation.reviewed_by) && (
          <details>
            <summary>Submission and reviewer references</summary>
            <p>
              Submitted by: {quotation.submitted_by || "Not submitted"} ·
              Reviewer: {quotation.reviewed_by || "Not reviewed"}
            </p>
          </details>
        )}
        {quotation.source_version_id && (
          <p className="field-hint">
            Copied from{" "}
            <Link
              href={`/dashboard/projects/${project}?tab=quotation&version=${quotation.source_version_id}`}
            >
              previous version
            </Link>
            . The source stays unchanged. Cancelled Spaces are excluded when
            creating a new draft.
          </p>
        )}
        {editSpace ? (
          <p>
            <Link
              className="button button-outline"
              href={`/dashboard/projects/${project}?tab=quotation&version=${quotation.id}`}
            >
              Return to quotation overview
            </Link>{" "}
            to submit after saving your Space items.
          </p>
        ) : (
          <>
            {quotation.can_submit && (
              <QuotationReviewForm
                quotation={quotation}
                intent="submit"
                administrator={profile.role === "system_administrator"}
              />
            )}
            {quotation.can_review && (
              <div className="review-actions">
                <QuotationReviewForm
                  quotation={quotation}
                  intent="Approved"
                  administrator={profile.role === "system_administrator"}
                />
                <QuotationReviewForm
                  quotation={quotation}
                  intent="Returned for Revision"
                  administrator={profile.role === "system_administrator"}
                />
              </div>
            )}
            {quotation.can_create_draft && versions[0]?.id === quotation.id && (
              <CreateQuotation
                project={project}
                label={
                  quotation.state === "Returned for Revision"
                    ? "Create corrected draft"
                    : "Create next quotation draft"
                }
              />
            )}
          </>
        )}
        {!quotation.spaces.length && (
          <p>
            No spaces yet. Create spaces in the project overview before adding
            items.
          </p>
        )}
      </section>
      {comparison &&
        quotation.state !== "Draft" &&
        comparison.id !== quotation.id && (
          <QuotationComparison
            before={
              quotation.number < comparison.number ? quotation : comparison
            }
            after={
              quotation.number < comparison.number ? comparison : quotation
            }
          />
        )}
      {compare && !comparison && (
        <p role="alert" className="form-error">
          Only accessible submitted versions can be compared.
        </p>
      )}
      {editSpace && (
        <section className="surface live-form">
          <h2>Edit {editSpace.name}</h2>
          <p className="field-hint">Space ID: {editSpace.id}</p>
          <QuotationSpaceEditor
            key={editSpace.id}
            quotation={quotation}
            space={editSpace}
          />
        </section>
      )}
      {quotation.spaces.map((space) => (
        <section className="surface live-form quotation-space" key={space.id}>
          <h2>
            {space.name}
            {space.cancelled ? " · Cancelled" : ""}
          </h2>
          <details className="record-identifiers">
            <summary>Space reference</summary>
            <p>Space ID: {space.id}</p>
          </details>
          <p className="space-subtotal">
            Saved subtotal: {formatPHP(space.subtotal)}
          </p>
          {space.cancelled && (
            <p>
              Historical items retained below; excluded from the quotation
              total.
            </p>
          )}
          {space.items.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label={`Saved quotation items for ${space.name}`}
              tabIndex={0}
            >
              <table className="live-table money-table">
                <caption className="sr-only">
                  Saved items for {space.name}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Unit price</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {space.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>{formatPHP(item.unit_price)}</td>
                      <td>{formatPHP(item.line_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No saved items.</p>
          )}
          {space.editable && space.id !== editSpace?.id && (
            <Link
              className="button button-outline"
              href={`/dashboard/projects/${project}?tab=quotation&version=${quotation.id}&space=${space.id}`}
            >
              Edit items for {space.name}
            </Link>
          )}
        </section>
      ))}
      <details className="surface live-form" open={!!version || !!compare}>
        <summary>Version history and comparison</summary>
        <section
          className="surface live-form"
          aria-label="Quotation version history"
        >
          <h2>Version history</h2>
          <ul>
            {versions.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/dashboard/projects/${project}?tab=quotation&version=${v.id}`}
                  aria-current={v.id === quotation.id ? "page" : undefined}
                >
                  Version {v.number} · {v.state}
                </Link>
                {v.submitted_at
                  ? ` · Submitted ${formatTime(v.submitted_at)}`
                  : ""}
              </li>
            ))}
          </ul>
          {quotation.state !== "Draft" &&
            versions.filter((v) => v.state !== "Draft" && v.id !== quotation.id)
              .length > 0 && (
              <form method="get" className="live-form">
                <input type="hidden" name="tab" value="quotation" />
                <input type="hidden" name="version" value={quotation.id} />
                <label className="live-field" htmlFor="compare-version">
                  Compare with version
                  <select
                    id="compare-version"
                    name="compare"
                    defaultValue={compare ?? ""}
                    required
                  >
                    <option value="">Select version</option>
                    {versions
                      .filter(
                        (v) => v.state !== "Draft" && v.id !== quotation.id,
                      )
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          Version {v.number} · {v.state}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="button button-outline">
                  Compare versions
                </button>
              </form>
            )}
        </section>
      </details>
      <details className="surface live-form">
        <summary>Submission and review activity</summary>
        <section className="surface live-form">
          <h2>Quotation activity · version {quotation.number}</h2>
          {quotation.history?.length ? (
            <ol>
              {quotation.history.map((event) => (
                <li key={event.id}>
                  {formatTime(event.occurred_at)} · {event.action}
                  <p className="field-hint">Account: {event.actor_id}</p>
                  {event.remarks && <p>{event.remarks}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p>No submission or review activity yet.</p>
          )}
        </section>
      </details>
    </>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-tabindex */
}
