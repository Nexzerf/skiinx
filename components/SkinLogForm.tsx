"use client";
import { useState } from "react";
import { useData } from "@/lib/data";
import type { SkinLog } from "@/lib/types";

const FIELDS: [keyof SkinLog, string, string][] = [
  ["acne", "จำนวนสิว", "1 = แทบไม่มี · 5 = เยอะมาก"],
  ["oil", "ความมัน", "1 = แห้ง/ปกติ · 5 = มันมาก"],
  ["irritation", "แสบ/แดง", "1 = ไม่มี · 5 = แสบมาก"],
  ["overall", "พอใจโดยรวม", "1 = แย่ · 5 = ดีมาก"],
];

/** Self-rated skin score 1–5 (no AI). Small data → synced to Supabase in cloud mode. */
export default function SkinLogForm({ date, onDone }: { date: string; onDone?: () => void }) {
  const { snap, upsertSkinLog } = useData();
  const existing = snap.skinLogs.find((l) => l.date === date);
  const [v, setV] = useState<SkinLog>(
    existing || { date, acne: null, oil: null, irritation: null, overall: null, note: "", photo_angles: [] },
  );
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-3">
      {FIELDS.map(([k, label, hint]) => (
        <div key={k}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">{label}</span>
            <span className="text-[11px] text-muted">{hint}</span>
          </div>
          <div className="mt-1 grid grid-cols-5 gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`rounded-lg py-1.5 text-sm ${v[k] === n ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-600"}`} onClick={() => setV((p) => ({ ...p, [k]: n }))}>
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
      <input className="input" placeholder="โน้ต เช่น นอนดึก, ใกล้มีประจำเดือน" value={v.note || ""} onChange={(e) => { const note = e.target.value; setV((p) => ({ ...p, note })); }} />
      <button
        className="btn-primary w-full"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          // merge onto the newest row so photo metadata / analysis saved meanwhile is kept
          const latest = snap.skinLogs.find((l) => l.date === date);
          await upsertSkinLog({
            ...(latest || v),
            acne: v.acne, oil: v.oil, irritation: v.irritation, overall: v.overall, note: v.note,
            photo_angles: latest?.photo_angles || v.photo_angles,
          });
          setSaving(false);
          onDone?.();
        }}
      >
        บันทึกคะแนน
      </button>
    </div>
  );
}
