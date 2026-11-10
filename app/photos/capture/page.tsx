"use client";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, CircleCheck, Eye, ImagePlus, Lightbulb, LoaderCircle, ScanFace, ShieldCheck, Sun, Timer, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { ANGLE_LABEL, allPhotos, fileToImage, requestPersist, resizeToJpeg, savePhoto, type Angle, type Photo } from "@/lib/photos";
import { analyzePhoto, captureSharpest, hintFor, preloadAnalyzer, readFrame, type FrameHint } from "@/lib/skinAnalysis";
import { advance, initial, makePlan, prompt, type LiveState, type Move } from "@/lib/liveness.js";
import type { SkinMetrics } from "@/lib/skinMetrics.js";
import SkinLogForm from "@/components/SkinLogForm";
import AnalysisCard from "@/components/AnalysisCard";
import type { Slot } from "@/lib/types";

export default function CapturePage() {
  return (
    <Suspense>
      <Capture />
    </Suspense>
  );
}

function Capture() {
  const router = useRouter();
  const search = useSearchParams();
  const checkinSlot = search.get("checkin") as Slot | null;
  const { ready, today, info, settings, snap, schedules, upsertSkinLog, setCheck } = useData();
  const angles: Angle[] = (settings.photoAngles?.length ? settings.photoAngles : ["front"]) as Angle[];
  const [ai, setAi] = useState(0);
  const angle = angles[Math.min(ai, angles.length - 1)];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Record<string, string>>({});
  const [opacity, setOpacity] = useState(0.3);
  const [count, setCount] = useState<number | null>(null);
  const [phase, setPhase] = useState<"shoot" | "score">("shoot");
  const saved = useRef<Angle[]>([]);
  const front = useRef<Photo | null>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const [analysis, setAnalysis] = useState<{ state: "loading" | "done" | "error"; metrics?: SkinMetrics; regions?: Record<string, Blob>; error?: string } | null>(null);

  // warm the face model up while the user lines up the shot
  useEffect(() => {
    preloadAnalyzer();
  }, [settings.autoAnalyze]);

  // live framing guidance + liveness check (~6×/s) while the camera is up
  const [hint, setHint] = useState<FrameHint | null>(null);
  const [live, setLive] = useState<LiveState>(() => initial(makePlan(3)));
  const [noModel, setNoModel] = useState(false); // face model can't run here → skip the check
  const [screenLight, setScreenLight] = useState(false);
  const angleRef = useRef(angle);
  angleRef.current = angle;
  useEffect(() => {
    if (phase !== "shoot" || camError) return;
    let alive = true, busy = false, fails = 0;
    const t = setInterval(async () => {
      const v = videoRef.current;
      if (!alive || busy || !v) return;
      busy = true;
      try {
        const r = await readFrame(v);
        if (!alive) return;
        fails = 0;
        setHint(hintFor(r, angleRef.current));
        if (r) setLive((st) => advance(st, r));
      } catch {
        if (alive && ++fails >= 8) setNoModel(true); // model unavailable → no hints, no check
        if (alive) setHint(null);
      } finally {
        busy = false;
      }
    }, 160);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [phase, camError]);
  const verified = live.done || noModel;
  // turn the screen light on by itself the first time it's too dark
  const autoLit = useRef(false);
  useEffect(() => {
    if (hint?.dark && !autoLit.current) {
      autoLit.current = true;
      setScreenLight(true);
    }
  }, [hint?.dark]);

  // after the last shot: analyse the front photo on-device, store numbers in today's skin log
  useEffect(() => {
    if (phase !== "score" || !front.current || !settings.autoAnalyze) return;
    let alive = true;
    setAnalysis({ state: "loading" });
    analyzePhoto(front.current, { sensitivity: settings.spotSensitivity })
      .then(async (p) => {
        if (!alive) return;
        setAnalysis({ state: "done", metrics: p.ai, regions: p.regions });
        const log = snapRef.current.skinLogs.find((l) => l.date === today);
        await upsertSkinLog({
          ...(log || { date: today, acne: null, oil: null, irritation: null, overall: null, note: null, photo_angles: ["front"] }),
          ai: p.ai,
        });
      })
      .catch((e) => alive && setAnalysis({ state: "error", error: e?.message }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (phase !== "shoot") return;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((e) => setCamError(e?.message || "เปิดกล้องไม่ได้"));
    if (!navigator.mediaDevices) setCamError("เบราว์เซอร์นี้ไม่รองรับกล้อง");
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [phase]);

  // last photo per angle as a see-through guide
  useEffect(() => {
    allPhotos().then((ps) => {
      const g: Record<string, string> = {};
      for (const p of ps) g[p.angle] = URL.createObjectURL(p.blob); // later ones overwrite → latest
      setGhost(g);
    });
  }, []);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  if (!ready) return null;

  const store = async (blob: Blob, width: number, height: number) => {
    const s = core.scheduleFor(today, schedules);
    const photo: Photo = {
      id: `${today}-${angle}-${Date.now()}`,
      date: today,
      cycleDay: info?.n ?? null,
      round: s ? core.cycleRound(s.start_date, today, s.data.days.length) : null,
      angle,
      blob,
      width,
      height,
      createdAt: new Date().toISOString(),
    };
    await savePhoto(photo);
    if (angle === "front") front.current = photo;
    requestPersist();
    saved.current = Array.from(new Set([...saved.current, angle]));
    if (ai + 1 < angles.length) setAi(ai + 1);
    else {
      const log = snap.skinLogs.find((l) => l.date === today);
      try {
        await upsertSkinLog({
          ...(log || { date: today, acne: null, oil: null, irritation: null, overall: null, note: null, photo_angles: [] }),
          photo_angles: Array.from(new Set([...(log?.photo_angles || []), ...saved.current])),
        });
      } catch {
        // the photo itself is safe on this device — only the "photo taken" mark didn't sync; carry on
      }
      setPhase("score");
    }
  };

  /** Run a capture step; on failure tell the user instead of freezing on the camera screen. */
  const guarded = async (work: () => Promise<void>) => {
    setSaving(true);
    setSaveError(null);
    try {
      await work();
    } catch (e: any) {
      setSaveError(`บันทึกรูปไม่สำเร็จ — ${e?.message || e} · ลองถ่ายอีกครั้ง`);
    } finally {
      setSaving(false);
    }
  };

  const shoot = () => {
    if (!verified) return;
    let n = 3;
    setCount(n);
    const t = setInterval(async () => {
      n--;
      if (n > 0) return setCount(n);
      clearInterval(t);
      setCount(null);
      guarded(async () => {
        const v = videoRef.current;
        if (!v?.videoWidth) throw new Error("กล้องยังไม่พร้อม");
        const r = await captureSharpest(v); // sharpest of a short burst, mirrored like the preview
        await store(r.blob, r.width, r.height);
      });
    }, 1000);
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    guarded(async () => {
      const img = await fileToImage(f);
      const r = await resizeToJpeg(img, img.naturalWidth, img.naturalHeight);
      await store(r.blob, r.width, r.height);
    });
  };

  const finish = () => {
    if (checkinSlot) {
      setCheck(today, checkinSlot, true);
      router.replace(`/focus/${checkinSlot}?celebrate=1`);
    } else router.replace("/photos");
  };

  if (phase === "score") {
    const prev = [...snap.skinLogs].reverse().find((l) => l.date < today && l.ai)?.ai;
    return (
      <div className="stagger space-y-4">
        <h1 className="flex items-center gap-2 pt-2 text-2xl font-bold"><CircleCheck className="h-6 w-6 text-emerald-500" /> บันทึกรูปแล้ว</h1>
        {analysis && <AnalysisCard state={analysis.state} metrics={analysis.metrics} regions={analysis.regions} prev={prev} error={analysis.error} />}
        <p className="px-1 text-sm text-muted">ให้คะแนนผิววันนี้ (ข้ามได้)</p>
        <div className="card">
          <SkinLogForm date={today} onDone={finish} />
        </div>
        <button className="btn-plain w-full" onClick={finish}>
          ข้าม
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4">
        <Link href={checkinSlot ? `/focus/${checkinSlot}` : "/photos"} className="grid h-10 w-10 place-items-center rounded-full bg-white/15" aria-label="ปิด">
          <X className="h-5 w-5" />
        </Link>
        <span className="font-semibold">
          <Camera className="mr-1 inline h-4 w-4" /> {ANGLE_LABEL[angle]} {angles.length > 1 && `(${ai + 1}/${angles.length})`}
        </span>
        <span className="w-6" />
      </div>
      <div className="relative flex-1 overflow-hidden">
        {camError ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-gray-300">{camError}</p>
            <label className="btn-primary cursor-pointer">
              <ImagePlus className="h-4 w-4" /> ถ่าย/เลือกรูปแทน
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        ) : (
          <>
            {/* screen light: a bright white frame lights the face in a dark room (front cameras have no flash) */}
            <div className={`absolute inset-0 transition-all duration-300 ${screenLight ? "bg-white px-[7%] py-[12%]" : ""}`}>
              <video ref={videoRef} playsInline muted className={`h-full w-full -scale-x-100 object-cover ${screenLight ? "rounded-[32px]" : ""}`} />
            </div>
            {verified && ghost[angle] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ghost[angle]} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity }} />
            )}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={`h-[62%] w-[62%] max-w-xs rounded-[50%] border-4 transition-colors duration-300 ${
                  !verified ? "border-solid border-sky-400/90" : hint?.ok ? "border-dashed border-emerald-400" : "border-dashed border-white/70"
                }`}
              />
            </div>
            {count !== null && <div className="absolute inset-0 grid place-items-center text-8xl font-bold drop-shadow-lg">{count}</div>}
            {saving && (
              <div className="absolute inset-0 grid place-items-center bg-black/40">
                <span className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 font-semibold">
                  <LoaderCircle className="h-5 w-5 animate-spin" /> กำลังบันทึก…
                </span>
              </div>
            )}
            {saveError && (
              <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-red-500 p-3 text-center text-sm font-medium shadow-xl" role="alert">
                {saveError}
              </div>
            )}

            {!verified ? (
              <LivenessPanel live={live} dark={!!hint?.dark} />
            ) : (
              <div className="absolute inset-x-0 top-3 flex flex-col items-center gap-1.5">
                {hint && !hint.dark && (
                  <span
                    key={hint.hint}
                    className={`bounce-in rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-lg backdrop-blur ${hint.ok ? "bg-emerald-500/90 text-white" : "bg-black/55 text-white"}`}
                  >
                    {hint.hint}
                  </span>
                )}
                {live.done && (
                  <span className="flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" /> ยืนยันใบหน้าจริงแล้ว
                  </span>
                )}
                <span className="text-xs text-white/75 drop-shadow">ถ่ายที่เดิม แสงเดิม ไม่แต่งหน้า หลังล้างหน้า</span>
              </div>
            )}

            {hint?.dark && <DarkWarning screenLight={screenLight} onToggle={() => setScreenLight((x) => !x)} />}
          </>
        )}
      </div>
      {!camError && (
        <div className="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {ghost[angle] && (
            <label className="flex items-center gap-2 text-xs text-gray-300">
              ภาพไกด์
              <input type="range" min={0} max={0.7} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="flex-1" />
            </label>
          )}
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => setScreenLight((x) => !x)}
              className={`flex w-16 flex-col items-center gap-1 text-xs ${screenLight ? "text-amber-300" : "text-gray-300"}`}
              aria-pressed={screenLight}
            >
              <Lightbulb className="h-5 w-5" /> ไฟหน้าจอ
            </button>
            <button
              aria-label="ถ่าย"
              disabled={count !== null || saving || !verified}
              className={`grid h-20 w-20 place-items-center rounded-full border-4 bg-brand-500 transition active:scale-95 disabled:opacity-40 ${hint?.ok && verified ? "border-emerald-400 shadow-[0_0_0_6px_rgb(52_211_153/0.35)]" : "border-white"}`}
              onClick={shoot}
            />
            <span className="flex w-16 flex-col items-center gap-1 text-xs text-gray-300"><Timer className="h-5 w-5" /> 3 วิ</span>
          </div>
          {noModel && <p className="text-center text-xs text-gray-400">เครื่องนี้ตรวจใบหน้าอัตโนมัติไม่ได้ — ถ่ายได้ตามปกติ</p>}
        </div>
      )}
    </div>
  );
}

