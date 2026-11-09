// Pure, dependency-free skin metrics for trend tracking (runs in the browser; unit-tested in Node).
// Input: RGBA pixels + face-landmark polygons. Output: a few numbers per region — no diagnosis.
//   redness = mean CIE-Lab a* (higher = redder)
//   spots   = red blobs clearly redder than the skin around them
//   oil     = % of T-zone pixels that are specular highlights (very bright, almost colourless)

/* ───────── colour ───────── */

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const E = (6 / 29) ** 3;
const f = (t) => (t > E ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);

/** sRGB 0–255 → CIE Lab (D65). */
export function rgbToLab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/* ───────── face regions (MediaPipe Face Mesh landmark indices) ───────── */
// Each region = convex hull of these points, shrunk toward its centre so hair, brows,
// nostrils and jaw shadow stay out. "left"/"right" = as seen in the (mirrored) photo.
export const REGION_POINTS = {
  forehead: [103, 67, 109, 10, 338, 297, 332, 333, 299, 337, 151, 108, 69, 104],
  leftCheek: [116, 117, 118, 119, 120, 100, 142, 36, 205, 187, 123, 50, 101],
  rightCheek: [345, 346, 347, 348, 349, 329, 371, 266, 425, 411, 352, 280, 330],
  chin: [152, 148, 176, 149, 377, 400, 378, 18, 200, 199, 175, 83, 313, 201, 421, 194, 418],
  nose: [6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 327, 48, 278, 115, 344, 220, 440],
};
export const REGION_LABEL = { forehead: "หน้าผาก", leftCheek: "แก้มซ้าย", rightCheek: "แก้มขวา", chin: "คาง", nose: "จมูก" };
export const SKIN_REGIONS = ["forehead", "leftCheek", "rightCheek", "chin"];

export function convexHull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function shrink(poly, k) {
  const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length;
  const cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
  return poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

/** landmarks: [[x,y],…] in pixels (478 points) → { region: polygon } */
export function regionPolygons(landmarks, k = 0.82) {
  const out = {};
  for (const [name, idx] of Object.entries(REGION_POINTS)) out[name] = shrink(convexHull(idx.map((i) => landmarks[i])), k);
  return out;
}

export const faceWidthOf = (landmarks) => Math.hypot(landmarks[454][0] - landmarks[234][0], landmarks[454][1] - landmarks[234][1]);

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Pixel indices inside a polygon. */
export function maskOf(poly, width, height) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(width - 1, Math.ceil(x1)); y1 = Math.min(height - 1, Math.ceil(y1));
  const idx = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(poly, x + 0.5, y + 0.5)) idx.push(y * width + x);
  return idx;
}

function median(values) {
  if (!values.length) return 0;
  const s = Float32Array.from(values).sort();
  return s[s.length >> 1];
}
const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Count red spots in one region: pixels whose a* is ≥ `delta` above the local mean (box of
 * radius r, computed only over the region's own pixels), grouped into 4-connected blobs.
 */
export function countSpots(A, L, idx, width, r, { delta = 7, minArea = 3, maxArea = 400 } = {}) {
  if (!idx.length) return 0;
  // local means via a sparse summed-area table over the region's bounding box
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const i of idx) {
    const x = i % width, y = (i / width) | 0;
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const sum = new Float64Array((w + 1) * (h + 1));
  const cnt = new Float64Array((w + 1) * (h + 1));
  const inR = new Uint8Array(w * h);
  for (const i of idx) {
    const x = (i % width) - x0, y = ((i / width) | 0) - y0;
    inR[y * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    let rs = 0, rc = 0;
    for (let x = 0; x < w; x++) {
      if (inR[y * w + x]) {
        rs += A[(y + y0) * width + x + x0];
        rc++;
      }
      const o = (y + 1) * (w + 1) + x + 1;
      sum[o] = sum[o - (w + 1)] + rs;
      cnt[o] = cnt[o - (w + 1)] + rc;
    }
  }
  const box = (tab, ax, ay, bx, by) => tab[(by + 1) * (w + 1) + bx + 1] - tab[ay * (w + 1) + bx + 1] - tab[(by + 1) * (w + 1) + ax] + tab[ay * (w + 1) + ax];
  const cand = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inR[y * w + x]) continue;
      const g = (y + y0) * width + x + x0;
      if (L[g] < 25) continue; // ignore deep shadows / hair
      const ax = Math.max(0, x - r), ay = Math.max(0, y - r), bx = Math.min(w - 1, x + r), by = Math.min(h - 1, y + r);
      const n = box(cnt, ax, ay, bx, by);
      if (n && A[g] - box(sum, ax, ay, bx, by) / n >= delta) cand[y * w + x] = 1;
    }
  // connected components (4-neighbour, iterative flood fill)
  let spots = 0;
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (cand[s] !== 1) continue;
    let area = 0;
    cand[s] = 2;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop();
      area++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && cand[p - 1] === 1) { cand[p - 1] = 2; stack.push(p - 1); }
      if (x < w - 1 && cand[p + 1] === 1) { cand[p + 1] = 2; stack.push(p + 1); }
      if (y > 0 && cand[p - w] === 1) { cand[p - w] = 2; stack.push(p - w); }
      if (y < h - 1 && cand[p + w] === 1) { cand[p + w] = 2; stack.push(p + w); }
    }
    if (area >= minArea && area <= maxArea) spots++;
  }
  return spots;
}

