"use client";
import { Camera, CircleCheck, ImagePlus, Timer, X } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { ANGLE_LABEL, allPhotos, fileToImage, requestPersist, resizeToJpeg, savePhoto, type Angle, type Photo } from "@/lib/photos";
import { analyzePhoto, preloadAnalyzer } from "@/lib/skinAnalysis";
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
    if (settings.autoAnalyze) preloadAnalyzer();
  }, [settings.autoAnalyze]);

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
      await upsertSkinLog({
        ...(log || { date: today, acne: null, oil: null, irritation: null, overall: null, note: null, photo_angles: [] }),
        photo_angles: Array.from(new Set([...(log?.photo_angles || []), ...saved.current])),
      });
      setPhase("score");
    }
  };

  const shoot = () => {
    let n = 3;
    setCount(n);
    const t = setInterval(async () => {
      n--;
      if (n > 0) return setCount(n);
      clearInterval(t);
      setCount(null);
      const v = videoRef.current!;
      const r = await resizeToJpeg(v, v.videoWidth, v.videoHeight, true);
      await store(r.blob, r.width, r.height);
    }, 1000);
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    const img = await fileToImage(f);
    const r = await resizeToJpeg(img, img.naturalWidth, img.naturalHeight);
    await store(r.blob, r.width, r.height);
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
            <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            {ghost[angle] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ghost[angle]} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity }} />
            )}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[62%] w-[62%] max-w-xs rounded-[50%] border-4 border-dashed border-white/70" />
            </div>
            {count !== null && <div className="absolute inset-0 grid place-items-center text-8xl font-bold drop-shadow-lg">{count}</div>}
            <p className="absolute inset-x-0 top-2 text-center text-sm text-white/80 drop-shadow">ถ่ายที่เดิม แสงเดิม ไม่แต่งหน้า หลังล้างหน้า</p>
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
            <label className="cursor-pointer text-sm text-gray-300 underline">
              เลือกไฟล์
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <button aria-label="ถ่าย" disabled={count !== null} className="grid h-20 w-20 place-items-center rounded-full border-4 border-white bg-brand-500 active:scale-95" onClick={shoot} />
            <span className="flex items-center gap-1 text-sm text-muted"><Timer className="h-4 w-4" /> 3 วิ</span>
          </div>
        </div>
      )}
    </div>
  );
}
