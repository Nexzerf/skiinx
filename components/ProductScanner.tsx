"use client";
// Full-screen product scanner, all on-device:
//   1. barcode (native BarcodeDetector, else ZXing WASM) → Open Beauty Facts and sister databases
//   2. no barcode / not found → photograph the label: sharpest frame of a burst, cropped to the
//      on-screen frame and contrast-cleaned, then Tesseract reads it and lib/label.js pulls out
//      name, brand, ingredient list, EXP date and "12M" PAO. The OCR'd name is also searched in
//      Open Beauty Facts so a misread name can be swapped for the real product in one tap.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CalendarClock, Check, LoaderCircle, RotateCcw, ScanBarcode, ScanText, Search, TriangleAlert, X } from "lucide-react";
import { lookupBarcode, searchProducts, type FoundProduct } from "@/lib/obf";
import { parseLabel, type LabelInfo } from "@/lib/label.js";
import { analyzeProduct, ingredientLabel } from "@/lib/ingredients.js";
import { blobOf, captureLabel, findBarcode, openBackCamera, setZoom, zoomRange } from "@/lib/scan";
import { ProductArt } from "./ProductArt";

export type ScanResult =
  | { kind: "barcode"; found: FoundProduct; extra?: Partial<LabelInfo>; photo?: Blob | null }
  | { kind: "label"; info: LabelInfo; code: string | null; photo: Blob | null };

type Phase = "barcode" | "lookup" | "ocr" | "review";
const FRAME = { w: 0.86, h: 0.6 }; // on-screen frame, as a fraction of the camera view
const OCR_READY_KEY = "skiinx.ocrReady";

