import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resumableEndpoint,
  type UploadReservation,
} from "../../src/lib/storage/provider";
import { supabaseStorageProvider } from "../../src/lib/storage/supabase";
const fakeTus = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  resumed: vi.fn(),
  started: vi.fn(),
  previousGate: null as Promise<{ uploadUrl: string }[]> | null,
}));
vi.mock("tus-js-client", () => ({
  Upload: class {
    constructor(_file: File, options: Record<string, unknown>) {
      fakeTus.options = options;
    }
    async findPreviousUploads() {
      return (
        fakeTus.previousGate ?? [{ uploadUrl: "https://storage.test/resume" }]
      );
    }
    resumeFromPreviousUpload = fakeTus.resumed;
    start() {
      fakeTus.started();
      (fakeTus.options?.onSuccess as () => void)();
    }
    async abort() {}
  },
}));
const reservation: UploadReservation = {
  id: "version",
  attachment_id: "attachment",
  object_path: "projects/project/attachments/attachment/versions/version",
  original_name: "plan.pdf",
  mime_type: "application/pdf",
  expected_size: 4,
  bucket: "one-odc-attachments",
  max_size: 52428800,
};
describe("Supabase storage provider", () => {
  it("uses the direct Storage TUS endpoint and supports a local endpoint", () => {
    expect(resumableEndpoint("https://qflmicucvbjfrjtndjgu.supabase.co")).toBe(
      "https://qflmicucvbjfrjtndjgu.storage.supabase.co/storage/v1/upload/resumable",
    );
    expect(resumableEndpoint("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/storage/v1/upload/resumable",
    );
  });
  it("resumes the same reserved path with six MiB chunks and no overwrite header", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "test-token" } },
      error: null,
    });
    const client = { auth: { getSession } } as unknown as SupabaseClient;
    const provider = supabaseStorageProvider(
      client,
      "https://project.supabase.co",
      "publishable",
    );
    const file = new File(["test"], "plan.pdf", { type: "application/pdf" });
    await provider.transfer(reservation, file).start();
    const options = fakeTus.options!;
    expect(options.chunkSize).toBe(6 * 1024 * 1024);
    expect(options.headers).toEqual({ apikey: "publishable" });
    expect(options.metadata).toMatchObject({
      objectName: reservation.object_path,
      bucketName: reservation.bucket,
    });
    expect(fakeTus.resumed).toHaveBeenCalled();
    const setHeader = vi.fn();
    await (options.onBeforeRequest as (r: unknown) => Promise<void>)({
      setHeader,
    });
    expect(setHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer test-token",
    );
    expect(getSession).toHaveBeenCalledOnce();
  });
  it("rejects mismatched files before starting the transfer", () => {
    const provider = supabaseStorageProvider(
      {} as SupabaseClient,
      "https://project.supabase.co",
      "publishable",
    );
    expect(() =>
      provider.transfer(
        reservation,
        new File(["wrong-size"], "plan.pdf", { type: "application/pdf" }),
      ),
    ).toThrow("does not match");
  });
  it("never marks an upload complete when PostgreSQL cannot verify the object", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ error: { message: "STORAGE_OBJECT_NOT_VERIFIED" } });
    const provider = supabaseStorageProvider(
      { rpc } as unknown as SupabaseClient,
      "https://project.supabase.co",
      "publishable",
    );
    await expect(provider.complete("version")).rejects.toThrow(
      "STORAGE_OBJECT_NOT_VERIFIED",
    );
  });
  it("pausing while resume lookup is pending never restarts the aborted transfer", async () => {
    let release!: (value: { uploadUrl: string }[]) => void;
    fakeTus.previousGate = new Promise((resolve) => {
      release = resolve;
    });
    const provider = supabaseStorageProvider(
      {} as SupabaseClient,
      "https://project.supabase.co",
      "publishable",
    );
    const transfer = provider.transfer(
      reservation,
      new File(["test"], "plan.pdf", { type: "application/pdf" }),
    );
    const before = fakeTus.started.mock.calls.length;
    const operation = transfer.start();
    const rejected = expect(operation).rejects.toThrow("Upload paused");
    await transfer.pause();
    await rejected;
    release([{ uploadUrl: "https://storage.test/resume" }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(fakeTus.started.mock.calls.length).toBe(before);
    fakeTus.previousGate = null;
  });
});

it("application provider refuses new uploads when all three slots are reserved or occupied", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: { uploaded: 2, reserved: 1, remaining: 0 },
    error: null,
  });
  const provider = supabaseStorageProvider(
    { rpc } as unknown as SupabaseClient,
    "https://project.supabase.co",
    "publishable",
  );
  await expect(
    provider.reserve({
      association: { kind: "project", id: "project" },
      classification: "general",
      name: "new.txt",
      mimeType: "text/plain",
      size: 4,
    }),
  ).rejects.toThrow("ATTACHMENT_COUNT_LIMIT");
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc.mock.calls[0][0]).toBe("get_attachment_slots");
});
it("replacement reaches the authoritative reservation endpoint without consuming a new slot", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: reservation, error: null });
  const provider = supabaseStorageProvider(
    { rpc } as unknown as SupabaseClient,
    "https://project.supabase.co",
    "publishable",
  );
  await provider.reserve({
    association: { kind: "project", id: "project" },
    classification: "general",
    name: "plan.pdf",
    mimeType: "application/pdf",
    size: 4,
    replacementOf: "attachment",
  });
  expect(rpc).toHaveBeenCalledWith(
    "reserve_attachment",
    expect.objectContaining({ p_attachment: "attachment" }),
  );
  expect(rpc).toHaveBeenCalledOnce();
});
