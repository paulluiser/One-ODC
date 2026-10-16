import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const css = readFileSync(
  new URL("../../src/app/opulence-theme.css", import.meta.url),
  "utf8",
);
const tokens = (block: string) =>
  Object.fromEntries(
    [...block.matchAll(/--brand-([\w-]+):\s*(#[\da-f]+);/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
const light = tokens(
  css.slice(0, css.indexOf('html[data-one-odc-brand="opulence"].dark')),
);
const dark = {
  ...light,
  ...tokens(
    css.slice(
      css.indexOf('html[data-one-odc-brand="opulence"].dark'),
      css.indexOf('html[data-one-odc-brand="opulence"] ::selection'),
    ),
  ),
};
function luminance(hex: string) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? [...c].map((x) => x + x).join("") : c;
  const rgb = full
    .match(/../g)!
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
it("keeps Opulence normal text and primary labels AA in both themes", () => {
  for (const theme of [light, dark]) {
    for (const surface of [
      "canvas",
      "surface",
      "soft",
      "lilac",
      "peach",
      "green",
    ]) {
      for (const foreground of ["text", "muted"])
        expect(
          contrast(theme[foreground], theme[surface]),
          `${foreground} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(theme.link, theme.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme["on-primary"], theme.primary)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(theme["on-primary"], theme["primary-hover"]),
    ).toBeGreaterThanOrEqual(4.5);
    for (const semantic of ["success", "warning", "destructive", "info"])
      expect(
        contrast(theme[semantic], theme[`${semantic}-soft`]),
      ).toBeGreaterThanOrEqual(4.5);
  }
});
it("keeps relevant controls, focus indicators and chart marks distinguishable", () => {
  for (const theme of [light, dark]) {
    for (const surface of ["canvas", "surface", "soft"]) {
      for (const indicator of ["input", "focus", "primary-border"])
        expect(
          contrast(theme[indicator], theme[surface]),
          `${indicator} against ${surface}`,
        ).toBeGreaterThanOrEqual(3);
    }
    for (const series of [
      "chart-1",
      "chart-2",
      "chart-3",
      "chart-4",
      "chart-5",
    ])
      expect(
        contrast(theme[series], theme.soft),
        series,
      ).toBeGreaterThanOrEqual(3);
    expect(new Set([1, 2, 3, 4, 5].map((i) => theme[`chart-${i}`])).size).toBe(
      5,
    );
  }
});
