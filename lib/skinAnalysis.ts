// On-device skin analysis: MediaPipe Face Landmarker (WASM, runs in this browser) finds the face,
// then lib/skinMetrics.js measures fixed regions so every photo is compared at the same spots.
// Nothing leaves the device — only the resulting numbers are stored.
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { analyzePixels, faceWidthOf, regionPolygons, SKIN_REGIONS, type Poly, type SkinMetrics } from "./skinMetrics.js";
import { savePhoto, type Photo } from "./photos";

const LOCAL_MODEL = "/mediapipe/face_landmarker.task";
const CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WORK_WIDTH = 720;

let landmarker: Promise<FaceLandmarker> | null = null;
function load(): Promise<FaceLandmarker> {
  landmarker ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const make = (modelAssetPath: string, delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath, delegate }, runningMode: "IMAGE", numFaces: 1 });
    const model = (await fetch(LOCAL_MODEL, { method: "HEAD" }).then((r) => r.ok).catch(() => false)) ? LOCAL_MODEL : CDN_MODEL;
    try {
      return await make(model, "GPU");
    } catch {
      return await make(model, "CPU");
    }
  })().catch((e) => {
    landmarker = null; // allow a retry later
    throw e;
  });
  return landmarker;
}

/** Warm the model up in the background (e.g. when the camera opens). */
export const preloadAnalyzer = () => load().catch(() => {});

export type Analysis = { metrics: SkinMetrics; regions: Record<string, Blob> };

export async function analyzeBlob(blob: Blob): Promise<Analysis> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, WORK_WIDTH / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  const result = (await load()).detect(canvas);
  const face = result.faceLandmarks?.[0];
  if (!face) throw new Error("ไม่พบใบหน้าในรูป — ลองถ่ายหน้าตรงในที่แสงสว่าง");
  const pts: Poly = face.map((p) => [p.x * w, p.y * h]);
  const polys = regionPolygons(pts);
  const metrics = analyzePixels(ctx.getImageData(0, 0, w, h), polys, faceWidthOf(pts));
  metrics.at = new Date().toISOString();

  // fixed-region crops so month-to-month comparisons look at the same patch of skin
  const regions: Record<string, Blob> = {};
  for (const name of SKIN_REGIONS) {
    const poly = polys[name];
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const x0 = Math.max(0, Math.min(...xs) - 4), y0 = Math.max(0, Math.min(...ys) - 4);
    const bw = Math.min(w, Math.max(...xs) + 4) - x0, bh = Math.min(h, Math.max(...ys) + 4) - y0;
    const k = 240 / Math.max(bw, bh);
    const c = document.createElement("canvas");
    c.width = Math.round(bw * k);
    c.height = Math.round(bh * k);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.beginPath();
    poly.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, (x - x0) * k, (y - y0) * k));
    g.closePath();
    g.clip();
    g.drawImage(canvas, x0, y0, bw, bh, 0, 0, c.width, c.height);
    regions[name] = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.88));
  }
  return { metrics, regions };
}

/** Analyse a stored photo, keep the crops on the photo and return the metrics. */
export async function analyzePhoto(photo: Photo): Promise<Photo> {
  const { metrics, regions } = await analyzeBlob(photo.blob);
  const next: Photo = { ...photo, ai: metrics, regions };
  await savePhoto(next);
  return next;
}
