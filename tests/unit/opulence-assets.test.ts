import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
const root = new URL("../../public/brand/opulence/", import.meta.url);
it("preserves all six supplied vector assets without scripts, external resources or reconstructed text", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("asset-manifest.json", root), "utf8"),
  ) as { assets: Record<string, string> };
  expect(Object.keys(manifest.assets)).toHaveLength(6);
  for (const [file, hash] of Object.entries(manifest.assets)) {
    const data = readFileSync(new URL(file, root));
    expect(createHash("sha256").update(data).digest("hex")).toBe(hash);
    const svg = data.toString();
    expect(svg).toContain('viewBox="0 0');
    expect(svg).not.toMatch(
      /<script\b|<foreignObject\b|<text\b|(?:href|src)=["']https?:/i,
    );
    expect(svg).toContain("#D6A23F");
  }
});
it("display wordmarks only trim empty SVG canvas, preserving every supplied vector path", () => {
  for (const theme of ["light", "dark"]) {
    const source = readFileSync(
      new URL(`one-odc-logo-${theme}.svg`, root),
      "utf8",
    );
    const display = readFileSync(
      new URL(`display/one-odc-logo-${theme}.svg`, root),
      "utf8",
    );
    expect(
      display.replace(
        'viewBox="19.85 14.85 596.62 185.31"',
        'viewBox="0 0 1010 220"',
      ),
    ).toBe(source);
  }
});