/**
 * image: { data: RGBA Uint8ClampedArray, width, height }
 * polys: from regionPolygons(); faceWidth: px between the face edges (sets blob size limits)
 */
export function analyzePixels(image, polys, faceWidth) {
  const { data, width, height } = image;
  const n = width * height;
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  const masks = {};
  for (const [name, poly] of Object.entries(polys)) masks[name] = maskOf(poly, width, height);
  // convert only pixels we will look at
  const seen = new Uint8Array(n);
  for (const idx of Object.values(masks))
    for (const i of idx) {
      if (seen[i]) continue;
      seen[i] = 1;
      const [l, a, b] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      L[i] = l; A[i] = a; B[i] = b;
    }

  const r = Math.max(3, Math.round(faceWidth * 0.035));
  const blob = { minArea: Math.max(3, Math.round((faceWidth * 0.007) ** 2)), maxArea: Math.round((faceWidth * 0.06) ** 2) };
  const redness = {}, spots = {};
  let rSum = 0, rN = 0, total = 0;
  for (const name of SKIN_REGIONS) {
    const idx = masks[name] || [];
    let s = 0;
    for (const i of idx) s += A[i];
    redness[name] = idx.length ? r1(s / idx.length) : null;
    if (idx.length) { rSum += s; rN += idx.length; }
    spots[name] = countSpots(A, L, idx, width, r, blob);
    total += spots[name];
  }
  redness.mean = rN ? r1(rSum / rN) : null;
  spots.total = total;

  // shine: T-zone = forehead + nose
  const tz = [...(masks.forehead || []), ...(masks.nose || [])];
  const medL = median(tz.map((i) => L[i]));
  let hi = 0;
  for (const i of tz) if (L[i] > Math.max(60, medL + 15) && Math.hypot(A[i], B[i]) < 20) hi++;
  const oil = tz.length ? r1((hi / tz.length) * 100) : null;

  const all = SKIN_REGIONS.flatMap((k) => masks[k] || []);
  const brightness = r1(median(all.map((i) => L[i])));
  const coverage = Object.fromEntries(Object.entries(masks).map(([k, v]) => [k, v.length]));
  return { v: 1, redness, spots, oil, brightness, coverage };
}

/** Compare two metric snapshots → { redness, spots, oil } deltas (null when missing). */
export function deltas(now, prev) {
  if (!now || !prev) return null;
  const d = (a, b) => (a == null || b == null ? null : r1(a - b));
  return {
    redness: d(now.redness?.mean, prev.redness?.mean),
    spots: d(now.spots?.total, prev.spots?.total),
    oil: d(now.oil, prev.oil),
    brightness: d(now.brightness, prev.brightness),
  };
}
