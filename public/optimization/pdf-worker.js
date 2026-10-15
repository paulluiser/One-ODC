/* Local worker: no file bytes leave the browser. QPDF 12.2 / wasm package 0.3.0. */
importScripts("/optimization/vendor/qpdf.js", "/optimization/pdf-core.js");
self.onmessage = async ({ data }) => {
  try {
    const q = await Module({
      locateFile: () => "/optimization/vendor/qpdf.wasm",
    });
    q.FS.writeFile("/input.pdf", new Uint8Array(data.bytes));
    const run = (args) => {
      if (q.callMain(args) !== 0)
        throw new Error("PDF validation warning or error");
    };
    const inspect = (file, out) => {
      run([
        file,
        "--json=2",
        "--json-stream-data=inline",
        "--decode-level=generalized",
        out,
      ]);
      const content = q.FS.readFile(out);
      if (content.length > 64 * 1024 * 1024)
        throw new Error("PDF graph too large");
      return JSON.parse(new TextDecoder().decode(content));
    };
    const before = inspect("/input.pdf", "/before.json");
    if (before.encrypt?.encrypted || oneOdcPdf.signed(before))
      throw new Error("Signed or encrypted PDF: original retained");
    const graph = oneOdcPdf.canonical(before);
    run([
      "/input.pdf",
      "--object-streams=generate",
      "--compress-streams=y",
      "--recompress-flate",
      "--compression-level=9",
      "--deterministic-id",
      "/output.pdf",
    ]);
    run(["/output.pdf", "--check"]);
    const after = inspect("/output.pdf", "/after.json");
    if (
      graph !== oneOdcPdf.canonical(after) ||
      before.pages.length !== after.pages.length
    )
      throw new Error("PDF preservation validation failed");
    const bytes = q.FS.readFile("/output.pdf");
    self.postMessage({
      bytes,
      message:
        data.mode === "Balanced"
          ? "Validated lossless optimization. Embedded-image recompression bypassed for preservation."
          : "Validated lossless PDF optimization.",
    });
  } catch {
    self.postMessage({
      message:
        "PDF could not be safely optimized; original retained. Signed, encrypted, complex or already compressed documents may bypass optimization.",
    });
  }
};
