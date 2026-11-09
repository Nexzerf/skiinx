// Runs the pixel maths off the main thread so the UI (and the camera preview) never stutters.
import { analyzePixels } from "./skinMetrics.js";

self.onmessage = (e: MessageEvent) => {
  const { id, image, polys, faceWidth, opts } = e.data;
  try {
    const metrics = analyzePixels(image, polys, faceWidth, opts);
    (self as any).postMessage({ id, ok: true, metrics });
  } catch (err) {
    (self as any).postMessage({ id, ok: false, error: String(err) });
  }
};
