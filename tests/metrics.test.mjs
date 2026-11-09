// On-device skin metrics: colour maths, blob counting and shine on synthetic images.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePixels, convexHull, countSpots, deltas, mergeBlobs, poseFromMatrix, qualityWarnings, rgbToLab, sharpness, shrink, whiteBalanceGains } from "../lib/skinMetrics.js";

const near = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("sRGB → Lab reference values", () => {
  const w = rgbToLab(255, 255, 255);
  near(w[0], 100); near(w[1], 0); near(w[2], 0);
  const r = rgbToLab(255, 0, 0);
  near(r[0], 53.24); near(r[1], 80.09); near(r[2], 67.2);
  const k = rgbToLab(0, 0, 0);
  near(k[0], 0);
});

function image(w, h, fill) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fill(x, y);
    const o = (y * w + x) * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  }
  return { data, width: w, height: h };
}
const SKIN = [224, 178, 152];
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// four skin regions + nose laid out on a 200×200 "face"
const POLYS = {
  forehead: rect(40, 10, 160, 50),
  leftCheek: rect(20, 80, 80, 140),
  rightCheek: rect(120, 80, 180, 140),
  chin: rect(70, 160, 130, 195),
  nose: rect(85, 60, 115, 120),
};

test("uniform skin → no spots, no shine", () => {
  const m = analyzePixels(image(200, 200, () => SKIN), POLYS, 200);
  assert.equal(m.spots.total, 0);
  assert.equal(m.oil, 0);
  assert.ok(m.redness.mean > 5 && m.redness.mean < 20);
});

test("red dots on a cheek are counted as spots", () => {
  const dots = [[35, 95], [55, 120], [70, 100]];
  const img = image(200, 200, (x, y) => (dots.some(([dx, dy]) => (x - dx) ** 2 + (y - dy) ** 2 <= 9) ? [205, 95, 95] : SKIN));
  const m = analyzePixels(img, POLYS, 200);
  assert.equal(m.spots.leftCheek, 3);
  assert.equal(m.spots.rightCheek, 0);
  assert.equal(m.spots.total, 3);
});

test("redder skin → higher a*", () => {
  const calm = analyzePixels(image(200, 200, () => SKIN), POLYS, 200);
  const red = analyzePixels(image(200, 200, () => [230, 160, 140]), POLYS, 200);
  assert.ok(red.redness.mean > calm.redness.mean + 3);
  assert.ok(deltas(red, calm).redness > 3);
});

test("specular highlights in the T-zone → shine %", () => {
  const img = image(200, 200, (x, y) => (x >= 90 && x < 110 && y >= 20 && y < 40 ? [250, 248, 246] : SKIN));
  const m = analyzePixels(img, POLYS, 200);
  assert.ok(m.oil > 3 && m.oil < 15, `oil=${m.oil}`);
});

test("hull + shrink keep the polygon inside", () => {
  const h = convexHull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]);
  assert.equal(h.length, 4);
  const s = shrink(h, 0.5);
  for (const [x, y] of s) assert.ok(x >= 2.5 && x <= 7.5 && y >= 2.5 && y <= 7.5);
});

test("large red patches (not spots) are ignored", () => {
  const A = new Float32Array(100 * 100).fill(10), L = new Float32Array(100 * 100).fill(60);
  for (let y = 20; y < 80; y++) for (let x = 20; x < 80; x++) A[y * 100 + x] = 30; // one big blob
  const idx = Array.from({ length: 100 * 100 }, (_, i) => i);
  assert.equal(countSpots(A, L, idx, 100, 5, { minArea: 3, maxArea: 200 }).count, 0);
});

test("faint but clear spots are caught (adaptive threshold), and marks are returned", () => {
  // a* only ~4 above the surrounding skin — the old fixed threshold (7) missed these
  const dots = [[40, 100], [60, 125]];
  const img = image(200, 200, (x, y) => (dots.some(([dx, dy]) => (x - dx) ** 2 + (y - dy) ** 2 <= 9) ? [222, 168, 145] : SKIN));
  const m = analyzePixels(img, POLYS, 200);
  assert.equal(m.spots.leftCheek, 2);
  assert.equal(m.marks.leftCheek.length, 2);
  const near = m.marks.leftCheek.some((b) => Math.abs(b.x - 40) < 2 && Math.abs(b.y - 100) < 2);
  assert.ok(near, JSON.stringify(m.marks.leftCheek));
});

