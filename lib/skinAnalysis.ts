// On-device skin analysis: MediaPipe Face Landmarker (WASM, runs in this browser) finds the face,
// then lib/skinMetrics.js measures fixed regions so every photo is compared at the same spots.
// Accuracy pipeline:
//   1. full-resolution frame (1080px) — small papules survive
//   2. white balance from the eye whites — the same skin reads the same under warm/cool light
//   3. head pose + sharpness + exposure checks — weaker photos are flagged, not silently trusted
//   4. two-scale spot detection with a per-region adaptive threshold (in a Web Worker)
// Nothing leaves the device — only the resulting numbers are stored.
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  analyzePixels, faceWidthOf, poseFromLandmarks, poseFromMatrix, qualityWarnings, regionPolygons, scleraIndices, sharpness,
  SKIN_REGIONS, whiteBalanceGains, type Poly, type Sensitivity, type SkinMetrics,
} from "./skinMetrics.js";
import { savePhoto, type Photo } from "./photos";

const LOCAL_MODEL = "/mediapipe/face_landmarker.task";
const CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WORK_WIDTH = 1080; // full stored resolution — small pimples vanish when downscaled

type Mode = "IMAGE" | "VIDEO";
const landmarkers: Partial<Record<Mode, Promise<FaceLandmarker>>> = {};
let modelPath: Promise<string> | null = null;

function load(mode: Mode = "IMAGE"): Promise<FaceLandmarker> {
  landmarkers[mode] ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    modelPath ??= fetch(LOCAL_MODEL, { method: "HEAD" }).then((r) => (r.ok ? LOCAL_MODEL : CDN_MODEL)).catch(() => CDN_MODEL);
    const model = await modelPath;
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: model, delegate },
        runningMode: mode,
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })().catch((e) => {
    delete landmarkers[mode]; // allow a retry later
    throw e;
  });
  return landmarkers[mode]!;
}

/** Warm the model up in the background (e.g. when the camera opens). */
export const preloadAnalyzer = () => load("IMAGE").catch(() => {});

/* ───────── worker ───────── */

let worker: Worker | null = null;
let seq = 0;
function runInWorker(args: { image: ImageData; polys: Record<string, Poly>; faceWidth: number; opts: any }): Promise<SkinMetrics> {
  try {
    worker ??= new Worker(new URL("./skinWorker.ts", import.meta.url), { type: "module" });
  } catch {
    return Promise.resolve(analyzePixels(args.image, args.polys, args.faceWidth, args.opts));
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const w = worker!;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.id !== id) return;
      w.removeEventListener("message", onMsg);
      e.data.ok ? resolve(e.data.metrics) : reject(new Error(e.data.error));
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, ...args }, [args.image.data.buffer]);
  });
}

/* ───────── analysis ───────── */

export type Analysis = { metrics: SkinMetrics; regions: Record<string, Blob> };

export async function analyzeBlob(blob: Blob, { sensitivity = "normal" }: { sensitivity?: Sensitivity } = {}): Promise<Analysis> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, WORK_WIDTH / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  const result = (await load("IMAGE")).detect(canvas);
  const face = result.faceLandmarks?.[0];
  if (!face) throw new Error("ไม่พบใบหน้าในรูป — ลองถ่ายหน้าตรงในที่แสงสว่าง");
  const pts: Poly = face.map((p) => [p.x * w, p.y * h]);
  const polys = regionPolygons(pts);
  const faceWidth = faceWidthOf(pts);
  const image = ctx.getImageData(0, 0, w, h);

  // capture-condition checks (before the pixel buffer is handed to the worker)
  const gains = whiteBalanceGains(image.data, scleraIndices(pts, w, h));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const sharp = sharpness(image.data, w, h, { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  const pose = poseFromMatrix(result.facialTransformationMatrixes?.[0]?.data) ?? poseFromLandmarks(pts);

  const metrics = await runInWorker({ image, polys, faceWidth, opts: { sensitivity, gains } });
  metrics.at = new Date().toISOString();
  metrics.quality = {
    pose,
    faceWidth: Math.round(faceWidth),
    sharp,
    wb: !!gains,
    gains: gains ? gains.map((g) => Math.round(g * 1000) / 1000) : null,
    warnings: qualityWarnings({ yaw: pose?.yaw, pitch: pose?.pitch, faceWidth, brightness: metrics.brightness, sharp, wb: !!gains }),
  };
  const marks = metrics.marks || {};
  delete metrics.marks; // positions are only for drawing; keep the stored numbers small

  // fixed-region crops (white-balanced) so month-to-month comparisons look at the same patch of skin
  const regions: Record<string, Blob> = {};
  for (const name of SKIN_REGIONS) {
    const poly = polys[name];
    const rx = poly.map((p) => p[0]), ry = poly.map((p) => p[1]);
    const x0 = Math.max(0, Math.min(...rx) - 4), y0 = Math.max(0, Math.min(...ry) - 4);
    const bw = Math.min(w, Math.max(...rx) + 4) - x0, bh = Math.min(h, Math.max(...ry) + 4) - y0;
    const k = 320 / Math.max(bw, bh);
    const c = document.createElement("canvas");
    c.width = Math.round(bw * k);
    c.height = Math.round(bh * k);
    const g = c.getContext("2d")!;
    g.drawImage(canvas, x0, y0, bw, bh, 0, 0, c.width, c.height);
    if (gains) {
      const px = g.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < px.data.length; i += 4) {
        px.data[i] = Math.min(255, px.data[i] * gains[0]);
        px.data[i + 1] = Math.min(255, px.data[i + 1] * gains[1]);
        px.data[i + 2] = Math.min(255, px.data[i + 2] * gains[2]);
      }
      g.putImageData(px, 0, 0);
    }
    // whiten everything outside the measured region
    g.globalCompositeOperation = "destination-in";
    g.beginPath();
    poly.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, (x - x0) * k, (y - y0) * k));
    g.closePath();
    g.fill();
    g.globalCompositeOperation = "destination-over";
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "source-over";
    // ring every detected spot so you can see exactly what was counted
    g.lineWidth = 2;
    for (const m of marks[name] || []) {
      const cx = (m.x - x0) * k, cy = (m.y - y0) * k, rr = Math.max(5, (m.r + 3) * k);
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.arc(cx, cy, rr + 1.5, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "#f1557a";
      g.beginPath();
      g.arc(cx, cy, rr, 0, Math.PI * 2);
      g.stroke();
    }
    regions[name] = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
  }
  return { metrics, regions };
}

