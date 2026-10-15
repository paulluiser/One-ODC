import type { SupabaseClient } from "@supabase/supabase-js";
import { Upload } from "tus-js-client";
import {
  ATTACHMENT_BUCKET,
  resumableEndpoint,
  type StorageProvider,
  type UploadReservation,
} from "./provider";

// Caller supplies the current user's Supabase client. No privileged key is required.
export function supabaseStorageProvider(
  client: SupabaseClient,
  projectUrl: string,
  publishableKey: string,
): StorageProvider {
  return {
    async reserve(input) {
      if (!input.replacementOf) {
        const slots = await client.rpc("get_attachment_slots", {
          p_lead:
            input.association.kind === "lead" ? input.association.id : null,
          p_project:
            input.association.kind === "project" ? input.association.id : null,
        });
        if (slots.error) throw new Error(slots.error.message);
        if (!slots.data || slots.data.remaining < 1)
          throw new Error(
            "ATTACHMENT_COUNT_LIMIT: Use Files and Resources links for additional files.",
          );
      }
      const { data, error } = await client.rpc("reserve_attachment", {
        p_attachment: input.replacementOf ?? null,
        p_lead: input.association.kind === "lead" ? input.association.id : null,
        p_project:
          input.association.kind === "project" ? input.association.id : null,
        p_class: input.classification,
        p_name: input.name,
        p_mime: input.mimeType,
        p_size: input.size,
      });
      if (error) throw new Error(error.message);
      return data as UploadReservation;
    },
    transfer(reservation, file, onProgress) {
      if (
        reservation.bucket !== ATTACHMENT_BUCKET ||
        file.size !== reservation.expected_size ||
        file.size > reservation.max_size ||
        file.size < 1 ||
        file.name !== reservation.original_name ||
        (file.type || "application/octet-stream") !== reservation.mime_type
      )
        throw new Error("File does not match its upload reservation.");
      let upload: Upload | undefined;
      let running = false;
      let cancel: (() => void) | undefined;
      let generation = 0;
      return {
        async start() {
          if (running) throw new Error("Upload is already running.");
          running = true;
          const current = ++generation;
          try {
            await new Promise<void>((resolve, reject) => {
              cancel = () =>
                reject(
                  new Error(
                    "Upload paused. Resume with the same reservation and file.",
                  ),
                );
              upload = new Upload(file, {
                endpoint: resumableEndpoint(projectUrl),
                chunkSize: 6 * 1024 * 1024,
                retryDelays: [0, 3000, 5000, 10000, 20000],
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true,
                headers: { apikey: publishableKey },
                metadata: {
                  bucketName: ATTACHMENT_BUCKET,
                  objectName: reservation.object_path,
                  contentType: reservation.mime_type,
                  cacheControl: "0",
                },
                fingerprint: async () =>
                  `one-odc:${new URL(projectUrl).host}:${reservation.id}:${file.size}:${file.lastModified}`,
                async onBeforeRequest(request) {
                  // Forward the raw token; Storage validates it and enforces RLS.
                  const { data, error } = await client.auth.getSession();
                  if (error || !data.session)
                    throw new Error("Sign in again to resume your upload.");
                  request.setHeader(
                    "Authorization",
                    `Bearer ${data.session.access_token}`,
                  );
                },
                onProgress,
                onError: () =>
                  reject(
                    new Error(
                      "Upload interrupted. Retry with the same reservation and file to resume.",
                    ),
                  ),
                onSuccess: () => resolve(),
              });
              const activeUpload = upload;
              void activeUpload
                .findPreviousUploads()
                .then((previous) => {
                  if (current !== generation) return;
                  if (previous.length)
                    activeUpload.resumeFromPreviousUpload(previous[0]);
                  activeUpload.start();
                })
                .catch(() =>
                  reject(new Error("Could not restore upload progress.")),
                );
            });
          } finally {
            running = false;
          }
        },
        async pause() {
          generation++;
          const pauseCurrent = cancel;
          pauseCurrent?.();
          await upload?.abort(false);
        },
      };
    },
    async complete(versionId) {
      const { error } = await client.rpc("complete_attachment", {
        p_version: versionId,
      });
      if (error) throw new Error(error.message);
    },
    async signedDownload(versionId) {
      const { data: version, error } = await client
        .from("attachment_versions")
        .select("object_path,ready_at,attachment_id")
        .eq("id", versionId)
        .single();
      if (error || !version?.ready_at) throw new Error("File is unavailable.");
      const { error: audit } = await client.rpc("record_attachment_download", {
        p_version: versionId,
      });
      if (audit) throw new Error("File access could not be recorded.");
      const expiresIn = 60;
      const signed = await client.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(version.object_path, expiresIn, { download: true });
      if (signed.error) throw new Error("File access was denied.");
      return { url: signed.data.signedUrl, expiresIn };
    },
    async archive(id, archived, reason) {
      const { error } = await client.rpc("archive_attachment", {
        p_id: id,
        p_archive: archived,
        p_reason: reason,
      });
      if (error) throw new Error(error.message);
    },
  };
}