test("sensitivity changes how much is caught on noisy skin", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const img = image(200, 200, () => {
    const n = (rnd() - 0.5) * 10;
    return [224 + n, 178 + n * 0.6, 152 + n * 0.6];
  });
  const lo = analyzePixels(img, POLYS, 200, { sensitivity: "low" }).spots.total;
  const hi = analyzePixels(img, POLYS, 200, { sensitivity: "high" }).spots.total;
  assert.ok(lo <= hi, `low=${lo} high=${hi}`);
  assert.ok(lo <= 2, `noise alone should not look like acne at low sensitivity (got ${lo})`);
});

test("white balance from eye whites neutralises a colour cast", () => {
  // warm (orange) cast on a white-ish sclera
  const data = new Uint8ClampedArray(100 * 4);
  for (let i = 0; i < 100; i++) { data[i * 4] = 230; data[i * 4 + 1] = 205; data[i * 4 + 2] = 170; data[i * 4 + 3] = 255; }
  const g = whiteBalanceGains(data, Array.from({ length: 100 }, (_, i) => i));
  const out = [230 * g[0], 205 * g[1], 170 * g[2]];
  assert.ok(Math.max(...out) - Math.min(...out) < 3, JSON.stringify(out));
  assert.equal(whiteBalanceGains(data, [1, 2, 3]), null); // too few pixels → don't guess
});

test("same skin under a warm cast reads the same redness after white balance", () => {
  const cast = [1.08, 1.0, 0.86];
  const neutral = analyzePixels(image(200, 200, () => SKIN), POLYS, 200);
  const warmImg = image(200, 200, () => SKIN.map((v, c) => Math.min(255, Math.round(v * cast[c]))));
  const raw = analyzePixels(warmImg, POLYS, 200);
  const fixed = analyzePixels(warmImg, POLYS, 200, { gains: cast.map((c) => 1 / c) });
  assert.ok(Math.abs(raw.redness.mean - neutral.redness.mean) > 1.5, "cast should shift raw a*");
  assert.ok(Math.abs(fixed.redness.mean - neutral.redness.mean) < 0.6, `fixed=${fixed.redness.mean} neutral=${neutral.redness.mean}`);
});

test("small papules are caught by the fine scale", () => {
  const dots = [[30, 90], [45, 110], [65, 95], [35, 130]];
  const img = image(200, 200, (x, y) => (dots.some(([dx, dy]) => (x - dx) ** 2 + (y - dy) ** 2 <= 4) ? [214, 150, 132] : SKIN));
  const m = analyzePixels(img, POLYS, 200, { sensitivity: "high" });
  assert.equal(m.spots.leftCheek, 4, JSON.stringify(m.marks.leftCheek));
});

test("merging scales does not double count", () => {
  const a = [{ x: 10, y: 10, r: 3 }], b = [{ x: 11, y: 10, r: 2 }, { x: 40, y: 40, r: 2 }];
  assert.equal(mergeBlobs(a, b).length, 2);
});

test("sharpness: blurred < crisp", () => {
  const crisp = image(60, 60, (x, y) => ((x * 7 + y * 3) % 5 < 2 ? [255, 255, 255] : [0, 0, 0]));
  const flat = image(60, 60, () => [128, 128, 128]);
  const box = { x0: 2, y0: 2, x1: 57, y1: 57 };
  assert.ok(sharpness(crisp.data, 60, 60, box) > sharpness(flat.data, 60, 60, box) + 100);
});

test("pose from an identity matrix is frontal; quality flags bad conditions", () => {
  assert.deepEqual(poseFromMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), { yaw: -0, pitch: 0, roll: 0 });
  assert.equal(qualityWarnings({ yaw: 3, pitch: 2, faceWidth: 500, brightness: 60, sharp: 50, wb: true }).length, 0);
  assert.equal(qualityWarnings({ yaw: 25, faceWidth: 200, brightness: 30, sharp: 3, wb: false }).length, 5);
});
