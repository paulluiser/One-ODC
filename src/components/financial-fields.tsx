import type { Payment } from "../lib/finance";
export function AmountFields({
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
