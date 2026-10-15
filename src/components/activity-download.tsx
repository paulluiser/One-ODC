"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/env";
import { supabaseStorageProvider } from "@/lib/storage/supabase";
export function ActivityDownload({ id, name }: { id: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function download() {
    setPending(true);
    setUrl(null);
    setError("");
    try {
      const config = supabaseConfig();
      if (!config) throw new Error();
      const client = createBrowserClient(config.url, config.key);
      const signed = await supabaseStorageProvider(
        client,
        config.url,
        config.key,
      ).signedDownload(id);
      setUrl(signed.url);
    } catch {
      setError(
        "The file is unavailable or access was denied. Retry after checking permissions.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button
        className="button button-outline"
        disabled={pending}
        type="button"
        onClick={download}
      >
        {pending ? "Authorizing…" : `Download ${name}`}
      </button>
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          Authorized file link (60 seconds)
        </a>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
