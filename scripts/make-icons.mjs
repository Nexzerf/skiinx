// Generates the PWA icons (pink background + white bottle) as PNGs with no image library.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

function png(size, { maskable = false, badge = false } = {}) {
  const px = Buffer.alloc(size * (size * 4 + 1));
  const s = size / 512;
  const pad = maskable ? 0.1 : 0; // keep artwork inside the maskable safe zone
  const sc = (v) => (v - 256) * (1 - pad * 2) + 256;
  const inRect = (x, y, x0, y0, x1, y1, r) => {
    const cx = Math.max(x0 + r, Math.min(x, x1 - r)), cy = Math.max(y0 + r, Math.min(y, y1 - r));
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const X = x / s, Y = y / s;
      // background: rounded square (full bleed for maskable)
      const bg = badge || maskable || inRect(X, Y, 0, 0, 512, 512, 110);
      // bottle: body + neck + pump
      const body = inRect(X, Y, sc(166), sc(210), sc(346), sc(430), 48 * (1 - pad * 2));
      const neck = inRect(X, Y, sc(216), sc(150), sc(296), sc(220), 10);
      const pump = inRect(X, Y, sc(236), sc(96), sc(276), sc(160), 8) || inRect(X, Y, sc(236), sc(96), sc(330), sc(122), 8);
      const heart = (() => {
        const hx = (X - sc(256)) / (60 * (1 - pad * 2)), hy = -(Y - sc(318)) / (60 * (1 - pad * 2));
        return (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy ** 3 <= 0;
      })();
      let c = [0, 0, 0, 0];
      if (bg && !badge) c = [251, 113, 133, 255]; // rose-400
      if (bg && (body || neck || pump)) c = [255, 255, 255, 255];
      if (bg && body && heart) c = badge ? [0, 0, 0, 0] : [251, 113, 133, 255];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(px)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", png(192));
writeFileSync("public/icons/icon-512.png", png(512));
writeFileSync("public/icons/maskable-512.png", png(512, { maskable: true }));
writeFileSync("public/icons/apple-touch-icon.png", png(180, { maskable: true }));
writeFileSync("public/icons/badge-96.png", png(96, { maskable: true, badge: true })); // Android status-bar badge: white on transparent
console.log("icons written");
