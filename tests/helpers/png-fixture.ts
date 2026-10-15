import { deflateSync } from "node:zlib";
function crc(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
export function pngFixture() {
  const chunk = (type: string, data: Buffer) => {
    const tag = Buffer.from(type),
      header = Buffer.alloc(4),
      footer = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    footer.writeUInt32BE(crc(Buffer.concat([tag, data])));
    return Buffer.concat([header, tag, data, footer]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(100);
  header.writeUInt32BE(100, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(100 * 401);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      const p = y * 401 + 1 + x * 4;
      pixels[p] = 100;
      pixels[p + 1] = 50;
      pixels[p + 2] = 0;
      pixels[p + 3] = x % 2 ? 128 : 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels, { level: 0 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
