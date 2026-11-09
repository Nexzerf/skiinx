"use client";
import { useEffect, useState } from "react";
import { thDate } from "@/lib/util";
import { Pause, Play } from "lucide-react";

export default function Timelapse({ photos }: { photos: { url: string; date: string; cycleDay: number | null }[] }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % photos.length), 500);
    return () => clearInterval(t);
  }, [playing, photos.length]);
  if (photos.length < 2) return <p className="py-10 text-center text-muted">ต้องมีรูปหน้าตรงอย่างน้อย 2 รูป</p>;
  const p = photos[Math.min(i, photos.length - 1)];
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt="" className="w-full" />
        <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 text-sm text-white">
          {thDate(p.date)} · วัน {p.cycleDay ?? "?"}
        </span>
      </div>
      <input type="range" className="w-full" min={0} max={photos.length - 1} value={i} onChange={(e) => setI(+e.target.value)} />
      <button className="btn-primary w-full" onClick={() => setPlaying(!playing)}>
        {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />} {playing ? "หยุด" : "เล่น"} ({i + 1}/{photos.length})
      </button>
    </div>
  );
}
