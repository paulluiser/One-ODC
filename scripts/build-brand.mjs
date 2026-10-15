import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

const directory = path.resolve("public/brand");
fs.mkdirSync(directory, { recursive: true });
const font = (weight) => {
  const bytes = fs.readFileSync(
    path.resolve(
      `node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff`,
    ),
  );
  return opentype.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
};
const regular = font(400);
const semibold = font(600);
const symbol = (color) =>
  `<g fill="none" stroke="${color}" stroke-width="5"><rect x="10" y="10" width="44" height="44" rx="12"/><path d="m26 28 7-6v22m-7 0h14" stroke-linecap="square"/></g>`;
const svg = (body, width, height, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title"><title id="title">${title}</title>${body}</svg>`;
// Plain Latin logo artwork does not need complex text shaping. Export individual
// glyph outlines with their advances and kerning, bypassing unsupported GSUB tables.
const outline = (text, font, x, y, size, tracking = 0) => {
  const glyphs = [...text].map((character) => font.charToGlyph(character));
  let cursor = x;
  let data = "";
  glyphs.forEach((glyph, index) => {
    data += glyph.getPath(cursor, y, size).toPathData(3);
    cursor += (glyph.advanceWidth / font.unitsPerEm) * size + tracking;
    if (index + 1 < glyphs.length)
      cursor +=
        (font.getKerningValue(glyph, glyphs[index + 1]) / font.unitsPerEm) *
        size;
  });
  return { data, width: cursor - x };
};
const lettering = (color, endorsement = true) => {
  const x = 81;
  const one = outline("One", regular, x, 47, 43);
  const odc = outline("ODC", semibold, x + one.width + 10, 47, 43);
  const line = outline("OPULENCE DESIGN CONCEPT", regular, x + 1, 64, 7.4, 1.1);
  return `<g fill="${color}"><path d="${one.data}"/><path d="${odc.data}"/>${endorsement ? `<path opacity=".7" d="${line.data}"/>` : ""}</g>`;
};
fs.writeFileSync(
  `${directory}/one-odc-symbol.svg`,
  svg(symbol("#14233D"), 64, 64, "One ODC symbol"),
);
fs.writeFileSync(
  `${directory}/one-odc-symbol-white.svg`,
  svg(symbol("#FFFFFF"), 64, 64, "One ODC reverse symbol"),
);
fs.writeFileSync(
  `${directory}/one-odc-icon.svg`,
  svg(
    `<rect width="64" height="64" rx="14" fill="#2663D8"/>${symbol("#FFFFFF")}`,
    64,
    64,
    "One ODC app icon",
  ),
);
for (const [name, color] of [
  ["navy", "#14233D"],
  ["white", "#FFFFFF"],
]) {
  fs.writeFileSync(
    `${directory}/one-odc-wordmark-${name}.svg`,
    svg(
      symbol(color) + lettering(color),
      318,
      76,
      "One ODC — Opulence Design Concept",
    ),
  );
}
fs.writeFileSync(
  `${directory}/architectural-pattern.svg`,
  svg(
    `<g fill="none" stroke="#B49A6A" stroke-width="1"><path d="M130 900V340a320 320 0 0 1 640 0v560M180 900V340a270 270 0 0 1 540 0v560M230 900V340a220 220 0 0 1 440 0v560M280 900V340a170 170 0 0 1 340 0v560"/><path opacity=".5" d="M0 820h900M0 770h900M0 720h900M450 0v900"/></g>`,
    900,
    900,
    "One ODC architectural line pattern",
  ),
);
const colors = {
  deepBlue: "#2663D8",
  deepNavy: "#14233D",
  lightCanvas: "#F7F9FC",
  lightSurface: "#FFFFFF",
  darkCanvas: "#101722",
  darkSurface: "#1B2533",
  mineral: "#EDE8DF",
  brass: "#B49A6A",
};
fs.writeFileSync(
  `${directory}/tokens.json`,
  JSON.stringify(
    {
      name: "One ODC",
      descriptor: "The project workspace for Opulence Design Concept",
      tagline: "Every space. One vision.",
      colors,
      typography: { family: "Inter", weights: [400, 500, 600, 700] },
      radius: { control: 7, surface: 10 },
      themes: {
        light: {
          background: colors.lightCanvas,
          surface: colors.lightSurface,
          text: colors.deepNavy,
          muted: "#647187",
          primary: colors.deepBlue,
          onPrimary: "#FFFFFF",
          link: colors.deepBlue,
          focus: colors.deepBlue,
        },
        dark: {
          background: colors.darkCanvas,
          surface: colors.darkSurface,
          text: "#EDF2FA",
          muted: "#A5B2C6",
          primary: colors.deepBlue,
          onPrimary: "#FFFFFF",
          link: "#A7C8FF",
          focus: "#92B9FF",
        },
      },
    },
    null,
    2,
  ) + "\n",
);
fs.mkdirSync("public/branding/fonts", { recursive: true });
for (const weight of [400, 500, 600, 700])
  fs.copyFileSync(
    `node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff2`,
    `public/branding/fonts/inter-${weight}.woff2`,
  );
fs.copyFileSync(
  "node_modules/@fontsource/inter/LICENSE",
  `${directory}/INTER-LICENSE.txt`,
);
console.log("Exported original vector identity and tokens to public/brand.");