export function ProductScanner({ onResult, onClose }: { onResult: (r: ScanResult) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("barcode");
  const [camError, setCamError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [ocrStage, setOcrStage] = useState<{ text: string; p: number }>({ text: "", p: 0 });
  const [info, setInfo] = useState<LabelInfo | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [blurry, setBlurry] = useState(false);
  const [shots, setShots] = useState(0);
  const [matches, setMatches] = useState<FoundProduct[] | null>(null);
  const [zoom, setZoomState] = useState<{ min: number; max: number; v: number } | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // back camera (macro-capable one on iPhones), high resolution so small print stays readable
  useEffect(() => {
    let alive = true;
    if (!navigator.mediaDevices) {
      setCamError("เบราว์เซอร์นี้ไม่รองรับกล้อง");
      return;
    }
    openBackCamera()
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const v = video.current;
        if (v) {
          v.srcObject = s;
          v.play().catch(() => {});
        }
        const z = zoomRange(s);
        if (z) setZoomState({ ...z, v: z.min });
      })
      .catch((e) => setCamError(e?.name === "NotAllowedError" ? "ไม่ได้รับอนุญาตให้ใช้กล้อง" : "เปิดกล้องไม่ได้"));
    return () => {
      alive = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // barcode loop (~3×/s)
  useEffect(() => {
    if (phase !== "barcode" || camError) return;
    let alive = true, busy = false;
    const t = setInterval(async () => {
      const v = video.current;
      if (!alive || busy || !v?.videoWidth) return;
      busy = true;
      try {
        const found = await findBarcode(v);
        if (found && alive && phaseRef.current === "barcode") onCode(found);
      } catch {
        /* keep trying */
      } finally {
        busy = false;
      }
    }, 320);
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
      setNote(`อ่านบาร์โค้ดได้ (${c}) แต่ยังไม่มีในฐานข้อมูล — กด “อ่านฉลาก” ถ่ายด้านหน้าให้ระบบอ่านชื่อแทน`);
    } catch {
      setNote("ค้นหาบาร์โค้ดไม่ได้ตอนนี้ (ออฟไลน์?) — กด “อ่านฉลาก” แทนได้");
    }
    setPhase("barcode");
  };

  /** Photograph the label and read it. The first shot gives the name; later shots add ingredients/dates. */
  const readLabel = async () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    setPhase("ocr");
    setNote(null);
    setOcrStage({ text: "กำลังถ่าย…", p: 0 });
    try {
      const shot = await captureLabel(v, FRAME);
      setBlurry(shot.sharp < 40);
      if (!photo) setPhoto(await blobOf(shot.color));
      const read = async (psm: "3" | "6") => {
        const { data } = await ocr(shot.ocr, setOcrStage, psm);
        const lines: { text: string; height: number; confidence: number }[] = [];
        for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) lines.push({ text: l.text, height: l.bbox.y1 - l.bbox.y0, confidence: l.confidence });
        return parseLabel(lines, data.text);
      };
      let next = await read("3");
      // auto layout can drop a soft, small-print paragraph as "not text"; one block mode keeps it
      if (!next.ingredients || !next.expires_on) {
        const again = await read("6");
        next = {
          brand: next.brand || again.brand,
          name: next.name || again.name,
          ingredients: next.ingredients.length >= again.ingredients.length ? next.ingredients : again.ingredients,
          expires_on: next.expires_on || again.expires_on,
          pao_months: next.pao_months || again.pao_months,
        };
      }
      const merged: LabelInfo = info
        ? {
            brand: info.brand || next.brand,
            name: info.name || next.name,
            ingredients: [info.ingredients, next.ingredients].filter(Boolean).join(", "),
            expires_on: info.expires_on || next.expires_on,
            pao_months: info.pao_months || next.pao_months,
          }
        : next;
      setInfo(merged);
      setShots((n) => n + 1);
      setPhase("review");
      // the database often knows the product even when OCR garbles the name
      const q = `${merged.brand} ${merged.name}`.trim();
      if (q.length >= 4 && !matches?.length) searchProducts(q).then((r) => setMatches(r.slice(0, 3))).catch(() => setMatches([]));
    } catch (e: any) {
      setNote(`อ่านฉลากไม่สำเร็จ${e?.message ? ` (${e.message})` : ""} — ลองให้แสงสว่างขึ้นและถือให้นิ่ง`);
      setPhase("barcode");
    }
  };

  const actives = info ? analyzeProduct({ name: info.name, brand: info.brand, ingredients: info.ingredients, detectSpecific: true }).actives : [];
  const dates = info ? { expires_on: info.expires_on, pao_months: info.pao_months } : undefined;

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
            <div
              className="relative rounded-3xl border-[3px] border-white/85 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
              style={{ width: `${FRAME.w * 100}%`, height: `${FRAME.h * 100}%` }}
            >
              {phase === "barcode" && <div className="scan-line absolute inset-x-4 h-0.5 rounded-full bg-brand-400 shadow-[0_0_12px_2px_rgb(241_85_122/0.8)]" />}
            </div>
          </div>
        )}
        <div className="absolute inset-x-4 top-3 flex flex-col items-center gap-2">
          {phase === "barcode" && !note && (
            <span className="rounded-2xl bg-black/55 px-3.5 py-1.5 text-center text-sm backdrop-blur">
              {shots ? "หันด้านที่มีรายการส่วนผสมหรือวันหมดอายุให้เต็มกรอบ" : "เล็งบาร์โค้ดให้อยู่ในกรอบ ห่าง ~15–20 ซม. หรือกด “อ่านฉลาก”"}
            </span>
          )}
          {note && phase === "barcode" && <span className="rounded-2xl bg-amber-400 px-3.5 py-2 text-center text-sm font-medium text-amber-950">{note}</span>}
          {phase === "lookup" && (
            <span className="flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-sm">
              <LoaderCircle className="h-4 w-4 animate-spin" /> อ่านบาร์โค้ดได้ {code} กำลังค้นหา…
            </span>
          )}
        </div>
        {zoom && phase === "barcode" && (
          <div className="absolute right-3 bottom-3 flex gap-1.5">
            {[zoom.min, Math.min(zoom.max, 2)].filter((z, i, a) => a.indexOf(z) === i).map((z) => (
              <button
                key={z}
                onClick={() => {
                  setZoom(stream.current, z);
                  setZoomState({ ...zoom, v: z });
                }}
                className={`h-9 min-w-9 rounded-full px-2 text-xs font-bold ${zoom.v === z ? "bg-white text-black" : "bg-black/50 text-white"}`}
              >
                {z}×
              </button>
            ))}
          </div>
        )}
        {phase === "ocr" && (
          <div className="absolute inset-0 grid place-items-center bg-black/55">
            <div className="flex flex-col items-center gap-3 px-8 text-center">
              <ScanText className="h-10 w-10 animate-pulse text-brand-300" />
              <p className="font-semibold">
                {ocrStage.text} {ocrStage.p > 0 && ocrStage.p < 1 ? `${Math.round(ocrStage.p * 100)}%` : ""}
              </p>
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${Math.round(ocrStage.p * 100)}%` }} />
              </div>
            </div>
          </div>
        )}
        {phase === "review" && info && (
          <div className="absolute inset-x-3 bottom-3 max-h-[80%] overflow-y-auto overscroll-contain rounded-3xl bg-white p-4 text-ink shadow-2xl">
            {blurry && (
              <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> ภาพไม่ค่อยคม — ถ้าข้อมูลผิด ลองถ่ายใหม่ให้ห่างขึ้นนิด แล้วถือนิ่ง ๆ
              </p>
            )}
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

            {matches && matches.length > 0 && (
              <div className="mt-3 rounded-2xl bg-canvas p-2.5">
                <p className="mb-1.5 flex items-center gap-1 px-1 text-xs font-semibold text-muted">
                  <Search className="h-3.5 w-3.5" /> ใช่ตัวนี้ไหม? (จากฐานข้อมูล)
                </p>
                {matches.map((m) => (
                  <button
                    key={m.code + m.name}
                    onClick={() => onResult({ kind: "barcode", found: m, extra: dates, photo: m.image ? null : photo })}
                    className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left active:bg-white"
                  >
                    <ProductArt p={{ image_url: m.image, category: analyzeProduct({ name: m.name }).category }} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.name}</span>
                      <span className="block truncate text-xs text-muted">{m.brand}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <button className="btn-plain flex-1 py-2.5" onClick={() => setPhase("barcode")}>
                <RotateCcw className="h-4 w-4" /> ถ่ายเพิ่ม
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

type StageVal = { text: string; p: number };
type Stage = (s: StageVal | ((prev: StageVal) => StageVal)) => void;
let workerP: Promise<any> | null = null;
let onStage: Stage | null = null;

async function ocr(canvas: HTMLCanvasElement, stage: Stage, psm: "3" | "6" = "3") {
  onStage = stage;
  // the language files are cached by the browser after the first time — only then is it a real download
  const firstTime = typeof localStorage !== "undefined" && !localStorage.getItem(OCR_READY_KEY);
  stage({ text: firstTime ? "กำลังโหลดตัวอ่านภาษา (ครั้งแรก ~4 MB)…" : "กำลังเตรียมตัวอ่าน…", p: 0 });
  workerP ??= import("tesseract.js")
    .then(({ createWorker }) =>
      createWorker(["eng", "tha"], 1, {
        // self-hosted by scripts/prepare-mediapipe.mjs (no CDN)
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/core",
        langPath: "/tesseract/lang",
        logger: (m: any) => {
          if (m.status === "recognizing text") onStage?.((s) => ({ ...s, p: m.progress }));
          else if (/loading/.test(m.status) && firstTime) onStage?.({ text: "กำลังโหลดตัวอ่านภาษา (ครั้งแรก ~4 MB)…", p: m.progress });
        },
      }),
    )
    .then((w) => {
      localStorage.setItem(OCR_READY_KEY, "1");
      return w;
    })
    .catch((e) => {
      workerP = null;
      throw e;
    });
  const w = await workerP;
  stage({ text: psm === "3" ? "กำลังอ่านฉลาก…" : "อ่านตัวหนังสือเล็กอีกรอบ…", p: 0 });
  // automatic layout (PSM 3): keeps paragraphs (the ingredient list) in reading order and still finds
  // the big brand/name text. Sparse mode (11) scrambles paragraphs; the library default (6) drops
  // big headings.
  await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1" });
  return w.recognize(canvas, {}, { blocks: true, text: true });
}
