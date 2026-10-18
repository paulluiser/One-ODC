"use client";
export async function productivityRequest<T>(
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const post =
    !!params.action &&
    [
      "remember",
      "saveTemplate",
      "applyTemplate",
      "comment",
      "readDiscussion",
    ].includes(String(params.action));
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
