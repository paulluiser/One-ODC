export type OptimizationMode = "Lossless" | "Balanced";
export type OptimizationResult = {
  file: File;
  originalSize: number;
  optimizedSize: number;
  savedPercent: number;
  message: string;
};
export function chooseOptimized(
  original: File,
  candidate: File | null,
  message: string,
): OptimizationResult {
  const file =
    candidate &&
    candidate.size > 0 &&
    candidate.size < original.size &&
    candidate.name === original.name &&
    candidate.type === original.type
      ? candidate
      : original;
  return {
    file,
    originalSize: original.size,
    optimizedSize: file.size,
    savedPercent: Math.round((1 - file.size / original.size) * 1000) / 10,
    message: file === original ? `${message} Original retained.` : message,
  };
}
// Only simple, untagged, non-animated PNGs can be losslessly re-encoded by canvas.
export async function simplePng(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (
    bytes.length < 8 ||
    [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v)
  )
    return false;
  const view = new DataView(bytes.buffer);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset),
      type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    if (
      !["IHDR", "IDAT", "IEND"].includes(type) ||
      offset + length + 12 > bytes.length
    )
      return false;
    offset += length + 12;
    if (type === "IEND") return offset === bytes.length;
  }
  return false;
}
async function optimizePng(file: File): Promise<OptimizationResult> {
  if (file.size > 16 * 1024 * 1024 || !(await simplePng(file)))
    return chooseOptimized(
      file,
      null,
      "PNG metadata/animation or size requires original preservation.",
    );
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 16000000)
      return chooseOptimized(
        file,
        null,
        "PNG exceeds lossless pixel-validation budget.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    const original = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    ).data;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob || blob.size >= file.size)
      return chooseOptimized(file, null, "PNG already compressed effectively.");
    const candidate = await createImageBitmap(blob);
    try {
      if (
        candidate.width !== bitmap.width ||
        candidate.height !== bitmap.height
      )
        throw new Error("Dimensions changed");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(candidate, 0, 0);
      const decoded = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      if (original.some((value, i) => decoded[i] !== value))
        throw new Error("Pixel/alpha validation failed");
    } finally {
      candidate.close();
    }
    return chooseOptimized(
      file,
      new File([blob], file.name, {
        type: file.type,
        lastModified: file.lastModified,
      }),
      "PNG lossless pixel/alpha comparison passed; dimensions preserved.",
    );
  } finally {
    bitmap.close();
  }
}
export async function optimizeFile(
  file: File,
  mode: OptimizationMode,
  photograph: boolean,
): Promise<OptimizationResult> {
  try {
    if (file.type === "application/pdf") {
      if (file.size > 16 * 1024 * 1024)
        return chooseOptimized(
          file,
          null,
          "PDF exceeds the 16 MiB browser optimization budget.",
        );
      const worker = new Worker("/optimization/pdf-worker.js");
      const result = await new Promise<{ bytes?: Uint8Array; message: string }>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            worker.terminate();
            reject(new Error("Optimization timed out"));
          }, 30000);
          worker.onmessage = (e) => {
            clearTimeout(timer);
            worker.terminate();
            resolve(e.data);
          };
          worker.onerror = () => {
            clearTimeout(timer);
            worker.terminate();
            reject(new Error("Worker unavailable"));
          };
          void file
            .arrayBuffer()
            .then((bytes) => worker.postMessage({ bytes, mode }, [bytes]))
            .catch(reject);
        },
      );
      return chooseOptimized(
        file,
        result.bytes
          ? new File([new Uint8Array(result.bytes)], file.name, {
              type: file.type,
              lastModified: file.lastModified,
            })
          : null,
        result.message,
      );
    }
    if (file.type === "image/png") return await optimizePng(file);
    // Lossless is the default: drawing/text/transparency/metadata safety wins over size.
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !photograph
    )
      return chooseOptimized(
        file,
        null,
        "Lossless/drawing-safe mode: image pixels and metadata preserved.",
      );
    if (file.size > 16 * 1024 * 1024)
      return chooseOptimized(
        file,
        null,
        "Image exceeds browser processing budget.",
      );
    // Canvas would discard metadata/ICC/animation; only opt-in photographs are candidates.
    if (file.type !== "image/jpeg")
      return chooseOptimized(
        file,
        null,
        "PNG/WebP transparency, animation and metadata preserved; original retained.",
      );
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    try {
      if (bitmap.width * bitmap.height > 40000000)
        return chooseOptimized(file, null, "Image exceeds pixel budget.");
      const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
      if (scale === 1)
        return chooseOptimized(
          file,
          null,
          "Photograph already within conservative dimensions.",
        );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      return chooseOptimized(
        file,
        blob
          ? new File([blob], file.name, {
              type: file.type,
              lastModified: file.lastModified,
            })
          : null,
        "Opt-in photograph resized to at most 2560 px, JPEG quality 90%; orientation applied. Metadata removed.",
      );
    } finally {
      bitmap.close();
    }
  } catch {
    return chooseOptimized(
      file,
      null,
      "Optimization unavailable or failed safely.",
    );
  }
}
