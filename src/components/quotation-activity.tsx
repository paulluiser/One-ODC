import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace-session";
import { checkDatabase } from "@/lib/live-data";
import { formatTime } from "@/lib/phase1";
import type { Quotation, QuotationVersionSummary } from "@/lib/quotations";
export async function QuotationActivity({
  project,
  selected,
}: {
  project: string;
  selected?: string;
}) {
  const { client, profile } = await requireWorkspace();
  if (profile.role === "operations_admin") return null;
  const result = await client.rpc("list_quotation_versions", {
    p_project: project,
  });
  checkDatabase(result.error);
  const versions = (result.data ?? []) as QuotationVersionSummary[];
  if (!versions.length) return null;
  const version = selected
    ? versions.find((v) => v.id === selected)
    : versions[0];
  const record = version
    ? await client.rpc("get_quotation_version", {
        p_project: project,
        p_version: version.id,
      })
    : null;
  checkDatabase(record?.error ?? null);
  const quotation = record?.data as Quotation | undefined;
  return (
    <details className="surface live-form" open={!!selected}>
      <summary>Quotation submission and review activity</summary>
      <form method="get" className="live-form">
        <input type="hidden" name="tab" value="activity" />
        <input type="hidden" name="section" value="history" />
        <label className="live-field">
          Quotation version
          <select
            aria-label="Quotation activity version"
            name="quotation_history"
            defaultValue={version?.id ?? ""}
            required
          >
            {!version && <option value="">Choose an accessible version</option>}
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                Version {v.number} · {v.state}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-outline">
          View quotation activity
        </button>
      </form>
      {!version ? (
        <p role="alert">
          This quotation version is not available to your role.
        </p>
      ) : (
        <>
          <p>
            Version {version.number} · {version.state} · Created{" "}
            {formatTime(version.created_at)}
          </p>
          {quotation?.history?.length ? (
            <ol>
              {quotation.history.map((e) => (
                <li key={e.id}>
                  <strong>
                    {e.action.replaceAll("_", " ").replaceAll(".", " ")}
                  </strong>{" "}
                  · {formatTime(e.occurred_at)}
                  {e.remarks && <p>{e.remarks}</p>}
                  <details>
                    <summary>Review event details</summary>
                    <p>
                      Event: {e.id} · Account: {e.actor_id}
                    </p>
                  </details>
                </li>
              ))}
            </ol>
          ) : (
            <p>No submission or review activity for this version.</p>
          )}
          <Link
            href={`/dashboard/projects/${project}?tab=quotation&version=${version.id}`}
          >
            Open quotation version
          </Link>
        </>
      )}
    </details>
  );
}
