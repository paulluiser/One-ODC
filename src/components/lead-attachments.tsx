"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/env";
import { supabaseStorageProvider } from "@/lib/storage/supabase";
import {
  CURRENT_MAX_FILE_BYTES,
  ATTACHMENT_BUCKET,
  type UploadReservation,
  type ResumableTransfer,
} from "@/lib/storage/provider";
import {
  optimizeFile,
  type OptimizationResult,
} from "@/lib/storage/optimization";
import { PendingIndicator } from "./operation-feedback";
import { FileOptimization } from "./file-optimization";
import { Button } from "./ui/button";
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export type StoredAttachment = { id: string; archived_at: string | null };
export type StoredVersion = {
  id: string;
  attachment_id: string;
  object_path: string;
  original_name: string;
  mime_type: string;
  expected_size: number;
  actual_size: number | null;
  ready_at: string | null;
  created_by: string;
  created_at: string;
};
export function LeadAttachments({
  leadId,
  projectId,
  slots,
  editable,
  userId,
  attachments,
  versions,
}: {
  leadId: string;
  projectId?: string;
  slots?: { uploaded: number; reserved: number; remaining: number };
  editable: boolean;
  userId: string;
  attachments: StoredAttachment[];
  versions: StoredVersion[];
}) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const provider = useMemo(() => {
    const config = supabaseConfig();
    return config
      ? supabaseStorageProvider(
          createBrowserClient(config.url, config.key),
          config.url,
          config.key,
        )
      : null;
  }, []);
  const [source, setSource] = useState<File | null>(null);
  const [optimizationResult, setOptimizationResult] =
    useState<OptimizationResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reservation, setReservation] = useState<UploadReservation | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reason, setReason] = useState("");
  const [download, setDownload] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!download) return;
    const expiry = setTimeout(() => setDownload(null), 60000);
    return () => clearTimeout(expiry);
  }, [download]);
  const transfer = useRef<ResumableTransfer | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const selection = useRef(0);
  async function upload(existing?: StoredVersion, replacementOf?: string) {
    if (!provider || !file) {
      setError("Choose the file to upload or resume.");
      return;
    }
    if (file.size < 1 || file.size > CURRENT_MAX_FILE_BYTES) {
      setError("Choose a nonempty file no larger than 50 MiB.");
      return;
    }
    setBusy(true);
    setProgress(0);
    setError("");
    setSuccess("");
    try {
      const current = existing
        ? {
            ...existing,
            bucket: ATTACHMENT_BUCKET,
            max_size: CURRENT_MAX_FILE_BYTES,
          }
        : ((!replacementOf ? reservation : null) ??
          (await provider.reserve({
            association: projectId
              ? { kind: "project", id: projectId }
              : { kind: "lead", id: leadId },
            classification: "general",
            replacementOf,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          })));
      setReservation(current);
      transfer.current = provider.transfer(current, file, (sent, total) =>
        setProgress(Math.round((sent / total) * 100)),
      );
      setUploading(true);
      await transfer.current.start();
      await provider.complete(current.id);
      setSuccess("File uploaded and verified in private storage.");
      setReservation(null);
      setFile(null);
      setSource(null);
      setOptimizationResult(null);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error &&
          error.message.includes("ATTACHMENT_COUNT_LIMIT")
          ? "Three file slots are occupied or reserved. Use Files and Resources links for additional files."
          : "The file was not finalized. Choose the same file and use Retry / resume; if the lead changed or the reservation expired, reload to check access.",
      );
      router.refresh();
    } finally {
      setBusy(false);
      transfer.current = null;
      setUploading(false);
    }
  }
  async function archive(a: StoredAttachment) {
    if (!provider || !reason.trim()) {
      setError("Enter an archive or restore reason.");
      return;
    }
    setBusy(true);
    setDownload(null);
    setError("");
    setSuccess("");
    try {
      await provider.archive(a.id, !a.archived_at, reason);
      setSuccess(
        a.archived_at
          ? "Attachment restored."
          : "Attachment archived; its versions remain stored.",
      );
      setReason("");
      router.refresh();
    } catch {
      setError(
        "The attachment could not be changed. Check access and the three-file limit. Provide additional files through Files and Resources links.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function sign(v: StoredVersion) {
    if (!provider) return;
    setBusy(true);
    setError("");
    setDownload(null);
    try {
      const signed = await provider.signedDownload(v.id);
      setDownload(signed.url);
      setSuccess("Authorized download ready for 60 seconds.");
    } catch {
      setError(
        "Download denied or unavailable. Archived files cannot receive new links.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="surface live-form"
      aria-labelledby="stored-files-heading"
    >
      <h2 id="stored-files-heading">Private attachments</h2>
      <p className="field-hint">
        Saved files are private, with a 50 MiB limit and up to three active
        attachments. Existing metadata-only selections are not uploaded files.
      </p>
      <p role="status">
        {slots?.uploaded ??
          attachments.filter(
            (a) =>
              !a.archived_at &&
              versions.some((v) => v.attachment_id === a.id && v.ready_at),
          ).length}{" "}
        / 3 active uploaded files ·{" "}
        {slots?.reserved ??
          attachments.filter(
            (a) =>
              !a.archived_at &&
              !versions.some((v) => v.attachment_id === a.id && v.ready_at),
          ).length}{" "}
        upload reservations ·{" "}
        {slots?.remaining ??
          Math.max(
            0,
            3 - attachments.filter((a) => !a.archived_at).length,
          )}{" "}
        slots remaining. Provide additional files through Files and Resources
        links.
      </p>
      {editable && (
        <>
          <div className="live-field">
            <label htmlFor="private-file">File to upload or resume</label>
            <input
              ref={input}
              id="private-file"
              type="file"
              disabled={!ready || busy || optimizing}
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                const current = ++selection.current;
                setOptimizationResult(null);
                setSource(selected);
                setFile(null);
                setOptimizing(!!selected);
                setReservation(null);
                if (selected)
                  void optimizeFile(selected, "Lossless", false).then(
                    (result) => {
                      if (selection.current === current) {
                        setOptimizationResult(result);
                        setFile(result.file);
                        setOptimizing(false);
                      }
                    },
                  );
                setError("");
              }}
            />
          </div>
          {optimizing && (
            <p role="status">Preparing file safely before upload…</p>
          )}
          <FileOptimization
            key={`${source?.name}-${source?.lastModified}-${source?.size}`}
            file={source}
            automatic={optimizationResult}
            disabled={!ready || busy || optimizing}
            onPrepared={(prepared, processing) => {
              setFile(prepared);
              setOptimizing(processing);
              setReservation(null);
            }}
          />
          <div className="form-actions">
            <Button
              type="button"
              disabled={
                busy ||
                optimizing ||
                !file ||
                (!reservation &&
                  (slots?.remaining ??
                    Math.max(
                      0,
                      3 - attachments.filter((a) => !a.archived_at).length,
                    )) === 0)
              }
              onClick={() => void upload()}
            >
              {busy
                ? uploading
                  ? "Uploading…"
                  : "Working…"
                : reservation
                  ? "Retry / resume upload"
                  : "Upload file"}
            </Button>
            {busy && uploading && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void transfer.current?.pause()}
              >
                Pause upload
              </Button>
            )}
          </div>
          {busy && uploading && (
            <progress
              max={100}
              value={progress}
              aria-label="Upload progress"
              aria-valuetext={`${progress}% uploaded`}
            />
          )}
          <PendingIndicator
            pending={busy}
            label={uploading ? "Uploading file…" : "Working…"}
          />
          <div className="live-field">
            <label htmlFor="attachment-reason">Archive / restore reason</label>
            <input
              id="attachment-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="form-success">
          {success}
        </p>
      )}
      {download && (
        <a
          className="button button-outline"
          href={download}
          target="_blank"
          rel="noreferrer"
        >
          Download authorized file
        </a>
      )}
      {!attachments.length && (
        <p className="field-hint">No files have been uploaded for this lead.</p>
      )}
      {attachments.map((a) => (
        <article className="history-entry" key={a.id}>
          <h3>{a.archived_at ? "Archived attachment" : "Attachment"}</h3>
          {versions
            .filter((v) => v.attachment_id === a.id)
            .map((v) => (
              <div key={v.id} className="history-entry">
                <p>
                  {v.original_name} ·{" "}
                  {v.ready_at
                    ? `${v.actual_size?.toLocaleString()} bytes · Uploaded`
                    : `${v.expected_size.toLocaleString()} bytes · Upload pending`}
                </p>
                {v.ready_at && !a.archived_at && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void sign(v)}
                  >
                    Get download link
                  </Button>
                )}
                {!v.ready_at &&
                  !a.archived_at &&
                  editable &&
                  v.created_by === userId && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !file}
                      onClick={() => void upload(v)}
                    >
                      Resume selected file
                    </Button>
                  )}
              </div>
            ))}
          {editable &&
            !a.archived_at &&
            versions.some((v) => v.attachment_id === a.id && v.ready_at) && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || optimizing || !file}
                onClick={() => void upload(undefined, a.id)}
              >
                Replace attachment
              </Button>
            )}
          {editable && (
            <Button
              type="button"
              variant="outline"
              disabled={
                busy ||
                (!!a.archived_at &&
                  (slots?.remaining ??
                    Math.max(
                      0,
                      3 - attachments.filter((a) => !a.archived_at).length,
                    )) === 0)
              }
              onClick={() => void archive(a)}
            >
              {a.archived_at ? "Restore attachment" : "Archive attachment"}
            </Button>
          )}
        </article>
      ))}
    </section>
  );
}
