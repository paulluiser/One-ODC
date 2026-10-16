import Link from "next/link";
import { randomUUID } from "node:crypto";
import {
  financialAmount,
  type Financials,
  type FinancialValue,
  type PaymentGroup,
} from "../../lib/finance";
import { formatTime } from "../../lib/phase1";
import { ContextPanel } from "../context-panel";
import { FinanceForm, PaymentHeading } from "../finance-form";
import { AmountFields } from "../financial-fields";
import { RecordTable } from "../record-table";
import { Disclosure, Status } from "../ui-r2/primitives";
import styles from "./ui-r3.module.css";
function Value({
  project,
  kind,
  value,
  admin,
}: {
  project: string;
  kind: "Sale" | "Raw";
  value: FinancialValue;
  admin: boolean;
}) {
  return (
    <section
      className={`surface live-form ${styles.value}`}
      aria-label={`${kind} management`}
    >
      <div className={styles.sectionHeader}>
        <h2>{kind}</h2>
        <span className={styles.muted}>
          {value.editable ? "Authorized adjustment" : "Read-only"}
        </span>
      </div>
      <strong className={styles.amount}>
        {value.amount === null ? "Not recorded" : financialAmount(value.amount)}
      </strong>
      {value.editable && (
        <ContextPanel
          title={`Adjust ${kind}`}
          description={`Changes preserve the previous ${kind} and require an audit reason where applicable.`}
          panelClassName={styles.dialog}
          guardUnsaved
          resetOnClose
        >
          <FinanceForm
            rebuild
            project={project}
            id={project}
            kind={kind}
            version={value.version}
            intent="value"
            label={`Save ${kind}`}
            reasonRequired={kind === "Raw" || value.version > 0 || admin}
          >
            <label className="live-field" htmlFor={`${project}-${kind}`}>
              {kind} amount (PHP)
              <input
                id={`${project}-${kind}`}
                name="amount"
                inputMode="decimal"
                pattern="(0|[1-9][0-9]{0,25})([.][0-9]{1,2})?"
                defaultValue={value.amount ?? ""}
                required
              />
            </label>
          </FinanceForm>
        </ContextPanel>
      )}
      <Disclosure title={`${kind} history`}>
        {value.history.length ? (
          <ol className={styles.history}>
            {value.history.map((e) => (
              <li key={e.id}>
                <strong>{financialAmount(e.new_amount)}</strong>
                <small>
                  {formatTime(e.occurred_at)} · Revision {e.version}
                </small>
                <p>
                  {e.previous_amount === null
                    ? "Not recorded"
                    : financialAmount(e.previous_amount)}{" "}
                  → {financialAmount(e.new_amount)}
                </p>
                <p>{e.reason}</p>
                <Disclosure title="Actor reference">
                  <p>{e.actor_id}</p>
                </Disclosure>
              </li>
            ))}
          </ol>
        ) : (
          <p>No {kind} history yet.</p>
        )}
      </Disclosure>
    </section>
  );
}
function Ledger({
  project,
  kind,
  group,
  f,
  admin,
}: {
  project: string;
  kind: "client" | "supplier";
  group: PaymentGroup;
  f: Financials;
  admin: boolean;
}) {
  const title = kind === "client" ? "Client" : "Supplier",
    createId = randomUUID();
  return (
    <section className="surface live-form" aria-label={`${title} payments`}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>{title} payments</h2>
          <p className={styles.muted}>Actual recorded payments · PHP</p>
        </div>
        {f.can_manage_payments && !f.cancelled && (
          <ContextPanel
            title={`Add ${kind} payment`}
            description="Record an actual payment. Confirm the amount, date and payment reference before saving."
            panelClassName={styles.dialog}
            guardUnsaved
            resetOnClose
          >
            <FinanceForm
              rebuild
              project={project}
              id={createId}
              kind={kind}
              version={0}
              intent="save"
              label={`Record ${kind} payment`}
              reasonRequired={admin}
            >
              <AmountFields id={createId} today={f.today} />
            </FinanceForm>
          </ContextPanel>
        )}
      </div>
      <div className={styles.ledgerSummary}>
        <div>
          <span>Valid {kind} payments</span>
          <strong>{financialAmount(group.total)}</strong>
        </div>
        {"outstanding" in group && (
          <div>
            <span>{title} outstanding</span>
            <strong>{financialAmount(group.outstanding)}</strong>
          </div>
        )}
      </div>
      {group.outstanding?.startsWith("-") && (
        <p role="status" className={styles.notice}>
          Negative balance: discrepancy or possible overpayment. Review the
          preserved records.
        </p>
      )}
      {!group.records.length ? (
        <div className={styles.empty}>
          <p>No {kind} payments recorded.</p>
        </div>
      ) : (
        <RecordTable label={`${title} payment ledger`}>
          <table className={`live-table ${styles.ledger}`}>
            <caption className="sr-only">{title} payment ledger</caption>
            <thead>
              <tr>
                <th scope="col">Date / status</th>
                <th scope="col">Method / reference</th>
                <th scope="col">Amount (PHP)</th>
                <th scope="col">Manage record</th>
              </tr>
            </thead>
            <tbody>
              {group.records.map((p) => (
                <tr
                  key={p.id}
                  aria-label={`${title} payment ${p.id}`}
                  data-voided={p.voided || undefined}
                >
                  <th scope="row">
                    <PaymentHeading id={p.id} voided={p.voided}>
                      {p.payment_date}
                      {p.voided ? " · Voided" : ""}
                    </PaymentHeading>
                  </th>
                  <td>
                    <p>{p.method}</p>
                    {p.reference && <small>{p.reference}</small>}
                    {p.remarks && <p>{p.remarks}</p>}
                  </td>
                  <td className={styles.number}>{financialAmount(p.amount)}</td>
                  <td>
                    <div className={styles.recordActions}>
                      {f.can_manage_payments && !p.voided && (
                        <>
                          <ContextPanel
                            title={`Correct ${kind} payment`}
                            description={`${p.payment_date} · ${financialAmount(p.amount)}. A correction preserves the original record.`}
                            panelClassName={styles.dialog}
                            guardUnsaved
                            resetOnClose
                          >
                            <FinanceForm
                              rebuild
                              project={project}
                              id={p.id}
                              kind={kind}
                              version={p.version}
                              intent="save"
                              label={`Correct ${kind} payment`}
                              reasonRequired
                            >
                              <AmountFields
                                id={p.id}
                                payment={p}
                                today={f.today}
                              />
                            </FinanceForm>
                          </ContextPanel>
                          <ContextPanel
                            title={`Void ${kind} payment`}
                            description="Voiding excludes the payment from totals while preserving its history. This cannot be reversed."
                            panelClassName={styles.dialog}
                            guardUnsaved
                            resetOnClose
                          >
                            <FinanceForm
                              rebuild
                              project={project}
                              id={p.id}
                              kind={kind}
                              version={p.version}
                              intent="void"
                              label={`Void ${kind} payment`}
                              reasonRequired
                            />
                          </ContextPanel>
                        </>
                      )}
                    </div>
                    <Disclosure title="Payment audit history">
                      <p>Recorded {formatTime(p.created_at)}</p>
                      <Disclosure title="Record reference">
                        <p>
                          Account {p.created_by} · Payment {p.id}
                        </p>
                      </Disclosure>
                      <ol className={styles.history}>
                        {p.history.map((e) => (
                          <li key={e.id}>
                            <strong>{e.action}</strong>
                            <small>{formatTime(e.occurred_at)}</small>
                            <p>{e.reason}</p>
                            <Disclosure title="Preserved values">
                              <p>Account: {e.actor_id}</p>
                              <pre className="history-json">
                                {JSON.stringify(
                                  {
                                    previous: e.previous_value,
                                    current: e.new_value,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </Disclosure>
                          </li>
                        ))}
                      </ol>
                    </Disclosure>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </RecordTable>
      )}
    </section>
  );
}
export function FinancialWorkspace({
  project,
  financials: f,
  admin,
}: {
  project: string;
  financials: Financials;
  admin: boolean;
}) {
  return (
    <div className={styles.workspace}>
      <section
        className={`surface live-form ${styles.financeHeader}`}
        aria-label="Financial summary"
      >
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>PROJECT FINANCIALS</span>
            <h2>Financial summary</h2>
            <p className={styles.muted}>
              PHP · Quotation, commercial values and actual payments
            </p>
          </div>
          <Status>{f.cancelled ? "Project cancelled" : "Live records"}</Status>
        </div>
        {f.cancelled && (
          <p className={styles.notice}>
            New entries and value adjustments are frozen. Authorized historical
            payment corrections remain available.
          </p>
        )}
        <div className={styles.summaryGrid}>
          {"approved_quotation" in f && (
            <div>
              <span>Approved quotation</span>
              {f.approved_quotation ? (
                <>
                  <strong>{financialAmount(f.approved_quotation.total)}</strong>
                  <Link
                    href={`/dashboard/projects/${project}?tab=quotation&version=${f.approved_quotation.id}`}
                  >
                    View version {f.approved_quotation.number}
                  </Link>
                </>
              ) : (
                <strong>Not available</strong>
              )}
            </div>
          )}
          {"quotation_vs_sale" in f && (
            <div>
              <span>Sale − quotation</span>
              <strong>{financialAmount(f.quotation_vs_sale)}</strong>
            </div>
          )}
          {"sale_minus_raw" in f && (
            <div>
              <span>Sale minus Raw</span>
              <strong>{financialAmount(f.sale_minus_raw)}</strong>
              <small>Excludes other expenses and taxes.</small>
            </div>
          )}
        </div>
      </section>
      <div className={styles.values}>
        {f.sale && (
          <Value project={project} kind="Sale" value={f.sale} admin={admin} />
        )}{" "}
        {f.raw && (
          <Value project={project} kind="Raw" value={f.raw} admin={admin} />
        )}
      </div>
      <Ledger
        project={project}
        kind="client"
        group={f.client_payments}
        f={f}
        admin={admin}
      />
      <Ledger
        project={project}
        kind="supplier"
        group={f.supplier_payments}
        f={f}
        admin={admin}
      />
    </div>
  );
}
