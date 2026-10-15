import { expect, test } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pdfFixture } from "../helpers/pdf-fixtures";
test("3E browser QPDF reduces vector/scanned fixtures with preservation checks and bypasses signed/malformed PDFs", async ({
  page,
}) => {
  await page.goto("/login");
  const results = [];
  for (const kind of [
    "vector",
    "scanned",
    "signed",
    "encrypted",
    "malformed",
  ] as const) {
    const input =
      kind === "encrypted"
        ? new Uint8Array(
            readFileSync("tests/fixtures/optimization-encrypted.pdf"),
          )
        : kind === "malformed"
          ? new TextEncoder().encode("broken PDF")
          : pdfFixture(kind);
    const result = await page.evaluate(
      async ({ bytes, mode }) => {
        const worker = new Worker("/optimization/pdf-worker.js");
        return await new Promise<{ size: number; message: string }>(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              worker.terminate();
              reject(new Error("PDF worker timed out"));
            }, 30000);
            worker.onerror = () => {
              clearTimeout(timeout);
              worker.terminate();
              reject(new Error("PDF worker failed"));
            };
            worker.onmessage = (e) => {
              clearTimeout(timeout);
              worker.terminate();
              resolve({
                size: e.data.bytes?.length ?? 0,
                message: e.data.message,
              });
            };
            worker.postMessage({ bytes: new Uint8Array(bytes).buffer, mode });
          },
        );
      },
      { bytes: [...input], mode: kind === "scanned" ? "Balanced" : "Lossless" },
    );
    if (kind === "vector" || kind === "scanned") {
      expect(result.size).toBeGreaterThan(0);
      expect(result.size).toBeLessThan(input.length);
      expect(result.message).toContain("Validated lossless");
    } else {
      expect(result.size).toBe(0);
      expect(result.message).toContain("original retained");
    }
    results.push({
      kind,
      original: input.length,
      optimized: result.size,
      message: result.message,
    });
  }
  mkdirSync("artifacts/verification", { recursive: true });
  writeFileSync(
    "artifacts/verification/phase3e-compression.json",
    JSON.stringify({ fixtures: results }, null, 2) + "\n",
  );
  await test.info().attach("safe-synthetic-pdf-results", {
    body: JSON.stringify(results),
    contentType: "application/json",
  });
});
