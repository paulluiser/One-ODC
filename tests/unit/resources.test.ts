import { expect, it } from "vitest";
import { resourceLinksSchema } from "../../src/lib/resources";
import { chooseOptimized } from "../../src/lib/storage/optimization";
it("accepts multiple stable HTTPS links and rejects credentials, script, malformed and excess URLs", () => {
  const a = {
    id: crypto.randomUUID(),
    url: "https://example.com/resource?q=1#page",
  };
  expect(
    resourceLinksSchema.safeParse([a, { ...a, id: crypto.randomUUID() }])
      .success,
  ).toBe(true);
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
    "https://",
    "https://example.com/space here",
    "https://example.com\\x",
  ])
    expect(resourceLinksSchema.safeParse([{ ...a, url }]).success).toBe(false);
  expect(resourceLinksSchema.safeParse([a, a]).success).toBe(false);
});
it("keeps originals unless same-name/type candidates are smaller and nonempty", () => {
  const original = new File(["original"], "a.pdf", { type: "application/pdf" });
  const small = new File(["tiny"], "a.pdf", { type: "application/pdf" });
  expect(chooseOptimized(original, small, "Validated").savedPercent).toBe(50);
  for (const candidate of [
    null,
    original,
    new File([], "a.pdf", { type: "application/pdf" }),
    new File(["x"], "b.pdf", { type: "application/pdf" }),
  ])
    expect(chooseOptimized(original, candidate, "Fallback").file).toBe(
      original,
    );
});

import { simplePng } from "../../src/lib/storage/optimization";
import { pngFixture } from "../helpers/png-fixture";
it("only losslessly re-encodes simple PNGs and retains metadata/animation-bearing inputs", async () => {
  const bytes = pngFixture();
  expect(
    await simplePng(new File([bytes], "alpha.png", { type: "image/png" })),
  ).toBe(true);
  const changed = Buffer.from(bytes);
  changed.write("acTL", 12, "ascii");
  expect(
    await simplePng(new File([changed], "animated.png", { type: "image/png" })),
  ).toBe(false);
  expect(
    await simplePng(new File(["broken"], "broken.png", { type: "image/png" })),
  ).toBe(false);
});
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
it("PDF validation detects content, annotation and geometry changes and normalizes only transport identifiers", () => {
  const scope: {
    oneOdcPdf?: {
      canonical: (json: unknown) => string;
      signed: (json: unknown) => boolean;
    };
  } = {};
  runInNewContext(readFileSync("public/optimization/pdf-core.js", "utf8"), {
    globalThis: scope,
  });
  const make = (id: number, text: string, width = 612) => ({
    qpdf: [
      {},
      {
        [`obj:${id} 0 R`]: {
          value: {
            "/Type": "/Page",
            "/MediaBox": [0, 0, width, 792],
            "/Rotate": 90,
            "/Annots": [
              { "/Contents": text, "/ID": "annotation-essential-id" },
            ],
          },
        },
        trailer: {
          value: { "/Root": `${id} 0 R`, "/ID": ["transport-id"], "/Size": 2 },
        },
      },
    ],
  });
  const original = make(1, "Preserve this text");
  expect(scope.oneOdcPdf!.canonical(original)).toBe(
    scope.oneOdcPdf!.canonical(make(8, "Preserve this text")),
  );
  expect(scope.oneOdcPdf!.canonical(original)).not.toBe(
    scope.oneOdcPdf!.canonical(make(8, "Lost text")),
  );
  expect(scope.oneOdcPdf!.canonical(original)).not.toBe(
    scope.oneOdcPdf!.canonical(make(8, "Preserve this text", 500)),
  );
  expect(scope.oneOdcPdf!.signed({ qpdf: [{ "/FT": "/Sig" }] })).toBe(true);
});