const MOVE_ICON: Record<Move, LucideIcon> = { left: ArrowLeft, right: ArrowRight, up: ArrowUp, down: ArrowDown, blink: Eye };
const MOVE_ANIM: Record<Move, string> = { left: "nudge-left", right: "nudge-right", up: "nudge-up", down: "nudge-down", blink: "pulse-soft" };

/** Bank-app style "prove you're real" steps: look straight → random head moves → blink. */
function LivenessPanel({ live, dark }: { live: LiveState; dark: boolean }) {
  const move = live.step >= 0 ? live.plan[live.step] : null;
  const Icon = move ? MOVE_ICON[move] : ScanFace;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2 px-4">
      <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-sky-200 backdrop-blur">
        <ShieldCheck className="h-3.5 w-3.5" /> ยืนยันว่าเป็นใบหน้าจริง
      </span>
      {!dark && (
        <div key={live.step} className="bounce-in flex items-center gap-3 rounded-3xl bg-white/95 py-2.5 pr-5 pl-3 text-ink shadow-xl">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-100 text-sky-600">
            <Icon className={`h-6 w-6 ${move ? MOVE_ANIM[move] : ""}`} strokeWidth={2.4} />
          </span>
          <span>
            <b className="block text-base">{prompt(live)}</b>
            <span className="text-xs text-muted">{live.failed || (move ? (move === "blink" ? "หลับตาแล้วลืมตา 1 ครั้ง" : "ค้างไว้แป๊บหนึ่ง") : "ให้ใบหน้าอยู่กลางกรอบ")}</span>
          </span>
        </div>
      )}
      <div className="flex gap-1.5">
        {live.plan.map((m, i) => (
          <span key={i} className={`h-1.5 w-6 rounded-full transition-colors ${i < live.step ? "bg-emerald-400" : i === live.step ? "bg-sky-400" : "bg-white/35"}`} />
        ))}
      </div>
    </div>
  );
}

/** Big warning when the face is too dark to judge (and to analyse skin). */
function DarkWarning({ screenLight, onToggle }: { screenLight: boolean; onToggle: () => void }) {
  return (
    <div className="absolute inset-x-4 bottom-4 rounded-3xl bg-amber-400 p-4 text-amber-950 shadow-2xl">
      <p className="flex items-center gap-2 text-base font-bold">
        <Sun className="h-5 w-5" /> แสงไม่พอ
      </p>
      <p className="mt-1 text-sm">หันหน้าเข้าหาหน้าต่างหรือโคมไฟ ไม่ให้แสงอยู่ด้านหลัง {screenLight ? "· เปิดไฟหน้าจออยู่" : ""}</p>
      {!screenLight && (
        <button className="mt-2.5 flex items-center gap-1.5 rounded-full bg-amber-950 px-4 py-2 text-sm font-semibold text-amber-50" onClick={onToggle}>
          <Lightbulb className="h-4 w-4" /> เปิดไฟหน้าจอ
        </button>
      )}
    </div>
  );
}
