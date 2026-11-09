"use client";
// Full-screen product scanner, all on-device:
//   1. barcode (native BarcodeDetector when the browser has it, ZXing otherwise) → Open Beauty Facts
//   2. no barcode / not in the database → photograph the label; Tesseract reads the text and
//      lib/label.js pulls out name, brand, ingredient list, EXP date and "12M" PAO.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CalendarClock, Check, LoaderCircle, RotateCcw, ScanBarcode, ScanText, X } from "lucide-react";
import { lookupBarcode, type FoundProduct } from "@/lib/obf";
import { parseLabel, type LabelInfo } from "@/lib/label.js";
import { analyzeProduct, ingredientLabel } from "@/lib/ingredients.js";

export type ScanResult =
  | { kind: "barcode"; found: FoundProduct }
  | { kind: "label"; info: LabelInfo; code: string | null; photo: Blob | null };

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
type Phase = "barcode" | "lookup" | "ocr" | "review";

export function ProductScanner({ onResult, onClose }: { onResult: (r: ScanResult) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("barcode");
  const [camError, setCamError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [info, setInfo] = useState<LabelInfo | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [shots, setShots] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // rear camera, high resolution so small label text stays readable
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        stream = s;
        const v = video.current;
        if (v) {
          v.srcObject = s;
          v.play().catch(() => {});
        }
        // tap-to-focus isn't available on the web; ask for continuous focus where supported
        const track = s.getVideoTracks()[0] as any;
        track?.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      })
      .catch((e) => setCamError(e?.name === "NotAllowedError" ? "ไม่ได้รับอนุญาตให้ใช้กล้อง" : "เปิดกล้องไม่ได้"));
    if (!navigator.mediaDevices) setCamError("เบราว์เซอร์นี้ไม่รองรับกล้อง");
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  // barcode loop (~4×/s)
  useEffect(() => {
    if (phase !== "barcode" || camError) return;
    let alive = true, busy = false;
    let detect: ((v: HTMLVideoElement) => Promise<string | null>) | null = null;
    (async () => {
      const BD = (window as any).BarcodeDetector;
      if (BD && (await BD.getSupportedFormats?.())?.includes("ean_13")) {
        const d = new BD({ formats: FORMATS });
        detect = async (v) => (await d.detect(v))[0]?.rawValue || null;
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]);
        const reader = new BrowserMultiFormatReader(hints);
        const c = document.createElement("canvas");
        detect = async (v) => {
          // centre strip only: faster, and that's where the user aims
          const w = Math.min(1280, v.videoWidth), h = Math.round((w / v.videoWidth) * v.videoHeight * 0.5);
          c.width = w;
          c.height = h;
          c.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, v.videoHeight * 0.25, v.videoWidth, v.videoHeight * 0.5, 0, 0, w, h);
          try {
            return reader.decodeFromCanvas(c).getText();
          } catch {
            return null;
          }
        };
      }
    })();
    const t = setInterval(async () => {
      const v = video.current;
      if (!alive || busy || !detect || !v?.videoWidth) return;
      busy = true;
      try {
        const found = await detect(v);
        if (found && alive && phaseRef.current === "barcode") onCode(found);
      } catch {
        /* keep trying */
      } finally {
        busy = false;
      }
    }, 250);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, camError]);

  const tried = useRef(new Set<string>()); // don't look the same code up again and again
  const onCode = async (c: string) => {
    if (tried.current.has(c)) return;
    tried.current.add(c);
    navigator.vibrate?.(40);
    setCode(c);
    setPhase("lookup");
    try {
      const f = await lookupBarcode(c);
      if (f) return onResult({ kind: "barcode", found: f });
      setNote(`ไม่พบบาร์โค้ด ${c} ในฐานข้อมูล — ถ่ายรูปฉลากด้านหน้าให้ระบบอ่านแทน`);
    } catch {
      setNote("ค้นหาบาร์โค้ดไม่ได้ตอนนี้ — ถ่ายรูปฉลากแทนได้");
    }
    setPhase("barcode");
  };

  /** Photograph the label and read it. The first shot gives the name; later shots add ingredients/dates. */
  const readLabel = async () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    const scale = Math.min(1, 1800 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    setPhase("ocr");
    setProgress(0);
    try {
      if (!photo) {
        // product photo: a centred portrait crop (the bottle), not the whole frame
        const ph = Math.round(c.height * 0.92), pw = Math.min(c.width, Math.round(ph * 0.75));
        const pc = document.createElement("canvas");
        pc.width = pw;
        pc.height = ph;
        pc.getContext("2d")!.drawImage(c, (c.width - pw) / 2, (c.height - ph) / 2, pw, ph, 0, 0, pw, ph);
        setPhoto(await new Promise<Blob | null>((r) => pc.toBlob(r, "image/jpeg", 0.85)));
      }
      const { data } = await ocr(c, setProgress);
      const lines: { text: string; height: number; confidence: number }[] = [];
      for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) lines.push({ text: l.text, height: l.bbox.y1 - l.bbox.y0, confidence: l.confidence });
      const next = parseLabel(lines, data.text);
      setInfo((prev) =>
        prev
          ? {
              brand: prev.brand || next.brand,
              name: prev.name || next.name,
              ingredients: [prev.ingredients, next.ingredients].filter(Boolean).join(", "),
              expires_on: prev.expires_on || next.expires_on,
              pao_months: prev.pao_months || next.pao_months,
            }
          : next,
      );
      setShots((n) => n + 1);
      setPhase("review");
    } catch (e: any) {
      setNote("อ่านฉลากไม่สำเร็จ — ลองให้แสงสว่างขึ้นและถือให้นิ่ง");
      setPhase("barcode");
    }
  };

  const actives = info ? analyzeProduct({ name: info.name, brand: info.brand, ingredients: info.ingredients, detectSpecific: true }).actives : [];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/15" aria-label="ปิด">
          <X className="h-5 w-5" />
        </button>
        <span className="font-semibold">{phase === "review" ? "ตรวจข้อมูลที่อ่านได้" : shots ? "ถ่ายด้านหลัง (ส่วนผสม / EXP)" : "สแกนสินค้า"}</span>
        <span className="w-10" />
      </div>

      <div className="relative flex-1 overflow-hidden">
        {camError ? (
          <p className="grid h-full place-items-center p-6 text-center text-gray-300">{camError}</p>
        ) : (
          <video ref={video} playsInline muted className="h-full w-full object-cover" />
        )}
        {!camError && phase !== "review" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[46%] w-[82%] rounded-3xl border-[3px] border-white/85 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]">
              {phase === "barcode" && <div className="scan-line absolute inset-x-4 h-0.5 rounded-full bg-brand-400 shadow-[0_0_12px_2px_rgb(241_85_122/0.8)]" />}
            </div>
          </div>
        )}
        <div className="absolute inset-x-4 top-3 flex flex-col items-center gap-2">
          {phase === "barcode" && !note && (
            <span className="rounded-full bg-black/55 px-3.5 py-1.5 text-sm backdrop-blur">
              {shots ? "หันด้านที่มีรายการส่วนผสมหรือวันหมดอายุเข้ากล้อง" : "เล็งบาร์โค้ด หรือกด “อ่านฉลาก” ถ้าไม่มี"}
            </span>
          )}
          {note && phase === "barcode" && <span className="rounded-2xl bg-amber-400 px-3.5 py-2 text-center text-sm font-medium text-amber-950">{note}</span>}
          {phase === "lookup" && (
            <span className="flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-sm">
              <LoaderCircle className="h-4 w-4 animate-spin" /> พบบาร์โค้ด {code} กำลังค้นหา…
            </span>
          )}
        </div>
        {phase === "ocr" && (
          <div className="absolute inset-0 grid place-items-center bg-black/55">
            <div className="flex flex-col items-center gap-3">
              <ScanText className="h-10 w-10 animate-pulse text-brand-300" />
              <p className="font-semibold">กำลังอ่านฉลาก… {progress ? `${Math.round(progress * 100)}%` : ""}</p>
              <p className="text-xs text-white/70">ครั้งแรกต้องโหลดตัวอ่านภาษา (~4 MB)</p>
            </div>
          </div>
        )}
        {phase === "review" && info && (
          <div className="absolute inset-x-3 bottom-3 max-h-[75%] overflow-y-auto rounded-3xl bg-white p-4 text-ink shadow-2xl">
            <p className="text-xs text-muted">{info.brand || "ไม่เห็นชื่อแบรนด์"}</p>
            <p className="text-lg leading-snug font-bold">{info.name || "อ่านชื่อไม่ออก — แก้ได้ในขั้นถัดไป"}</p>
            {actives.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {actives.map((k) => (
                  <span key={k} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <Check className="h-3 w-3" /> {ingredientLabel(k)}
                  </span>
                ))}
              </div>
            )}
            {(info.expires_on || info.pao_months) && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                <CalendarClock className="h-4 w-4" />
                {info.expires_on && `EXP ${info.expires_on.split("-").slice(0, 2).reverse().join("/")}`}
                {info.expires_on && info.pao_months && " · "}
                {info.pao_months && `เปิดแล้วใช้ได้ ${info.pao_months} เดือน`}
              </p>
            )}
            {!info.ingredients && <p className="mt-2 text-xs text-muted">ยังไม่เห็นรายการส่วนผสม — ถ่ายด้านหลังเพิ่มได้</p>}
            <div className="mt-3 flex gap-2">
              <button className="btn-plain flex-1 py-2.5" onClick={() => setPhase("barcode")}>
                <RotateCcw className="h-4 w-4" /> ถ่ายด้านหลังเพิ่ม
              </button>
              <button className="btn-primary flex-1 py-2.5" onClick={() => onResult({ kind: "label", info, code, photo })}>
                <Check className="h-4 w-4" /> ใช้ข้อมูลนี้
              </button>
            </div>
          </div>
        )}
      </div>

      {phase !== "review" && !camError && (
        <div className="flex items-center justify-center gap-8 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <span className="flex w-20 flex-col items-center gap-1 text-xs text-gray-300">
            <ScanBarcode className="h-6 w-6" /> สแกนอัตโนมัติ
          </span>
          <button onClick={readLabel} disabled={phase !== "barcode"} className="grid h-18 w-18 place-items-center rounded-full border-4 border-white bg-brand-500 transition active:scale-95 disabled:opacity-50" aria-label="อ่านฉลาก">
            <Camera className="h-7 w-7" />
          </button>
          <span className="w-20 text-center text-xs text-gray-300">อ่านฉลาก</span>
        </div>
      )}
    </div>,
    document.body,
  );
}

/* ───────── OCR (Tesseract, loaded on first use, kept for the session) ───────── */

let workerP: Promise<any> | null = null;
let onProgress: ((p: number) => void) | null = null;
async function ocr(canvas: HTMLCanvasElement, progress: (p: number) => void) {
  onProgress = progress;
  workerP ??= import("tesseract.js").then(({ createWorker }) =>
    createWorker(["eng", "tha"], 1, {
      // self-hosted by scripts/prepare-mediapipe.mjs (no CDN)
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core",
      langPath: "/tesseract/lang",
      logger: (m: any) => m.status === "recognizing text" && onProgress?.(m.progress),
    }),
  ).catch((e) => {
    workerP = null;
    throw e;
  });
  const w = await workerP;
  // sparse text: labels are scattered words of very different sizes, not a page of paragraphs
  await w.setParameters({ tessedit_pageseg_mode: "11" });
  return w.recognize(canvas, {}, { blocks: true, text: true });
}
