"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleCheck, ClipboardList, Flame, House, PartyPopper, SkipForward, Sun, Timer, X } from "lucide-react";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { SLOT_ICON, SLOT_LABEL, beep, vibrate } from "@/lib/util";
import { allPhotos } from "@/lib/photos";
import Confetti from "@/components/Confetti";
import HoldTimer from "@/components/HoldTimer";
import TypeTag from "@/components/TypeTag";
import { StepChips, productIcon } from "@/components/StepIcon";
import { Empty, IconTile } from "@/components/ui";
import type { Slot } from "@/lib/types";

export default function FocusPage() {
  return (
    <Suspense>
      <Focus />
    </Suspense>
  );
}

function useWakeLock() {
  useEffect(() => {
    let lock: any = null;
    const req = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request("screen");
      } catch {}
    };
    req();
    const onVis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release?.().catch(() => {});
    };
  }, []);
}

function Focus() {
  const params = useParams<{ slot: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { ready, info, today, settings, now, checks, setCheck, streak, snap } = useData();
  const raw = params.slot;
  const slot: Slot = raw === "am" || raw === "pm" ? raw : core.logicalMinutes(now, settings) < 15 * 60 ? "am" : "pm";
  const [idx, setIdx] = useState(0);
  const [holdDone, setHoldDone] = useState<Record<number, boolean>>({});
  const [leaveAt, setLeaveAt] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(search.get("celebrate") === "1");
  const [redo, setRedo] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const go = (n: number) => {
    setDir(n > idx ? 1 : -1);
    setIdx(n);
  };
  const touchX = useRef<number | null>(null);
  useWakeLock();

  if (!ready) return null;
  if (!info)
    return (
      <Empty icon={ClipboardList} title="ยังไม่มีตารางสำหรับวันนี้">
        <Link href="/schedule" className="btn-primary">
          ไปหน้าตาราง
        </Link>
      </Empty>
    );

  const steps: any[] = info[slot];
  const done = checks.has(core.ckey(today, slot));

  if (celebrate) return <Celebrate slot={slot} streak={streak.current} leaveAt={leaveAt} onHome={() => router.push("/")} />;

  if (done && !redo)
    return (
      <Shell slot={slot} info={info}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="pop grid h-24 w-24 place-items-center rounded-full bg-emerald-50 text-emerald-500">
            <CircleCheck className="h-12 w-12" strokeWidth={1.8} />
          </span>
          <p className="text-xl font-semibold">ทา{SLOT_LABEL[slot]}แล้ววันนี้</p>
          <div className="flex gap-2">
            <button className="btn-plain" onClick={() => setRedo(true)}>
              ดูขั้นตอนอีกครั้ง
            </button>
            <Link href="/" className="btn-primary">
              <House className="h-4 w-4" /> หน้าแรก
            </Link>
          </div>
        </div>
      </Shell>
    );

  const step = steps[idx];
  const isLast = idx === steps.length - 1;
  const blocked = step?.timer?.kind === "hold" && !holdDone[idx];
  const Icon = productIcon(step);

  const finish = async () => {
    if (done) return setCelebrate(true);
    if (info.photoDay && settings.requirePhoto) {
      const hasPhoto =
        snap.skinLogs.some((l) => l.date === today && l.photo_angles?.length) || (await allPhotos()).some((p) => p.date === today);
      if (!hasPhoto) return router.push(`/photos/capture?checkin=${slot}`);
    }
    setCheck(today, slot, true);
    setCelebrate(true);
  };
  const next = () => {
    if (blocked) return;
    vibrate(30);
    if (step?.timer?.kind === "before") setLeaveAt(Date.now() + step.timer.min * 60e3);
    if (isLast) finish();
    else go(idx + 1);
  };

  return (
    <Shell slot={slot} info={info} idx={idx} total={steps.length}>
      <div
        className="flex flex-1 flex-col"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (dx > 80) next();
          else if (dx < -80 && idx > 0) go(idx - 1);
        }}
      >
        <div key={idx} className={`${dir > 0 ? "slide-right" : "slide-left"} card mt-5 flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center`}>
          <span className="relative">
            <span className="absolute inset-0 -m-3 rounded-full bg-brand-100/70 blur-xl" />
            <span className="float relative block"><IconTile icon={Icon} size={104} className="relative rounded-[34px] bg-linear-to-br from-brand-50 to-brand-200" /></span>
          </span>
          {step.category && <span className="chip mt-2 bg-brand-50 px-3 py-1 text-xs text-brand-600">{step.category}</span>}
          <h2 className="text-[28px] leading-tight font-bold">{step.name}</h2>
          {step.product !== step.name && <p className="-mt-1 text-sm text-muted">{step.product}</p>}
          <StepChips step={step} />
          {step.howto && <p className="max-w-xs text-[15px] text-ink/70">{step.howto}</p>}
          {step.timer?.kind === "hold" && (
            <HoldTimer
              key={idx}
              min={step.timer.min}
              max={step.timer.max}
              onMin={() => {
                setHoldDone((h) => ({ ...h, [idx]: true }));
                vibrate([300, 150, 300]);
                beep(3);
              }}
              onMax={() => {
                vibrate([500, 200, 500]);
                beep(4);
              }}
            />
          )}
          {step.timer?.kind === "before" && (
            <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-left text-sm text-amber-800">
              <Timer className="h-4 w-4 shrink-0" /> รอ {step.timer.min}–{step.timer.max} นาทีก่อนออกแดด — ติ๊กแล้วจะเริ่มนับให้
            </p>
          )}
        </div>
        <div className="mt-5 flex gap-2">
          <button className="icon-btn h-14 w-14 disabled:opacity-40" aria-label="ย้อน" disabled={idx === 0} onClick={() => go(idx - 1)}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          {blocked ? (
            <button className="btn-ghost flex-1 py-4" onClick={() => setHoldDone((h) => ({ ...h, [idx]: true }))}>
              <SkipForward className="h-4 w-4" /> ข้ามตัวจับเวลา
            </button>
          ) : (
            <button className="btn-primary shine flex-1 py-4 text-base" onClick={next}>
              {isLast ? (
                <>
                  <Check className="h-5 w-5" strokeWidth={2.5} /> ทาครบแล้ว
                </>
              ) : (
                <>
                  ทาแล้ว <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted">ปัดขวา = ทาแล้ว · ปัดซ้าย = ย้อน</p>
      </div>
    </Shell>
  );
}

function Shell({ slot, info, idx, total, children }: { slot: Slot; info: any; idx?: number; total?: number; children: React.ReactNode }) {
  const SlotIcon = SLOT_ICON[slot];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-linear-to-b from-brand-100/80 to-transparent" />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex items-center justify-between">
          <Link href="/" className="icon-btn" aria-label="ปิด">
            <X className="h-5 w-5" />
          </Link>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 font-semibold">
              <SlotIcon className="h-4 w-4 text-brand-500" /> {SLOT_LABEL[slot]} · วัน {info.n}/{info.len}
            </div>
            {slot === "pm" && info.type && <TypeTag type={info.type} label={info.typeLabel} small />}
          </div>
          <span className="w-11 text-right text-sm font-semibold text-brand-500 tabular-nums">{total ? `${(idx ?? 0) + 1}/${total}` : ""}</span>
        </div>
        {total ? (
          <div className="mt-4 flex gap-1.5">
            {Array.from({ length: total }, (_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i <= (idx ?? 0) ? "bg-brand-500" : "bg-brand-100"}`} />
            ))}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function Celebrate({ slot, streak, leaveAt, onHome }: { slot: Slot; streak: number; leaveAt: number | null; onHome: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    vibrate([80, 60, 80]);
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const left = leaveAt ? Math.max(0, leaveAt - Date.now()) : 0;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <Confetti />
      <span className="pop grid h-28 w-28 place-items-center rounded-full text-white shadow-glow" style={{ background: "linear-gradient(135deg,#fb7a98,#f1557a)" }}>
        <PartyPopper className="h-14 w-14" strokeWidth={1.6} />
      </span>
      <h1 className="text-2xl font-bold">ทา{SLOT_LABEL[slot]}ครบแล้ว!</h1>
      <p className="chip bg-orange-50 px-3 py-1.5 text-base text-orange-600">
        <Flame className="h-4 w-4" /> streak {streak} วัน
      </p>
      {leaveAt && (
        <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2 text-amber-800">
          <Sun className="h-4 w-4" />
          {left > 0 ? (
            <>
              ออกจากบ้านได้ใน{" "}
              <b className="tabular-nums">
                {Math.floor(left / 60e3)}:{String(Math.floor((left / 1000) % 60)).padStart(2, "0")}
              </b>
            </>
          ) : (
            "กันแดดพร้อมแล้ว ออกจากบ้านได้เลย"
          )}
        </p>
      )}
      <button className="btn-primary mt-4 px-8" onClick={onHome}>
        <House className="h-4 w-4" /> กลับหน้าแรก
      </button>
    </div>
  );
}