/** Analyse a stored photo, keep the crops on the photo and return the metrics. */
export async function analyzePhoto(photo: Photo, opts: { sensitivity?: Sensitivity } = {}): Promise<Photo> {
  const { metrics, regions } = await analyzeBlob(photo.blob, opts);
  const next: Photo = { ...photo, ai: metrics, regions };
  await savePhoto(next);
  return next;
}

/* ───────── camera helpers ───────── */

export type FrameHint = { ok: boolean; hint: string };
let probe: HTMLCanvasElement | null = null;

/**
 * Live framing check on the camera preview (≈4×/s): face in frame, close enough, facing straight,
 * enough light. Guides every photo toward the same conditions so trends compare like with like.
 */
export async function frameHint(video: HTMLVideoElement): Promise<FrameHint> {
  if (!video.videoWidth) return { ok: false, hint: "กำลังเปิดกล้อง…" };
  const lm = await load("VIDEO");
  const r = lm.detectForVideo(video, performance.now());
  const face = r.faceLandmarks?.[0];
  if (!face) return { ok: false, hint: "ให้ใบหน้าอยู่ในกรอบ" };
  const xs = face.map((p) => p.x), ys = face.map((p) => p.y);
  const fw = Math.max(...xs) - Math.min(...xs);
  if (fw < 0.38) return { ok: false, hint: "ขยับเข้าใกล้กล้องอีกนิด" };
  if (fw > 0.82) return { ok: false, hint: "ถอยออกนิดหนึ่ง" };
  const pose = poseFromMatrix(r.facialTransformationMatrixes?.[0]?.data);
  if (pose && Math.abs(pose.yaw) > 10) return { ok: false, hint: "หันหน้าตรงเข้ากล้อง" };
  if (pose && Math.abs(pose.pitch) > 12) return { ok: false, hint: "ปรับระดับหน้าให้ตรง" };
  // exposure on the face box
  probe ??= document.createElement("canvas");
  probe.width = 64;
  probe.height = 64;
  const g = probe.getContext("2d", { willReadFrequently: true })!;
  const sx = Math.min(...xs) * video.videoWidth, sy = Math.min(...ys) * video.videoHeight;
  g.drawImage(video, sx, sy, fw * video.videoWidth, (Math.max(...ys) - Math.min(...ys)) * video.videoHeight, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data;
  let y = 0;
  for (let i = 0; i < d.length; i += 4) y += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  y /= d.length / 4;
  if (y < 85) return { ok: false, hint: "แสงน้อยไป — หันหน้าเข้าหาแสง" };
  if (y > 225) return { ok: false, hint: "แสงจ้าไป — ขยับออกจากแสงตรง" };
  return { ok: true, hint: "พร้อมถ่าย" };
}

/**
 * Grab a short burst from the preview and keep the sharpest frame (mirrored like the preview),
 * downscaled to 1080px wide JPEG.
 */
export async function captureSharpest(video: HTMLVideoElement, frames = 4, gapMs = 110): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, WORK_WIDTH / video.videoWidth);
  const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
  let best: HTMLCanvasElement | null = null, bestScore = -1;
  for (let i = 0; i < frames; i++) {
    if (i) await new Promise((r) => setTimeout(r, gapMs));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.translate(w, 0);
    g.scale(-1, 1);
    g.drawImage(video, 0, 0, w, h);
    const box = { x0: w * 0.25, y0: h * 0.2, x1: w * 0.75, y1: h * 0.8 };
    const s = sharpness(g.getImageData(0, 0, w, h).data, w, h, box);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  const blob: Blob = await new Promise((r) => best!.toBlob((b) => r(b!), "image/jpeg", 0.9));
  return { blob, width: w, height: h };
}
