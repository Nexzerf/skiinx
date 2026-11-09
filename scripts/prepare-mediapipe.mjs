// Self-host the MediaPipe Face Landmarker so skin analysis runs from our own origin:
// copies the WASM runtime from node_modules and downloads the model once (≈3.7 MB) into public/mediapipe.
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

const out = "public/mediapipe";
const src = "node_modules/@mediapipe/tasks-vision/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

if (!existsSync(src)) {
  console.log("prepare-mediapipe: @mediapipe/tasks-vision not installed yet, skipping");
  process.exit(0);
}
mkdirSync(`${out}/wasm`, { recursive: true });
cpSync(src, `${out}/wasm`, { recursive: true });

const model = `${out}/face_landmarker.task`;
if (!existsSync(model)) {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(model, Buffer.from(await res.arrayBuffer()));
    console.log("prepare-mediapipe: model downloaded");
  } catch (e) {
    // the app falls back to loading the model from Google's CDN at runtime
    console.warn("prepare-mediapipe: could not download model —", e.message);
  }
}
console.log("prepare-mediapipe: ready");

// Tesseract (label OCR for the product scanner): worker, WASM core and English + Thai language
// data, served from our own origin instead of a CDN.
const tess = "public/tesseract";
if (existsSync("node_modules/tesseract.js/dist/worker.min.js") && existsSync("node_modules/tesseract.js-core")) {
  mkdirSync(`${tess}/core`, { recursive: true });
  mkdirSync(`${tess}/lang`, { recursive: true });
  cpSync("node_modules/tesseract.js/dist/worker.min.js", `${tess}/worker.min.js`);
  for (const f of readdirSync("node_modules/tesseract.js-core")) if (/^tesseract-core.*\.wasm\.js$/.test(f)) cpSync(`node_modules/tesseract.js-core/${f}`, `${tess}/core/${f}`);
  for (const lang of ["eng", "tha"]) {
    const src = `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`;
    if (existsSync(src)) cpSync(src, `${tess}/lang/${lang}.traineddata.gz`);
  }
  console.log("prepare-mediapipe: tesseract ready");
}
