"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/env";
import { supabaseStorageProvider } from "@/lib/storage/supabase";
import { ErrorNotice } from "./common";
import styles from "./productivity.module.css";
const subscribe = () => () => {};
export function FilePreview({ id, name }: { id: string; name: string }) {
  const enabled = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.oneOdcBrand === "opulence",
    () => false,
  );
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(""),
    [download, setDownload] = useState(""),
    [mime, setMime] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [expires, setExpires] = useState(0),
    [zoom, setZoom] = useState(100),
    [downloadBusy, setDownloadBusy] = useState(false);
  useEffect(() => {
    if (!open || !expires) return;
    const timer = setTimeout(
      () => {
        setUrl("");
        setDownload("");
        setError(
          "The private preview link expired. Refresh to verify access again.",
        );
      },
      Math.max(0, expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [open, expires]);
  function provider() {
    const c = supabaseConfig();
    if (!c) throw Error("File storage is unavailable.");
    return supabaseStorageProvider(
      createBrowserClient(c.url, c.key),
      c.url,
      c.key,
    );
  }
  async function preview() {
    setBusy(true);
    setError("");
    setUrl("");
    setDownload("");
    try {
      const r = await provider().signedPreview(id);
      setMime(r.mimeType);
      setUrl(r.url);
      setExpires(Date.now() + (r.expiresIn - 5) * 1000);
      setLoading(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function original() {
    setDownloadBusy(true);
    setError("");
    try {
      const r = await provider().signedDownload(id);
      setDownload(r.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloadBusy(false);
    }
  }
  if (!enabled) return null;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void preview();
        else {
          setUrl("");
          setDownload("");
          setExpires(0);
          setError("");
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button type="button" className="button button-outline">
          Preview {name}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`detail-dialog ${styles.dialog}`}
          aria-describedby={undefined}
        >
          <div className={styles.row}>
            <Dialog.Title>{name}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="button button-outline">
                Close preview
              </button>
            </Dialog.Close>
          </div>
          <div className={styles.viewer}>
            <div className={styles.row}>
              <button
                className="button button-outline"
                type="button"
                disabled={busy}
                onClick={() => void preview()}
              >
                Refresh preview
              </button>
              <button
                className="button button-outline"
                type="button"
                disabled={downloadBusy}
                onClick={() => void original()}
              >
                Download Original
              </button>
              {mime.startsWith("image/") && (
                <label>
                  Zoom
                  <select
                    aria-label="Preview zoom"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  >
                    <option value={100}>Fit to width</option>
                    <option value={125}>125%</option>
                    <option value={175}>175%</option>
                  </select>
                </label>
              )}
            </div>
            {download && (
              <a
                className="text-link"
                href={download}
                target="_blank"
                rel="noreferrer"
              >
                Open authorized original (60 seconds)
              </a>
            )}
            <ErrorNotice message={error} retry={() => void preview()} />
            {(busy || (loading && url)) && (
              <p role="status">Loading authorized preview…</p>
            )}
            {url && (
              <div className={styles.previewCanvas}>
                {mime === "application/pdf" ? (
                  <iframe
                    title={`PDF preview: ${name}`}
                    src={url + "#view=FitH"}
                    referrerPolicy="no-referrer"
                    onLoad={() => setLoading(false)}
                  />
                ) : (
                  <img
                    src={url}
                    alt={name}
                    style={{ width: `${zoom}%`, maxWidth: "none" }}
                    onLoad={() => setLoading(false)}
                    onError={() => {
                      setLoading(false);
                      setError(
                        "Preview could not be loaded. Refresh the private link or download the original.",
                      );
                      setUrl("");
                    }}
                  />
                )}
              </div>
            )}
            <p className="field-hint">
              Private links expire shortly. PDF display and zoom depend on your
              browser; Download Original remains available. Files are never sent
              to an external viewer.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
