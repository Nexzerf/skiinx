"use client";
import { useRef, useState } from "react";
import { thDate } from "@/lib/util";

type P = { url: string; date: string; cycleDay: number | null };

export default function CompareSlider({ before, after }: { before: P; after: P }) {
  const [mode, setMode] = useState<"slider" | "side">("slider");
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const move = (x: number) => {
    const r = box.current!.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((x - r.left) / r.width) * 100)));
  };
  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2 text-sm">
        <button className={mode === "slider" ? "font-semibold text-brand-600" : "text-muted"} onClick={() => setMode("slider")}>
          เส้นแบ่ง
        </button>
        <button className={mode === "side" ? "font-semibold text-brand-600" : "text-muted"} onClick={() => setMode("side")}>
          วางคู่
        </button>
      </div>
      {mode === "side" ? (
        <div className="grid grid-cols-2 gap-1">
          {[before, after].map((p, i) => (
            <figure key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="w-full rounded-lg" />
              <figcaption className="text-center text-xs text-muted">
                {i ? "หลัง" : "ก่อน"} · {thDate(p.date, false)}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div
          ref={box}
          className="relative touch-none overflow-hidden rounded-xl select-none"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            move(e.clientX);
          }}
          onPointerMove={(e) => e.buttons && move(e.clientX)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={after.url} alt="" className="block w-full" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
          <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }}>
            <div className="absolute top-1/2 -left-4 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white text-xs shadow">⇆</div>
          </div>
          <span className="absolute top-2 left-2 rounded bg-black/50 px-1.5 text-xs text-white">ก่อน · {thDate(before.date, false)}</span>
          <span className="absolute top-2 right-2 rounded bg-black/50 px-1.5 text-xs text-white">หลัง · {thDate(after.date, false)}</span>
        </div>
      )}
    </div>
  );
}
