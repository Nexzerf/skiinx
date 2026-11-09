"use client";
import { Flame, Sparkles, TrendingUp } from "lucide-react";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";

const SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** Gradient hero: streak + the last 7 days' completion as a tiny line chart. */
export default function StreakHero() {
  const { today, streak, checks, snap } = useData();
  const start = core.addDays(today, -6);
  const days = Array.from({ length: 7 }, (_, i) => core.addDays(start, i));
  // only count days since the first schedule started
  const first = snap.schedules.filter((s) => s.enabled).map((s) => s.start_date).sort()[0] || today;
  const stats = core.periodStats(start < first ? first : start, today, checks);
  const vals = days.map((d) => (d > today || d < first ? null : (checks.has(core.ckey(d, "am")) ? 1 : 0) + (checks.has(core.ckey(d, "pm")) ? 1 : 0)));
  const W = 320, H = 64;
  const x = (i: number) => 10 + (i * (W - 20)) / 6;
  const y = (v: number) => H - 10 - (v / 2) * (H - 22);
  const pts = vals.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean) as number[][];
  const lastScore = [...snap.skinLogs].reverse().find((l) => l.overall != null);

  const msg =
    streak.current >= 7 ? "สุดยอด! ผิวขอบคุณมากเลย" : streak.current >= 3 ? "ดีมาก ทำต่อเนื่องแบบนี้นะ" : streak.current > 0 ? "เริ่มต้นได้ดี ไปต่อกัน" : "เริ่มนับ streak ใหม่วันนี้";

  return (
    <section className="hero">
      <Sparkles className="float absolute top-24 left-[46%] h-9 w-9 text-white/25" />
      <Sparkles className="twinkle absolute top-3 left-[38%] h-4 w-4 text-white/60" style={{ animationDelay: "0.8s" }} />
      <Sparkles className="twinkle absolute right-6 bottom-16 h-5 w-5 text-white/50" style={{ animationDelay: "1.6s" }} />
      <div className="float absolute -right-10 -bottom-12 h-40 w-40 rounded-full bg-white/10" style={{ animationDuration: "9s" }} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium tracking-wider text-white/80 uppercase">Streak</p>
          <p className="mt-1 flex items-end gap-1.5">
            <span key={streak.current} className="bounce-in text-5xl leading-none font-bold">{streak.current}</span>
            <span className="mb-1 text-lg text-white/85">วัน</span>
          </p>
          <p className="mt-2 text-sm text-white/90">{msg}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="chip bg-white py-1 text-xs text-brand-600">
            <TrendingUp className="h-3.5 w-3.5" /> ทาครบ {stats.rate}% · 7 วัน
          </span>
          <span className="chip bg-white/20 py-1 text-xs text-white">
            <Flame className="h-3.5 w-3.5" /> สูงสุด {streak.best} วัน
          </span>
          {lastScore && <span className="chip bg-white/20 py-1 text-xs text-white">คะแนนผิว {lastScore.overall}/5</span>}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="relative mt-3 w-full">
        <polyline className="draw" style={{ ["--len" as any]: 700 }} points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([a, b], i) => (
          <circle key={i} cx={a} cy={b} r={i === pts.length - 1 ? 5 : 3.5} fill="white" className="pop-i" style={{ ["--i" as any]: i + 6, transformOrigin: `${a}px ${b}px` }} />
        ))}
      </svg>
      <div className="relative mt-1 flex justify-between px-[2px] text-[11px] text-white/80">
        {days.map((d) => (
          <span key={d} className={`grid h-6 w-6 place-items-center rounded-full ${d === today ? "bg-white font-semibold text-brand-500" : ""}`}>
            {SHORT[core.weekdayOf(d)]}
          </span>
        ))}
      </div>
    </section>
  );
}
