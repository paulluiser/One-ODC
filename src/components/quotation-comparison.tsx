import {
  compareQuotations,
  formatPHP,
  formatDelta,
  type Quotation,
} from "@/lib/quotations";
import { RecordTable } from "./record-table";
export function QuotationComparison({
  before,
  after,
}: {
  before: Quotation;
  after: Quotation;
}) {
  const diff = compareQuotations(before, after);
  return (
    <section
      className="surface live-form quotation-comparison"
      aria-label="Quotation version comparison"
    >
      <h2>
        Version {before.number} → Version {after.number}
      </h2>
      <div className="financial-metrics">
        <div>
          <span>Before · Version {before.number}</span>
          <strong>{formatPHP(before.total)}</strong>
        </div>
        <div>
          <span>After · Version {after.number}</span>
          <strong>{formatPHP(after.total)}</strong>
        </div>
        <div>
          <span>Difference</span>
          <strong>{formatDelta(diff.totalDelta)}</strong>
        </div>
      </div>
      <h3>Space subtotal differences</h3>
      {diff.spaces.length ? (
        <RecordTable label="Space subtotal comparison">
          <table className="live-table money-table">
            <caption className="sr-only">
              Historical Space subtotal differences
            </caption>
            <thead>
              <tr>
                <th scope="col">Space</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
                <th scope="col">Difference</th>
              </tr>
            </thead>
            <tbody>
              {diff.spaces.map((s) => (
                <tr key={s.id}>
                  <th scope="row">
                    {s.after?.name ?? s.before?.name}
                    <details>
                      <summary>Space reference</summary>
                      {s.id}
                      {s.before?.name !== s.after?.name && (
                        <p>
                          {s.before?.name ?? "New space"} →{" "}
                          {s.after?.name ?? "Removed space"}
                        </p>
                      )}
                    </details>
                  </th>
                  <td>{formatPHP(s.before?.subtotal ?? "0")}</td>
                  <td>{formatPHP(s.after?.subtotal ?? "0")}</td>
                  <td>{formatDelta(s.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </RecordTable>
      ) : (
        <p>No space subtotal differences.</p>
      )}
      {(
        [
          ["Added", diff.added],
          ["Removed", diff.removed],
        ] as const
      ).map(([label, items]) => (
        <section key={label}>
          <h3>
            {label} items ({items.length})
          </h3>
          {items.length > 0 && (
            <RecordTable label={`${label} quotation items`}>
              <table className="live-table money-table">
                <thead>
                  <tr>
                    <th scope="col">Space / item</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Unit price</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <th scope="row">
                        {i.description}
                        <span className="cell-secondary">{i.space_name}</span>
                      </th>
                      <td>{i.quantity}</td>
                      <td>{formatPHP(i.unit_price)}</td>
                      <td>{formatPHP(i.line_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </RecordTable>
          )}
        </section>
      ))}
      <h3>Changed items ({diff.changed.length})</h3>
      {diff.changed.map((c) => (
        <section className="comparison-item" key={c.after.id}>
          <h4>
            {c.after.space_name} · {c.after.description}
          </h4>
          <RecordTable label={`Changes to ${c.after.description}`}>
            <table className="live-table money-table">
              <thead>
                <tr>
                  <th scope="col">Changed field</th>
                  <th scope="col">Before</th>
                  <th scope="col">After</th>
                </tr>
              </thead>
              <tbody>
                {c.description && (
                  <tr>
                    <th scope="row">Description</th>
                    <td>{c.before.description}</td>
                    <td>{c.after.description}</td>
                  </tr>
                )}
                {c.quantity && (
                  <tr>
                    <th scope="row">Quantity</th>
                    <td>{c.before.quantity}</td>
                    <td>{c.after.quantity}</td>
                  </tr>
                )}
                {c.price && (
                  <tr>
                    <th scope="row">Unit price</th>
                    <td>{formatPHP(c.before.unit_price)}</td>
                    <td>{formatPHP(c.after.unit_price)}</td>
                  </tr>
                )}
                <tr>
                  <th scope="row">Line amount</th>
                  <td>{formatPHP(c.before.line_amount)}</td>
                  <td>{formatPHP(c.after.line_amount)}</td>
                </tr>
              </tbody>
            </table>
          </RecordTable>
        </section>
      ))}
      {!diff.added.length && !diff.removed.length && !diff.changed.length && (
        <p>No item changes.</p>
      )}
    </section>
  );
}
