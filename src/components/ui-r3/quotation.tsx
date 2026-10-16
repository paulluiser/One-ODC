import Link from "next/link";
import { Pencil, LockKeyhole, FileText } from "lucide-react";
import {
  formatPHP,
  type Quotation,
  type QuotationVersionSummary,
} from "../../lib/quotations";
import { formatTime } from "../../lib/phase1";
import { Disclosure, Status } from "../ui-r2/primitives";
import { ContextPanel } from "../context-panel";
import { CreateQuotation, QuotationSpaceEditor } from "../quotation-editor";
import { QuotationReviewForm } from "../quotation-review-form";
import { QuotationComparison } from "../quotation-comparison";
import { RecordTable } from "../record-table";
import styles from "./ui-r3.module.css";
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
  const base = `/dashboard/projects/${project}?tab=quotation`,
    admin = role === "system_administrator";
  if (!q)
    return (
      <section className={`surface live-form ${styles.empty}`}>
        <FileText size={26} aria-hidden="true" />
        <h2>Quotation</h2>
        <p>
          {role === "bdm"
            ? "No approved quotation is available."
            : "Start a quotation using the project’s existing spaces."}
        </p>
        {!cancelled &&
          ["designer", "lead_designer", "system_administrator"].includes(
            role,
          ) && <CreateQuotation project={project} />}
      </section>
    );
  const edit = q.spaces.find((s) => s.id === selected && s.editable);
  const action = (
    intent: "submit" | "Approved" | "Returned for Revision",
    title: string,
  ) => (
    <ContextPanel
      title={title}
      triggerLabel={title}
      description={`Version ${q.number} · ${formatPHP(q.total)}`}
      panelClassName={styles.dialog}
    >
      <QuotationReviewForm
        quotation={q}
        intent={intent}
        administrator={admin}
        rebuild
      />
    </ContextPanel>
  );
  return (
    <div className={styles.workspace}>
      <section
        className={`surface live-form ${styles.quoteHeader}`}
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
                  <LockKeyhole size={14} aria-hidden="true" />
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
              spaces
            </small>
          </div>
        </div>
        {q.state === "Submitted for Review" && (
          <p role="status" className={styles.notice}>
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
            <label htmlFor="quotation-version">Quotation version</label>
            <select id="quotation-version" name="version" defaultValue={q.id}>
              {versions.map((v) => (
                <option value={v.id} key={v.id}>
                  Version {v.number} · {v.state}
                </option>
              ))}
            </select>
            <button className="button button-outline">View version</button>
          </form>
          <div className={styles.actions}>
            {edit ? (
              <Link
                className="button button-outline"
                href={`${base}&version=${q.id}`}
              >
                Return to quotation overview
              </Link>
            ) : (
              <>
                {q.can_submit && action("submit", "Submit for Review")}
                {q.can_review && (
                  <>
                    {action("Approved", "Approve quotation")}
                    {action("Returned for Revision", "Return for Revision")}
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
      </section>
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
      {edit && (
        <section
          className="surface live-form"
          aria-label={`Quotation editor for ${edit.name}`}
        >
          <div className={styles.sectionHeader}>
            <div>
              <h2>Edit {edit.name}</h2>
              <p>Save this space before submitting the complete quotation.</p>
            </div>
            <Status>Draft editing</Status>
          </div>
          <QuotationSpaceEditor
            key={edit.id}
            quotation={q}
            space={edit}
            rebuild
          />
        </section>
      )}
      <div className={styles.itemization}>
        <div className={styles.sectionHeader}>
          <h2>Space itemization</h2>
          <span className={styles.muted}>
            {q.state === "Draft"
              ? "Saved values · edits stay in draft"
              : "Historical names and items preserved"}
          </span>
        </div>
        {!q.spaces.length && (
          <section className="surface live-form">
            <p>
              No spaces yet. Create spaces in the project overview before adding
              items.
            </p>
            <Link href={`/dashboard/projects/${project}#project-spaces`}>
              Open Spaces
            </Link>
          </section>
        )}
        {q.spaces
          .filter((s) => s.id !== edit?.id)
          .map((s) => (
            <section className="surface live-form" key={s.id}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3>{s.name}</h3>
                  {s.cancelled && (
                    <Status>Cancelled · excluded from total</Status>
                  )}
                </div>
                <div className={styles.spaceTotal}>
                  <span>Space subtotal</span>
                  <strong>{formatPHP(s.subtotal)}</strong>
                </div>
                {s.editable && (
                  <Link
                    className="button button-outline"
                    href={`${base}&version=${q.id}&space=${s.id}`}
                  >
                    <Pencil size={15} aria-hidden="true" />
                    Edit items for {s.name}
                  </Link>
                )}
              </div>
              {s.items.length ? (
                <RecordTable label={`Saved quotation items for ${s.name}`}>
                  <table className={`live-table ${styles.moneyTable}`}>
                    <caption className="sr-only">
                      Saved items for {s.name}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Description</th>
                        <th scope="col">Quantity</th>
                        <th scope="col">Unit price</th>
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
                <p className={styles.muted}>No saved items.</p>
              )}
              <Disclosure title="Space reference">
                <p>{s.id}</p>
              </Disclosure>
            </section>
          ))}
      </div>
      <div className={styles.historyGrid}>
        <Disclosure
          className="surface"
          title="Version history and comparison"
          open={!!compare}
        >
          <div role="region" aria-label="Quotation version history">
            <ul className={styles.history}>
              {versions.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`${base}&version=${v.id}`}
                    aria-current={q.id === v.id ? "page" : undefined}
                  >
                    Version {v.number} · {v.state}
                  </Link>
                  <small>
                    {v.submitted_at ? formatTime(v.submitted_at) : "Draft"}
                  </small>
                </li>
              ))}
            </ul>
            {q.state !== "Draft" &&
              versions.some((v) => v.state !== "Draft" && v.id !== q.id) && (
                <form method="get" className="live-form">
                  <input type="hidden" name="tab" value="quotation" />
                  <input type="hidden" name="version" value={q.id} />
                  <label htmlFor="compare-version">Compare with version</label>
                  <select
                    id="compare-version"
                    name="compare"
                    defaultValue={compare ?? ""}
                    required
                  >
                    <option value="">Select version</option>
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
        </Disclosure>
        <Disclosure className="surface" title="Submission and review activity">
          {q.created_at && <p>Created {formatTime(q.created_at)}</p>}
          {q.created_by && (
            <Disclosure title="Creator reference">
              <p>{q.created_by}</p>
            </Disclosure>
          )}
          <ol className={styles.history}>
            {q.history?.map((e) => (
              <li key={e.id}>
                <strong>{e.action}</strong>
                <small>{formatTime(e.occurred_at)}</small>
                {e.remarks && <p>{e.remarks}</p>}
                <Disclosure title="Actor reference">
                  <p>{e.actor_id}</p>
                </Disclosure>
              </li>
            ))}
          </ol>
          {!q.history?.length && <p>No submission or review activity yet.</p>}
          {q.submitted_at && <p>Submitted {formatTime(q.submitted_at)}</p>}
          {q.reviewed_at && (
            <p>
              {q.state} {formatTime(q.reviewed_at)}
              {q.review_remarks ? ` · ${q.review_remarks}` : ""}
            </p>
          )}
          {q.source_version_id && (
            <Link href={`${base}&version=${q.source_version_id}`}>
              View source version
            </Link>
          )}
        </Disclosure>
      </div>
    </div>
  );
}
