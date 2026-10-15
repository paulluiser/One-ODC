export function pdfFixture(
  kind: "vector" | "scanned" | "signed" = "vector",
): Uint8Array {
  const content =
    kind === "scanned"
      ? "q 200 0 0 200 0 0 cm /Im1 Do Q\n"
      : "0 0 m 100 100 l S\n".repeat(5000) +
        "BT /F1 12 Tf 10 10 Td (One ODC test) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /CropBox [0 0 600 780] /Rotate 90 /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 7 0 R >> >> /Contents 4 0 R /Annots [6 0 R] >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    kind === "signed"
      ? "<< /Type /Annot /Subtype /Widget /FT /Sig /V << /Type /Sig /ByteRange [0 1 2 3] /Contents <0000> >> /Rect [10 10 20 20] >>"
      : "<< /Type /Annot /Subtype /Text /Rect [10 10 20 20] /Contents (Preserve this note) >>",
    "<< /Type /XObject /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 10000 >>\nstream\n" +
      "A".repeat(10000) +
      "\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
