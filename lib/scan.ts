// Camera + image helpers for the product scanner (all on-device).
import { sharpness } from "./skinMetrics.js";

/* ───────── camera ───────── */

const HI_RES = { width: { ideal: 2560 }, height: { ideal: 1440 } };

/**
 * Open the back camera. On iPhones the browser picks the plain wide lens, which can't focus closer
 * than ~20 cm, so labels come out blurry. The virtual "Triple / Dual Wide" camera switches to the
 * ultra-wide macro lens by itself for close-ups, so prefer it when the phone has one.
 */
export async function openBackCamera(): Promise<MediaStream> {
  let stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, ...HI_RES }, audio: false });
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    const best =
      cams.find((d) => /triple|สามตัว/i.test(d.label)) ||
      cams.find((d) => /dual wide|คู่มุมกว้าง/i.test(d.label)) ||
      cams.find((d) => /dual|คู่/i.test(d.label) && /back|หลัง/i.test(d.label));
    const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
    if (best && best.deviceId && best.deviceId !== current) {
      stream.getTracks().forEach((t) => t.stop());
      stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: best.deviceId }, ...HI_RES }, audio: false });
    }
  } catch {
    /* keep the default camera */
  }
  const track = stream.getVideoTracks()[0] as any;
  track?.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
  return stream;
}

/** Zoom range if the camera supports it (mostly Android). */
export function zoomRange(stream: MediaStream | null): { min: number; max: number } | null {
  const t = stream?.getVideoTracks()[0] as any;
  const c = t?.getCapabilities?.();
  return c?.zoom ? { min: c.zoom.min, max: Math.min(c.zoom.max, 4) } : null;
}
export async function setZoom(stream: MediaStream | null, zoom: number) {
  const t = stream?.getVideoTracks()[0] as any;
  await t?.applyConstraints?.({ advanced: [{ zoom }] }).catch(() => {});
}

/* ───────── barcodes ───────── */

let zxingReady: Promise<typeof import("zxing-wasm/reader")> | null = null;
function zxing() {
  zxingReady ??= import("zxing-wasm/reader").then((m) => {
    // self-hosted by scripts/prepare-mediapipe.mjs (no CDN)
    m.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/zxing/${path}` : prefix + path) }, fireImmediately: false });
    return m;
  });
  return zxingReady;
}

const grab = (tag: "canvas") => document.createElement(tag);
let barCanvas: HTMLCanvasElement | null = null;

/** Look for a retail barcode in the current frame. Native BarcodeDetector when the browser has one, ZXing (WASM) otherwise. */
export async function findBarcode(video: HTMLVideoElement): Promise<string | null> {
  const BD = (window as any).BarcodeDetector;
  if (BD) {
    try {
      const native = (findBarcode as any).native ??= new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      const hit = (await native.detect(video))[0]?.rawValue;
      if (hit) return hit;
    } catch {
      /* fall through to ZXing */
    }
  }
  const m = await zxing();
  const scale = Math.min(1, 1600 / video.videoWidth);
  const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
  barCanvas ??= grab("canvas");
  barCanvas.width = w;
  barCanvas.height = h;
  const g = barCanvas.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(video, 0, 0, w, h);
  const res = await m.readBarcodes(g.getImageData(0, 0, w, h), {
    formats: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128"],
    tryHarder: true,
    tryRotate: true,
    tryInvert: false,
    maxNumberOfSymbols: 1,
  });
  return res.find((r) => r.isValid)?.text || null;
}

/* ───────── label photo for OCR ───────── */

/**
 * Take a short burst and keep the sharpest frame, cropped to what's inside the on-screen frame.
 * `box` = the frame as fractions of the displayed video element (object-fit: cover).
 * Returns the colour crop (product photo) and a cleaned-up greyscale version for OCR.
 */
export async function captureLabel(video: HTMLVideoElement, box = { w: 0.86, h: 0.6 }, frames = 5, gapMs = 120) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const ew = video.clientWidth || vw, eh = video.clientHeight || vh;
  const scale = Math.max(ew / vw, eh / vh); // object-fit: cover
  const cw = Math.min(vw, ((box.w + 0.08) * ew) / scale), ch = Math.min(vh, ((box.h + 0.08) * eh) / scale);
  const sx = (vw - cw) / 2, sy = (vh - ch) / 2;

  let best: HTMLCanvasElement | null = null, bestScore = -1;
  for (let i = 0; i < frames; i++) {
    if (i) await new Promise((r) => setTimeout(r, gapMs));
    const c = grab("canvas");
    c.width = Math.round(cw);
    c.height = Math.round(ch);
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(video, sx, sy, cw, ch, 0, 0, c.width, c.height);
    const s = sharpness(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { x0: c.width * 0.1, y0: c.height * 0.1, x1: c.width * 0.9, y1: c.height * 0.9 });
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return { color: best!, ocr: forOcr(best!), sharp: bestScore };
}

/** Greyscale, stretch contrast (2nd–98th percentile) and scale so small print is ~2× bigger. */
export function forOcr(src: HTMLCanvasElement): HTMLCanvasElement {
  const target = Math.min(2400, Math.max(1600, src.width));
  const k = target / src.width;
  const c = grab("canvas");
  c.width = Math.round(src.width * k);
  c.height = Math.round(src.height * k);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    d[i] = y;
    hist[y]++;
  }
  const n = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255 && (acc += hist[lo]) < n * 0.02; lo++);
  acc = 0;
  for (; hi > 0 && (acc += hist[hi]) < n * 0.02; hi--);
  const span = Math.max(1, hi - lo);
  const W = c.width, H = c.height;
  const grey = new Float32Array(W * H);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) grey[j] = ((d[i] - lo) * 255) / span;
  // light unsharp mask (centre 5, cross −1): crisps up print softened by focus or motion blur
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const j = y * W + x;
      const v =
        x && y && x < W - 1 && y < H - 1 ? 1.8 * grey[j] - 0.2 * (grey[j - 1] + grey[j + 1] + grey[j - W] + grey[j + W]) : grey[j];
      const o = j * 4;
      d[o] = d[o + 1] = d[o + 2] = Math.max(0, Math.min(255, v));
    }
  g.putImageData(img, 0, 0);
  return c;
}

export const blobOf = (c: HTMLCanvasElement, q = 0.85) => new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
