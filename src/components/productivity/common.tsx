"use client";
import { useState } from "react";
import { serializeCsv } from "@/lib/productivity";
export async function productivityRequest<T>(
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const post =
    !!params.action &&
    ["remember", "saveTemplate", "applyTemplate", "comment"].includes(
      String(params.action),
    );
  const url =
    "/api/productivity" +
    (post
      ? ""
      : "?" +
        new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v != null)
            .map(([k, v]) => [k, String(v)]),
        ));
  let response: Response;
  try {
    response = await fetch(url, {
      method: post ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      ...(post
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
          }
        : {}),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw Error(
      "Connection interrupted. Your entries are kept. Check your connection; reload the record before retrying a save.",
    );
  }
  if (response.redirected || response.status === 401)
    throw Error(
      "Your session expired. Sign in again; keep this page open to preserve your entries.",
    );
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error(
      "The service is temporarily unavailable. Keep this page open to preserve your entries, then retry loading.",
    );
  }
  if (!response.ok)
    throw Error(data.error || "The request could not be confirmed.");
  return data as T;
}
export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return message ? (
    <div role="alert">
      <p className="form-error">{message}</p>
      {retry && (
        <button className="button button-outline" type="button" onClick={retry}>
          Retry loading
        </button>
      )}
      {/session expired/.test(message) && (
        <a className="text-link" href="/login" target="_blank" rel="noreferrer">
          Sign in in a new tab
        </a>
      )}
    </div>
  ) : null;
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CsvExport({
  kind,
  project,
  headers,
  rows,
  label = "Export CSV",
}: {
  kind?: string;
  project?: string;
  headers?: string[];
  rows?: unknown[][];
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function run() {
    setBusy(true);
    setMessage("");
    try {
      if (headers && rows) {
        if (!rows.length) throw Error("No records to export.");
        saveBlob(
          new Blob([serializeCsv(headers, rows)], {
            type: "text/csv;charset=utf-8",
          }),
          "one-odc-payments.csv",
        );
        setMessage("Visible authorized records exported.");
      } else {
        const params = new URLSearchParams(location.search);
        params.set("action", "export");
        params.set("kind", kind || "projects");
        if (project) params.set("project", project);
        const r = await fetch("/api/productivity?" + params, {
          cache: "no-store",
        });
        if (r.redirected) throw Error("Your session expired. Sign in again.");
        if (!r.ok) {
          const d = await r.json();
          throw Error(d.error || "Export unavailable.");
        }
        saveBlob(
          await r.blob(),
          `one-odc-${kind}-page-${params.get("page") || 1}.csv`,
        );
        setMessage(r.headers.get("X-Export-Scope") || "Export ready.");
      }
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Export failed. Retry after checking your connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        className="button button-outline"
        type="button"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? "Exporting…" : label}
      </button>
      {message && (
        <p role="status" className="field-hint">
          {message}
        </p>
      )}
    </div>
  );
}
