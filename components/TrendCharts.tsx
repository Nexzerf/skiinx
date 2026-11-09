"use client";
// Each on-device metric drawn next to the matching self-rated score (1–5), so you can see
// whether "what the camera measures" and "how it feels" move together.
import { CircleDot, Droplets, Flame, type LucideIcon } from "lucide-react";
import * as core from "@/lib/core.js";
import type { SkinLog } from "@/lib/types";
import { IconTile } from "./ui";

type Spec = { key: string; title: string; icon: LucideIcon; unit: string; get: (ai: any) => number | null; self: keyof SkinLog; selfLabel: string };
const SPECS: Spec[] = [
  { key: "red", title: "ความแดง", icon: Flame, unit: "a*", get: (ai) => ai?.redness?.mean ?? null, self: "irritation", selfLabel: "แสบ/แดง (ให้เอง)" },
  { key: "spots", title: "จุดแดง / สิว", icon: CircleDot, unit: "จุด", get: (ai) => ai?.spots?.total ?? null, self: "acne", selfLabel: "สิว (ให้เอง)" },
  { key: "oil", title: "ความมัน", icon: Droplets, unit: "%", get: (ai) => ai?.oil ?? null, self: "oil", selfLabel: "ความมัน (ให้เอง)" },
];

function Dual({ spec, logs }: { spec: Spec; logs: SkinLog[] }) {
  const ai = logs.filter((l) => spec.get(l.ai) != null);
  const mine = logs.filter((l) => l[spec.self] != null);
  const dates = [...ai, ...mine].map((l) => l.date).sort();
  if (ai.length < 2) return null;
  const first = dates[0], last = dates[dates.length - 1];
  const W = 340, H = 150, P = { l: 30, r: 26, t: 12, b: 22 };
  const span = Math.max(1, core.diffDays(last, first));
  const x = (d: string) => P.l + (core.diffDays(d, first) / span) * (W - P.l - P.r);
  const vals = ai.map((l) => spec.get(l.ai)!);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const pad = (hi - lo) * 0.15;
  lo = Math.max(0, lo - pad); hi += pad; // all metrics are ≥ 0
  const yA = (v: number) => P.t + ((hi - v) / (hi - lo)) * (H - P.t - P.b);
  const yS = (v: number) => P.t + ((5 - v) / 4) * (H - P.t - P.b);
  const aiPts = ai.map((l) => [x(l.date), yA(spec.get(l.ai)!)]);
  const myPts = mine.map((l) => [x(l.date), yS(l[spec.self] as number)]);
  const area = `M${aiPts[0][0]},${H - P.b} ` + aiPts.map((p) => `L${p[0]},${p[1]}`).join(" ") + ` L${aiPts[aiPts.length - 1][0]},${H - P.b} Z`;
  const latest = vals[vals.length - 1], before = vals[vals.length - 2];
  const Icon = spec.icon;
  return (
    <section className="card space-y-2">
      <div className="flex items-center gap-2.5">
        <IconTile icon={Icon} size={34} className="rounded-xl" />
        <div className="flex-1">
          <p className="font-semibold">{spec.title}</p>
          <p className="text-xs text-muted">
            ล่าสุด {latest} {spec.unit} · ครั้งก่อน {before} {spec.unit}
          </p>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id={`g-${spec.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f1557a" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f1557a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={yS(v)} y2={yS(v)} stroke="#f6eef1" />
            <text x={W - P.r + 6} y={yS(v) + 3.5} fontSize="9" fill="#a78bfa">
              {v}
            </text>
          </g>
        ))}
        <text x={P.l - 6} y={P.t + 4} fontSize="9" textAnchor="end" fill="#f1557a">
          {Math.round(hi * 10) / 10}
        </text>
        <text x={P.l - 6} y={H - P.b} fontSize="9" textAnchor="end" fill="#f1557a">
          {Math.round(lo * 10) / 10}
        </text>
        <path d={area} fill={`url(#g-${spec.key})`} />
        <polyline className="draw" style={{ ["--len" as any]: 900 }} points={aiPts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#f1557a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {aiPts.map(([a, b], i) => (
          <circle key={i} cx={a} cy={b} r="3.5" fill="#fff" stroke="#f1557a" strokeWidth="2" />
        ))}
        {myPts.length > 1 && (
          <polyline points={myPts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#a78bfa" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
        )}
        {myPts.map(([a, b], i) => (
          <rect key={i} x={a - 3} y={b - 3} width="6" height="6" rx="1.5" fill="#a78bfa" />
        ))}
        {[first, last].map((d, i) => (
          <text key={i} x={x(d)} y={H - 6} fontSize="9" textAnchor={i ? "end" : "start"} fill="#8b8090">
            {d.slice(5).split("-").reverse().join("/")}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-brand-500" /> วัดจากรูป ({spec.unit})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed border-violet-400" /> {spec.selfLabel} 1–5
        </span>
      </div>
    </section>
  );
}

export default function TrendCharts({ logs }: { logs: SkinLog[] }) {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const analysed = sorted.filter((l) => l.ai).length;
  if (analysed < 2)
    return (
      <p className="rounded-2xl bg-canvas p-4 text-center text-sm text-muted">
        กราฟแนวโน้มจากรูปจะแสดงเมื่อวิเคราะห์ได้อย่างน้อย 2 ครั้ง ({analysed}/2)
      </p>
    );
  return (
    <div className="space-y-3">
      {SPECS.map((s) => (
        <Dual key={s.key} spec={s} logs={sorted} />
      ))}
    </div>
  );
}
