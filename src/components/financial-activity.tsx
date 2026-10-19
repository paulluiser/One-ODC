import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { financialAmount, type Financials, type Payment } from "@/lib/finance";
import { formatTime } from "@/lib/phase1";
function snapshot(value: unknown) {
  if (!value || typeof value !== "object") return "Not recorded";
  const v = value as Partial<Payment>;
  return (
    [
      v.amount !== undefined ? financialAmount(v.amount) : null,
      v.payment_date,
      v.method,
      v.reference,
      v.remarks,
      v.voided ? "Voided" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Not recorded"
  );
}
export async function FinancialActivity({
  project,
  selected,
}: {
  project: string;
  selected?: string;
}) {
  const { client, profile } = await requireWorkspace();
  if (profile.role === "designer") return null;
  const r = await client.rpc("get_project_financials", { p_project: project });
  checkDatabase(r.error);
  const f = r.data as Financials;
  const payments = [
    ...f.client_payments.records,
    ...f.supplier_payments.records,
  ].filter((p) => !selected || selected === p.id);
  const values = (
    [
      ["Sale", f.sale],
      ["Raw", f.raw],
    ] as const
  ).filter(([kind, v]) => !!v && (!selected || selected === kind));
  return (
    <section
      id="financial-history"
      className="surface live-form"
      aria-label="Financial activity"
    >
      <h2>Financial activity</h2>
      <p>
        Preserved commercial adjustments and payment history visible to your
        role.
      </p>
      {selected && !payments.length && !values.length && (
        <p role="alert">
          This financial record is unavailable to your account.
        </p>
      )}
      {values.map(([kind, v]) => (
        <section key={kind}>
          <h3>{kind} adjustments</h3>
          {!v?.history.length && <p>No adjustments recorded.</p>}
          <ol>
            {v?.history.map((e) => (
              <li key={e.id}>
                <strong>
                  {financialAmount(e.previous_amount)} →{" "}
                  {financialAmount(e.new_amount)}
                </strong>
                <p>
                  {formatTime(e.occurred_at)} · {e.reason || "Initial entry"}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {payments.map((p) => (
        <section key={p.id}>
          <h3>
            {p.kind === "client" ? "Client" : "Supplier"} payment ·{" "}
            {p.payment_date} · {financialAmount(p.amount)}
            {p.voided ? " · Voided" : ""}
          </h3>
          <ol>
            {p.history.map((e) => (
              <li key={e.id}>
                <strong>
                  {e.action.replaceAll("_", " ").replaceAll(".", " ")}
                </strong>
                <p>
                  {formatTime(e.occurred_at)} · {e.reason || "Initial entry"}
                </p>
                <p>Previous: {snapshot(e.previous_value)}</p>
                <p>Saved: {snapshot(e.new_value)}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {!selected &&
        !payments.length &&
        !values.some(([, v]) => v?.history.length) && (
          <p>No financial history recorded.</p>
        )}
      <Link
        href={`/dashboard/projects/${project}?tab=financials&section=finance${payments.length === 1 ? `&payment_detail=${payments[0].id}` : ""}`}
      >
        Return to Financial Management
      </Link>
    </section>
  );
}
