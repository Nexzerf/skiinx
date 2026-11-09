"use client";
// Launch screen shown while the app restores your session and data. Fades out once ready
// (kept on screen for a short minimum so it never just flickers).
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

export default function Splash({ done, onGone }: { done: boolean; onGone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!done) return;
    setLeaving(true);
    const t = setTimeout(onGone, 450);
    return () => clearTimeout(t);
  }, [done, onGone]);

  return (
    <div
      role="status"
      aria-label="กำลังเปิด Skiinx"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas transition-opacity duration-450 ${leaving ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      {/* soft glow blobs */}
      <div className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -bottom-24 h-80 w-80 rounded-full bg-brand-100/70 blur-3xl" />

      <div className={`relative flex flex-col items-center transition-transform duration-450 ${leaving ? "scale-105" : "scale-100"}`}>
        <span className="splash-logo relative grid h-24 w-24 place-items-center rounded-[30px] text-white shadow-glow" style={{ background: "linear-gradient(135deg,#ff9fb6,#f1557a)" }}>
          <Sparkles className="h-11 w-11" strokeWidth={1.8} />
          <span className="absolute inset-0 rounded-[30px] ring-2 ring-white/40" />
        </span>
        <Sparkles className="twinkle absolute -top-3 -right-6 h-5 w-5 text-brand-300" />
        <Sparkles className="twinkle absolute top-10 -left-8 h-3.5 w-3.5 text-brand-300" style={{ animationDelay: "0.9s" }} />
        <h1 className="splash-word mt-6 text-3xl font-bold tracking-tight text-brand-500">Skiinx</h1>
        <p className="splash-word mt-1 text-sm text-muted" style={{ animationDelay: "0.12s" }}>
          ดูแลผิวทุกวัน ไม่ต้องจำเอง
        </p>
        <div className="mt-8 h-1 w-28 overflow-hidden rounded-full bg-brand-100">
          <div className="splash-bar h-full w-1/2 rounded-full bg-linear-to-r from-brand-300 to-brand-500" />
        </div>
      </div>
    </div>
  );
}
