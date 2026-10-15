import { LoaderCircle } from "lucide-react";
export function OperationFeedback({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  return (
    <div className="operation-feedback">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="form-success" role="status">
          {success}
        </p>
      )}
    </div>
  );
}
export function PendingIndicator({
  pending,
  label = "Saving changes…",
}: {
  pending: boolean;
  label?: string;
}) {
  return (
    <span className="operation-pending" role="status" aria-live="polite">
      {pending && (
        <>
          <LoaderCircle size={16} className="spin" aria-hidden="true" />
          {label}
        </>
      )}
    </span>
  );
}
