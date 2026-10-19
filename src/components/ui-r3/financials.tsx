"use client";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Plus, X } from "lucide-react";
import {
  financialAmount,
  canManagePayment,
  type Financials,
  type Payment,
  type PaymentGroup,
} from "@/lib/finance";
import {
  FinancialActionDialog,
  type FinancialAction,
} from "../financial-action-dialog";

import { directoryDate } from "@/lib/project-directory-view";
import styles from "../financial-workspace.module.css";
function PaymentStatus({ voided }: { voided: boolean }) {
  return (
    <span className={styles.paymentStatus} data-voided={voided || undefined}>
      {voided ? "Voided" : "Posted"}
    </span>
  );
}
export function FinancialWorkspace({
  project,
  projectName = "Project",
  financials: f,
  admin,
  names = {},
}: {
  project: string;
  projectName?: string;
  financials: Financials;
  admin: boolean;
  names?: Record<string, string>;
}) {
  const [action, setAction] = useState<FinancialAction | null>(null),
    [notice, setNotice] = useState("");
  const path = usePathname(),
    query = useSearchParams(),
    router = useRouter(),
    rowFocus = useRef<string | null>(null);
  const all = [...f.client_payments.records, ...f.supplier_payments.records];
  const selected = all.find((p) => p.id === query.get("payment_detail"));
  const url = (id: string | null) => {
    const next = new URLSearchParams(query.toString());
    if (id) next.set("payment_detail", id);
    else next.delete("payment_detail");
    return `${path}?${next}`;
  };
  const history = (id: string) =>
    `/dashboard/projects/${project}?tab=activity&section=history&finance_history=${id}#financial-history`;
  const close = () => {
    rowFocus.current = selected?.id ?? null;
    router.push(url(null), { scroll: false });
  };
  const recorder = (p: Payment) => names[p.created_by] ?? "Name unavailable";
  const details = (p: Payment) => (
    <Link
      href={url(p.id)}
      scroll={false}
      data-payment-id={p.id}
      className={styles.recordLink}
      aria-label={`View ${p.kind} payment ${p.payment_date} ${financialAmount(p.amount)}`}
    >
      <span className="sr-only">View payment</span>
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  );
  const ledger = (kind: "client" | "supplier", group: PaymentGroup) => (
    <section
      className={`surface ${styles.section}`}
      aria-label={`${kind === "client" ? "Client" : "Supplier"} payments`}
    >
      <header className={styles.sectionHeader}>
        <div>
          <h2>{kind === "client" ? "Client" : "Supplier"} payments</h2>
          <p>
            {kind === "client"
              ? "Client receipts to ODC"
              : "ODC payments to suppliers / manufacturers"}{" "}
            · PHP
          </p>
        </div>
        {!f.cancelled &&
          (canManagePayment(f, kind) ||
            (kind === "client" && f.can_record_client_payments)) && (
            <button
              className="button button-primary"
              onClick={() => setAction({ kind })}
            >
              <Plus size={16} aria-hidden="true" />
              Add {kind} payment
            </button>
          )}
      </header>
      <div className={styles.totals}>
        <div>
          <small>Valid {kind} payments</small>
          <strong>{financialAmount(group.total)}</strong>
        </div>
        {"outstanding" in group && (
          <div>
            <small>
              {kind === "client" ? "Client" : "Supplier"} outstanding
            </small>
            <strong>{financialAmount(group.outstanding)}</strong>
          </div>
        )}
      </div>
      {group.outstanding?.startsWith("-") && (
        <p role="status" className={styles.warning}>
          Negative balance: review for a discrepancy or possible overpayment.
        </p>
      )}
      {!group.records.length ? (
        <p className={styles.empty}>No {kind} payments recorded.</p>
      ) : (
        <>
          <div
            className={styles.tableScroll}
            role="region"
            aria-label={`${kind} payment directory`}
          >
            <table className={styles.table}>
              <caption className="sr-only">{kind} payments</caption>
              <thead>
                <tr>
                  {[
                    "Date",
                    "Method / Reference",
                    "Amount (PHP)",
                    "Status",
                    "Recorded by",
                    "Details",
                  ].map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.records.map((p) => (
                  <tr key={p.id} data-voided={p.voided || undefined}>
                    <td>{directoryDate(p.payment_date)}</td>
                    <td>
                      <span>{p.method}</span>
                      {p.reference && <small>{p.reference}</small>}
                    </td>
                    <td className={styles.money}>
                      {financialAmount(p.amount)}
                    </td>
                    <td>
                      <PaymentStatus voided={p.voided} />
                    </td>
                    <td>{recorder(p)}</td>
                    <td>{details(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.mobileRecords}>
            {group.records.map((p) => (
              <article key={p.id}>
                <div>
                  <strong>{financialAmount(p.amount)}</strong>
                  <PaymentStatus voided={p.voided} />
                  {details(p)}
                </div>
                <span>
                  {directoryDate(p.payment_date)} · {p.method}
                </span>
                {p.reference && <small>{p.reference}</small>}
                <small>Recorded by {recorder(p)}</small>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
  return (
    <div className={styles.workspace}>
      <section
        className={`surface ${styles.section}`}
        aria-label="Financial summary"
      >
        <header className={styles.sectionHeader}>
          <div>
            <h2>Financial summary</h2>
            <p>PHP · Commercial values and recorded payments</p>
          </div>
        </header>
        {f.cancelled && (
          <p className={styles.warning}>
            New records and adjustments are frozen. Authorized historical
            payment corrections remain available.
          </p>
        )}
        <div className={styles.summary}>
          {"approved_quotation" in f && (
            <div>
              <small>Approved Quotation</small>
              <strong>{financialAmount(f.approved_quotation?.total)}</strong>
              {f.approved_quotation && (
                <Link
                  href={`/dashboard/projects/${project}?tab=quotation&version=${f.approved_quotation.id}`}
                >
                  View version {f.approved_quotation.number}
                </Link>
              )}
            </div>
          )}
          {f.sale && (
            <div>
              <small>Sale</small>
              <strong>{financialAmount(f.sale.amount)}</strong>
            </div>
          )}
          {f.raw && (
            <div>
              <small>Raw Cost</small>
              <strong>{financialAmount(f.raw.amount)}</strong>
            </div>
          )}
          {"sale_minus_raw" in f && (
            <div>
              <small>Gross Difference</small>
              <strong>{financialAmount(f.sale_minus_raw)}</strong>
              <small>Sale − Raw; excludes other expenses and taxes.</small>
            </div>
          )}
        </div>
      </section>
      {(f.sale || f.raw) && (
        <section
          className={`surface ${styles.section}`}
          aria-label="Commercial values"
        >
          <header className={styles.sectionHeader}>
            <h2>Commercial Values</h2>
          </header>
          {(["Sale", "Raw"] as const).map((kind) => {
            const value = kind === "Sale" ? f.sale : f.raw;
            return (
              value && (
                <div className={styles.valueRow} key={kind}>
                  <strong>{kind}</strong>
                  <span>{financialAmount(value.amount)}</span>
                  <Link href={history(kind)}>View history</Link>
                  {value.editable && (
                    <button
                      className="button button-outline"
                      onClick={() => setAction({ kind, value })}
                    >
                      Adjust {kind}
                    </button>
                  )}
                </div>
              )
            );
          })}
        </section>
      )}
      {query.has("payment_detail") && !selected && (
        <p role="alert" className={styles.error}>
          This payment is unavailable to your account.{" "}
          <Link href={url(null)} scroll={false}>
            Return to the payment directory
          </Link>
        </p>
      )}
      {notice && (
        <p role="status" className={styles.success}>
          {notice}
        </p>
      )}
      {ledger("client", f.client_payments)}
      {ledger("supplier", f.supplier_payments)}
      {selected && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className={styles.sheetOverlay} />
            <Dialog.Content
              className={styles.sheet}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                requestAnimationFrame(() => {
                  Array.from(
                    document.querySelectorAll<HTMLElement>(
                      `a[data-payment-id="${rowFocus.current ?? selected.id}"]`,
                    ),
                  )
                    .find((el) => el.getClientRects().length)
                    ?.focus({ preventScroll: true });
                });
              }}
            >
              <header className={styles.modalHeader}>
                <div>
                  <Dialog.Title>
                    {selected.kind === "client" ? "Client" : "Supplier"} payment
                  </Dialog.Title>
                  <Dialog.Description>
                    Recorded payment details
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  className={styles.close}
                  aria-label="Close payment details"
                >
                  <X size={20} />
                </Dialog.Close>
              </header>
              <div className={styles.sheetBody}>
                <div className={styles.paymentAmount}>
                  <strong>{financialAmount(selected.amount)}</strong>
                  <PaymentStatus voided={selected.voided} />
                </div>
                <dl className={styles.description}>
                  {[
                    ["Payment date", directoryDate(selected.payment_date)],
                    ["Method", selected.method],
                    ["Reference", selected.reference || "Not provided"],
                    ["Remarks", selected.remarks || "Not provided"],
                    ["Recorded by", recorder(selected)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <Link href={history(selected.id)}>
                  View Payment History in Activity →
                </Link>
              </div>
              <footer className={styles.sheetFooter}>
                {canManagePayment(f, selected.kind) && !selected.voided && (
                  <>
                    <button
                      className="button button-outline"
                      onClick={() =>
                        setAction({ kind: selected.kind, payment: selected })
                      }
                    >
                      Correct payment
                    </button>
                    <button
                      className={`button button-outline ${styles.dangerOutline}`}
                      onClick={() =>
                        setAction({
                          kind: selected.kind,
                          payment: selected,
                          void: true,
                        })
                      }
                    >
                      Void payment
                    </button>
                  </>
                )}
                <button className="button button-outline" onClick={close}>
                  Close
                </button>
              </footer>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {action && (
        <FinancialActionDialog
          project={project}
          projectName={projectName}
          today={f.today}
          admin={admin}
          action={action}
          onClose={() => {
            setAction(null);
          }}
          onSaved={() =>
            setNotice("Financial record saved. Totals and history updated.")
          }
          key={
            "value" in action
              ? action.kind
              : (action.payment?.id ?? `new-${action.kind}`)
          }
        />
      )}
    </div>
  );
}
