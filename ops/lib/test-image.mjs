import zlib from "node:zlib";

/**
 * Tiny PNG writer + 5×7 digit font.
 *
 * The OCR regression test needs a *real* image containing machine-written text
 * that a vision model can read, without pulling in an image library. Digits only
 * — enough to build a small table ("1200000 12"), which is exactly the shape of
 * the "đưa data trong ảnh thành Excel" case.
 */

const FONT = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
};

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** width/height in pixels; `pixels(y, x)` returns true for black. */
function png(width, height, pixels) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter: none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const value = pixels(y, x) ? 0 : 255;
      raw[offset] = value;
      raw[offset + 1] = value;
      raw[offset + 2] = value;
      offset += 3;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Renders lines of digits as a white PNG with black text. */
export function digitTablePng(lines, { scale = 6, padding = 24, lineGap = 10 } = {}) {
  const glyphWidth = 5 * scale + scale; // 5 columns + 1 space between glyphs
  const widest = Math.max(...lines.map((line) => line.length));
  const width = padding * 2 + widest * glyphWidth;
  const height = padding * 2 + lines.length * (7 * scale) + (lines.length - 1) * lineGap;
  const glyphs = lines.map((line) => [...line].map((char) => FONT[char] ?? FONT[" "]));

  const pixels = (y, x) => {
    const relativeY = y - padding;
    if (relativeY < 0) return false;
    const lineIndex = Math.floor(relativeY / (7 * scale + lineGap));
    if (lineIndex < 0 || lineIndex >= glyphs.length) return false;
    const inLine = relativeY - lineIndex * (7 * scale + lineGap);
    if (inLine >= 7 * scale) return false;
    const row = Math.floor(inLine / scale);
    const relativeX = x - padding;
    if (relativeX < 0) return false;
    const charIndex = Math.floor(relativeX / glyphWidth);
    const inChar = relativeX - charIndex * glyphWidth;
    if (inChar >= 5 * scale) return false;
    const column = Math.floor(inChar / scale);
    const glyph = glyphs[lineIndex][charIndex];
    return glyph ? glyph[row][column] === "1" : false;
  };

  return png(width, height, pixels);
}
