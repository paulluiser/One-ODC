import Link from "next/link";
import { RecordTable } from "./record-table";
import { randomUUID } from "node:crypto";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime } from "@/lib/phase1";
import {
  financialAmount,
  type Financials,
  type FinancialValue,
  type Payment,
  type PaymentGroup,
} from "@/lib/finance";
import { FinanceForm, PaymentHeading } from "./finance-form";
function AmountFields({
  id,
  payment,
  today,
}: {
  id: string;
  payment?: Payment;
  today: string;
}) {
  return (
    <>
      <label className="live-field" htmlFor={`${id}-date`}>
        Payment date
        <input
          id={`${id}-date`}
          name="payment_date"
          type="date"
          max={today}
          defaultValue={payment?.payment_date ?? today}
          required
        />
      </label>
      <label className="live-field" htmlFor={`${id}-amount`}>
        Amount (PHP)
        <input
          id={`${id}-amount`}
          name="amount"
          inputMode="decimal"
          pattern="(0|[1-9][0-9]{0,25})([.][0-9]{1,2})?"
          defaultValue={payment?.amount ?? ""}
          required
        />
      </label>
      <label className="live-field" htmlFor={`${id}-method`}>
        Payment method
        <input
          id={`${id}-method`}
          name="method"
          maxLength={100}
          defaultValue={payment?.method ?? ""}
          required
        />
      </label>
      <label className="live-field" htmlFor={`${id}-ref`}>
        Reference (optional)
        <input
          id={`${id}-ref`}
          name="reference"
          maxLength={200}
          defaultValue={payment?.reference ?? ""}
        />
      </label>
      <label className="live-field span-all" htmlFor={`${id}-remarks`}>
        Remarks (optional)
        <textarea
          id={`${id}-remarks`}
          name="remarks"
          maxLength={2000}
          defaultValue={payment?.remarks ?? ""}
        />
      </label>
    </>
  );
}
function ValueCard({
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
  const fieldId = `${project}-${kind}`;
  return (
    <section
      className="surface live-form financial-value"
      aria-label={`${kind} management`}
    >
      <h2>{kind}</h2>
      <p className="financial-value-amount">
        Current {kind}:{" "}
        <strong>
          {value.amount === null
            ? "Not recorded"
            : financialAmount(value.amount)}
        </strong>
      </p>
      {value.editable && (
        <details>
          <summary>Adjust {kind}</summary>
          <FinanceForm
            project={project}
            id={project}
            kind={kind}
            version={value.version}
            intent="value"
            label={`Save ${kind}`}
            reasonRequired={kind === "Raw" || value.version > 0 || admin}
          >
            <label className="live-field" htmlFor={fieldId}>
              {kind} amount (PHP)
              <input
                id={fieldId}
                name="amount"
                inputMode="decimal"
                pattern="(0|[1-9][0-9]{0,25})([.][0-9]{1,2})?"
                defaultValue={value.amount ?? ""}
                required
              />
            </label>
          </FinanceForm>
        </details>
      )}
      <details>
        <summary>{kind} history</summary>
        {value.history.length ? (
          <ol>
            {value.history.map((e) => (
              <li key={e.id}>
                {formatTime(e.occurred_at)} ·{" "}
                {e.previous_amount === null
                  ? "Not recorded"
                  : financialAmount(e.previous_amount)}{" "}
                → {financialAmount(e.new_amount)}
                <p>{e.reason}</p>
                <p className="field-hint">
                  Account: {e.actor_id} · Revision {e.version}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p>No {kind} history yet.</p>
        )}
      </details>
    </section>
  );
}
function PaymentSection({
  project,
  kind,
  group,
  manage,
  cancelled,
  admin,
  today,
}: {
  project: string;
  kind: "client" | "supplier";
  group: PaymentGroup;
  manage: boolean;
  cancelled: boolean;
  admin: boolean;
  today: string;
}) {
  const title = kind === "client" ? "Client" : "Supplier",
    createId = randomUUID();
  return (
    <section className="surface live-form" aria-label={`${title} payments`}>
      <h2>{title} payments</h2>
      <p className="ledger-total">
        Valid {title.toLowerCase()} payments:{" "}
        <strong>{financialAmount(group.total)}</strong>
      </p>
      {"outstanding" in group && (
        <>
          <p className="balance-row">
            {title} outstanding:{" "}
            <strong>{financialAmount(group.outstanding)}</strong>
          </p>
          {group.outstanding?.startsWith("-") && (
            <p className="form-error">
              Negative balance: discrepancy or possible overpayment. The amount
              has not been clamped to zero.
            </p>
          )}
        </>
      )}
      {manage && !cancelled && (
        <details>
          <summary>Add {kind} payment</summary>
          <FinanceForm
            project={project}
            id={createId}
            kind={kind}
            version={0}
            intent="save"
            label={`Record ${kind} payment`}
            reasonRequired={admin}
          >
            <AmountFields id={createId} today={today} />
          </FinanceForm>
        </details>
      )}
      {!group.records.length && <p>No {kind} payments recorded.</p>}
      {!!group.records.length && (
        <RecordTable label={`${title} payment ledger`}>
          <table className="live-table payment-ledger">
            <thead>
              <tr>
                <th scope="col">Date / status</th>
                <th scope="col">Method / reference</th>
                <th scope="col" className="money-cell">
                  Amount
                </th>
                <th scope="col">Actions / history</th>
              </tr>
            </thead>
            <tbody>
              {group.records.map((p) => (
                <tr key={p.id} aria-label={`${title} payment ${p.id}`}>
                  <th scope="row">
                    <PaymentHeading id={p.id} voided={p.voided}>
                      {p.payment_date}
                      {p.voided ? " · Voided" : ""}
                    </PaymentHeading>
                  </th>
                  <td>
                    <p>
                      {p.method}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                    {p.remarks && <p>{p.remarks}</p>}
                  </td>
                  <td className="money-cell">{financialAmount(p.amount)}</td>
                  <td>
                    {manage && !p.voided && (
                      <details>
                        <summary>Correct or void {kind} payment</summary>
                        <FinanceForm
                          project={project}
                          id={p.id}
                          kind={kind}
                          version={p.version}
                          intent="save"
                          label={`Correct ${kind} payment`}
                          reasonRequired
                        >
                          <AmountFields id={p.id} payment={p} today={today} />
                        </FinanceForm>
                        <FinanceForm
                          project={project}
                          id={p.id}
                          kind={kind}
                          version={p.version}
                          intent="void"
                          label={`Void ${kind} payment`}
                          reasonRequired
                        />
                      </details>
                    )}
                    <details>
                      <summary>Payment audit history</summary>
                      <p className="field-hint">
                        Recorded {formatTime(p.created_at)} · Account{" "}
                        {p.created_by} · Payment {p.id}
                      </p>
                      <ol>
                        {p.history.map((e) => (
                          <li key={e.id}>
                            {formatTime(e.occurred_at)} · {e.action} ·{" "}
                            {e.reason}
                            <p className="field-hint">Account: {e.actor_id}</p>
                            <details>
                              <summary>Preserved values</summary>
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
                            </details>
                          </li>
                        ))}
                      </ol>
                    </details>
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
export async function ProjectFinancials({ project }: { project: string }) {
  const { client, profile } = await requireWorkspace();
  const r = await client.rpc("get_project_financials", { p_project: project });
  checkDatabase(r.error);
  const f = r.data as Financials,
    admin = profile.role === "system_administrator";
  return (
    <>
      <section className="surface live-form financial-summary">
        <h2>Financial summary</h2>
        <p>PHP · Independent quotation, Sale, Raw and actual payments.</p>
        {f.cancelled && (
          <p>
            Project cancelled. New records and value adjustments are frozen;
            authorized historical payment corrections remain available.
          </p>
        )}
        <div className="financial-summary-breakdown">
          {"approved_quotation" in f && (
            <p>
              <span>Latest approved quotation:</span>{" "}
              {f.approved_quotation ? (
                <Link
                  href={`/dashboard/projects/${project}?tab=quotation&version=${f.approved_quotation.id}`}
                >
                  Version {f.approved_quotation.number} ·{" "}
                  {financialAmount(f.approved_quotation.total)}
                </Link>
              ) : (
                "Not available"
              )}
            </p>
          )}
          {"quotation_vs_sale" in f && (
            <p>
              <span>Quotation vs Sale (Sale − quotation):</span>{" "}
              <strong>{financialAmount(f.quotation_vs_sale)}</strong>
            </p>
          )}
          {"sale_minus_raw" in f && (
            <p>
              <span>Sale minus Raw:</span>{" "}
              <strong>{financialAmount(f.sale_minus_raw)}</strong>
            </p>
          )}
        </div>
        {"sale_minus_raw" in f && (
          <p className="field-hint">
            Sale minus Raw does not account for other expenses or taxes.
          </p>
        )}
      </section>
      <div className="financial-values">
        {f.sale && (
          <ValueCard
            project={project}
            kind="Sale"
            value={f.sale}
            admin={admin}
          />
        )}
        {f.raw && (
          <ValueCard project={project} kind="Raw" value={f.raw} admin={admin} />
        )}
      </div>
      <PaymentSection
        project={project}
        kind="client"
        group={f.client_payments}
        manage={f.can_manage_payments}
        cancelled={f.cancelled}
        admin={admin}
        today={f.today}
      />
      <PaymentSection
        project={project}
        kind="supplier"
        group={f.supplier_payments}
        manage={f.can_manage_payments}
        cancelled={f.cancelled}
        admin={admin}
        today={f.today}
      />
    </>
  );
}
