"use client";
import { useState } from "react";
import * as core from "@/lib/core.js";
import type { SkinLog } from "@/lib/types";

const SERIES: [keyof SkinLog, string, string][] = [
  ["acne", "สิว", "#ef4444"],
  ["oil", "ความมัน", "#f59e0b"],
  ["irritation", "แสบ/แดง", "#8b5cf6"],
  ["overall", "พอใจ", "#10b981"],
];

/** Hand-rolled SVG line chart of the 1–5 self scores. Blue bands = days in "sensitive skin" mode. */
export default function ScoreChart({ logs, sensitive }: { logs: SkinLog[]; sensitive: { from: string; to: string }[] }) {
  const [hide, setHide] = useState<Set<string>>(new Set());
  const rows = logs.filter((l) => SERIES.some(([k]) => l[k] != null)).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2) return <p className="py-10 text-center text-muted">ให้คะแนนผิวอย่างน้อย 2 วันเพื่อดูกราฟ</p>;

  const W = 360, H = 200, P = { l: 22, r: 8, t: 10, b: 24 };
  const first = rows[0].date, last = rows[rows.length - 1].date;
  const span = Math.max(1, core.diffDays(last, first));
  const x = (d: string) => P.l + (core.diffDays(d, first) / span) * (W - P.l - P.r);
  const y = (v: number) => P.t + ((5 - v) / 4) * (H - P.t - P.b);

  return (
    <div className="card">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {sensitive
          .filter((s) => s.to >= first && s.from <= last)
          .map((s, i) => {
            const a = x(s.from < first ? first : s.from), b = x(s.to > last ? last : s.to);
            return <rect key={i} x={a - 3} y={P.t} width={Math.max(6, b - a + 6)} height={H - P.t - P.b} fill="#e0f2fe" />;
          })}
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#f3f4f6" />
            <text x={P.l - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="#9ca3af">
              {v}
            </text>
          </g>
        ))}
        {[first, last].map((d, i) => (
          <text key={i} x={x(d)} y={H - 6} fontSize="10" textAnchor={i ? "end" : "start"} fill="#9ca3af">
            {d.slice(5).split("-").reverse().join("/")}
          </text>
        ))}
        {SERIES.filter(([k]) => !hide.has(k)).map(([k, , color]) => {
          const pts = rows.filter((r) => r[k] != null).map((r) => [x(r.date), y(r[k] as number)]);
          return (
            <g key={k}>
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
              {pts.map(([a, b], i) => (
                <circle key={i} cx={a} cy={b} r="2.5" fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {SERIES.map(([k, label, color]) => (
          <button key={k} className={`flex items-center gap-1 ${hide.has(k) ? "opacity-40" : ""}`} onClick={() => setHide((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; })}>
            <span className="inline-block h-2 w-3 rounded" style={{ background: color }} />
            {label}
          </button>
        ))}
        <span className="flex items-center gap-1 text-muted">
          <span className="inline-block h-2 w-3 rounded bg-sky-100" /> โหมดผิวแสบ
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted">สิว/มัน/แสบ: ต่ำ = ดี · พอใจ: สูง = ดี</p>
    </div>
  );
}
