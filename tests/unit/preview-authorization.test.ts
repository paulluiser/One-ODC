import { it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseStorageProvider } from "../../src/lib/storage/supabase";
function fixture(mime = "image/png", readDenied = false, auditDenied = false) {
  const single = vi.fn().mockResolvedValue(
    readDenied
      ? { data: null, error: { message: "Denied" } }
      : {
          data: {
            ready_at: "2026-10-16",
            object_path: "private/fixture",
            mime_type: mime,
          },
          error: null,
        },
  );
  const rpc = vi
    .fn()
    .mockResolvedValue({ error: auditDenied ? { message: "Denied" } : null });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://unit.invalid/private-fixture" },
    error: null,
  });
  const c = {
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
    rpc,
    storage: { from: () => ({ createSignedUrl }) },
  };
  return {
    provider: supabaseStorageProvider(
      c as unknown as SupabaseClient,
      "https://unit.invalid",
      "public-fixture",
    ),
    rpc,
    createSignedUrl,
  };
}
it("authorizes and audits before issuing a short-lived inline preview URL", async () => {
  const f = fixture();
  expect(await f.provider.signedPreview("fixture")).toMatchObject({
    expiresIn: 60,
    mimeType: "image/png",
  });
  expect(f.rpc).toHaveBeenCalledWith("record_attachment_download", {
    p_version: "fixture",
  });
  expect(f.createSignedUrl).toHaveBeenCalledWith(
    "private/fixture",
    60,
    undefined,
  );
  expect(f.rpc.mock.invocationCallOrder[0]).toBeLessThan(
    f.createSignedUrl.mock.invocationCallOrder[0],
  );
});
it("does not sign unauthorized, archived/audit-denied or executable-format previews", async () => {
  for (const f of [
    fixture("image/png", true),
    fixture("application/pdf", false, true),
    fixture("text/html"),
    fixture("image/svg+xml"),
  ]) {
    await expect(f.provider.signedPreview("fixture")).rejects.toThrow();
    expect(f.createSignedUrl).not.toHaveBeenCalled();
  }
});
it("preserves forced original downloads", async () => {
  const f = fixture("application/octet-stream");
  await f.provider.signedDownload("fixture");
  expect(f.createSignedUrl).toHaveBeenCalledWith("private/fixture", 60, {
    download: true,
  });
});
