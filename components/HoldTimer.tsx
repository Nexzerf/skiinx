"use client";
import { useEffect, useRef, useState } from "react";
import { Timer, TriangleAlert } from "lucide-react";

/** Circular countdown for "hold" steps (e.g. a 10–15 min mask). Fires onMin at `min`, onMax at `max`. */
export default function HoldTimer({ min, max, onMin, onMax }: { min: number; max: number; onMin: () => void; onMax: () => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const fired = useRef({ min: false, max: false });

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt]);

  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
  useEffect(() => {
    if (!startedAt) return;
    if (!fired.current.min && elapsed >= min * 60) {
      fired.current.min = true;
      onMin();
    }
    if (!fired.current.max && max > min && elapsed >= max * 60) {
      fired.current.max = true;
      onMax();
    }
  }, [elapsed, startedAt, min, max, onMin, onMax]);

  if (!startedAt)
    return (
      <button className="btn-primary mt-2 px-6 py-3 text-lg" onClick={() => setStartedAt(Date.now())}>
        <Timer className="h-5 w-5" /> เริ่มจับเวลา {min} นาที
      </button>
    );

  const remain = Math.max(0, min * 60 - elapsed);
  const R = 70, L = 2 * Math.PI * R;
  const frac = Math.min(1, elapsed / (min * 60));
  const overMax = max > min && elapsed >= max * 60;
  const reached = elapsed >= min * 60;
  const show = reached ? elapsed - min * 60 : remain;
  return (
    <div className="mt-2 flex flex-col items-center">
      <svg width="170" height="170" viewBox="0 0 170 170">
        <circle cx="85" cy="85" r={R} fill="none" stroke="#ffe3ea" strokeWidth="12" />
        <circle
          cx="85" cy="85" r={R} fill="none" stroke={overMax ? "#ef4444" : reached ? "#10b981" : "#f1557a"} strokeWidth="12"
          strokeDasharray={L} strokeDashoffset={L * (1 - frac)} strokeLinecap="round" transform="rotate(-90 85 85)"
        />
        <text x="85" y="92" textAnchor="middle" className="fill-[#2b2230] text-3xl font-bold tabular-nums">
          {reached ? "+" : ""}
          {Math.floor(show / 60)}:{String(Math.floor(show % 60)).padStart(2, "0")}
        </text>
      </svg>
      <p className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${overMax ? "text-red-600" : reached ? "text-emerald-600" : "text-brand-600"}`}>
        {overMax && <TriangleAlert className="h-4 w-4" />}
        {overMax ? "ลอกมาสก์ได้แล้ว! (เกิน " + max + " นาที)" : reached ? `ครบ ${min} นาที — ไปขั้นต่อไปได้ (ไม่เกิน ${max} นาที)` : `รอให้ครบ ${min}–${max} นาที`}
      </p>
    </div>
  );
}
