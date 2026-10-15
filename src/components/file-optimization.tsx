"use client";
import { useRef, useState } from "react";
import {
  optimizeFile,
  chooseOptimized,
  type OptimizationMode,
  type OptimizationResult,
} from "@/lib/storage/optimization";
export function FileOptimization({
  file,
  disabled,
  automatic,
  onPrepared,
}: {
  file: File | null;
  automatic?: OptimizationResult | null;
  disabled: boolean;
  onPrepared: (file: File | null, processing: boolean) => void;
}) {
  const [mode, setMode] = useState<OptimizationMode>("Lossless"),
    [photo, setPhoto] = useState(false),
    [result, setResult] = useState<OptimizationResult | null>(null),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const shown = result ?? automatic;
  async function prepare() {
    if (!file) return;
    const current = ++generation.current;
    setBusy(true);
    onPrepared(null, true);
    const optimized = await optimizeFile(file, mode, photo);
    if (current !== generation.current) return;
    setResult(optimized);
    setBusy(false);
    onPrepared(optimized.file, false);
  }
  return (
    <div className="live-form">
      <label className="live-field">
        PDF optimization mode
        <select
          value={mode}
          disabled={disabled || busy}
          onChange={(e) => setMode(e.target.value as OptimizationMode)}
        >
          <option>Lossless</option>
          <option>Balanced</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={photo}
          disabled={disabled || busy}
          onChange={(e) => setPhoto(e.target.checked)}
        />
        This is a photograph; allow conservative resizing and metadata removal.
        Leave unchecked for drawings or text.
      </label>
      <p className="field-hint">
        PDFs are never rasterized. Balanced uses lossless processing when image
        recompression cannot be validated. PNG/WebP and measurement drawings
        retain originals. Browser PDF processing budget: 16 MiB; upload cap
        remains 50 MiB.
      </p>
      <button
        type="button"
        className="button button-outline"
        onClick={() => void prepare()}
        disabled={disabled || busy || !file}
      >
        {busy ? "Optimizing…" : "Optimize selected file"}
      </button>
      <button
        type="button"
        className="button button-outline"
        disabled={disabled || busy || !file}
        onClick={() => {
          setResult(
            file ? chooseOptimized(file, null, "Original selected.") : null,
          );
          onPrepared(file, false);
        }}
      >
        Use original file
      </button>
      {busy && (
        <p role="status">Optimization in progress; upload has not started.</p>
      )}
      {shown && (
        <p role="status">
          Original: {shown.originalSize.toLocaleString()} bytes · Optimized:{" "}
          {shown.optimizedSize.toLocaleString()} bytes · Saved:{" "}
          {shown.savedPercent}% · {shown.message}
        </p>
      )}
    </div>
  );
}
