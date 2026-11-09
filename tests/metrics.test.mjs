// On-device skin metrics: colour maths, blob counting and shine on synthetic images.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePixels, convexHull, countSpots, deltas, rgbToLab, shrink } from "../lib/skinMetrics.js";

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
