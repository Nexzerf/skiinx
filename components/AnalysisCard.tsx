"use client";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BadgeCheck, CircleDot, Droplets, Flame, LoaderCircle, Minus, ScanFace, SunDim, TriangleAlert, type LucideIcon } from "lucide-react";
import { REGION_LABEL, SKIN_REGIONS, deltas, type SkinMetrics } from "@/lib/skinMetrics.js";
import { IconTile } from "./ui";

/** Blob → object URL that is revoked when the component goes away. */
export function useBlobUrls(blobs?: Record<string, Blob>) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!blobs) return setUrls({});
    const u = Object.fromEntries(Object.entries(blobs).map(([k, b]) => [k, URL.createObjectURL(b)]));
    setUrls(u);
    return () => Object.values(u).forEach((x) => URL.revokeObjectURL(x));
  }, [blobs]);
  return urls;
}

function Delta({ v, unit = "", goodWhenDown = true }: { v: number | null | undefined; unit?: string; goodWhenDown?: boolean }) {
  if (v == null) return null;
  if (Math.abs(v) < 0.05) return <span className="chip bg-gray-50 text-muted"><Minus className="h-3 w-3" /> เท่าเดิม</span>;
  const down = v < 0;
  const good = down === goodWhenDown;
  const Icon = down ? ArrowDownRight : ArrowUpRight;
  return (
    <span className={`chip ${good ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"}`}>
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {Math.abs(v)}
      {unit}
    </span>
  );
}

function Stat({ icon, label, value, unit, delta, hint }: { icon: LucideIcon; label: string; value: string; unit?: string; delta?: React.ReactNode; hint: string }) {
  return (
    <div className="rounded-2xl bg-canvas p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <IconTile icon={icon} size={24} className="rounded-lg bg-white" />
        {label}
      </div>
      <p className="mt-1.5 text-xl leading-none font-bold">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted">{unit}</span>}
      </p>
      <div className="mt-1.5 flex min-h-5 items-center">{delta}</div>
      <p className="text-[10px] leading-tight text-muted">{hint}</p>
    </div>
  );
}

export default function AnalysisCard({
  metrics,
  prev,
  regions,
  state = "done",
  error,
}: {
  metrics?: SkinMetrics | null;
  prev?: SkinMetrics | null;
  regions?: Record<string, Blob>;
  state?: "loading" | "done" | "error";
  error?: string;
}) {
  const urls = useBlobUrls(regions);
  const d = deltas(metrics, prev);
  return (
    <section className="card rise space-y-3">
      <div className="flex items-center gap-3">
        <IconTile icon={ScanFace} size={40} className="rounded-xl bg-linear-to-br from-brand-50 to-brand-200" />
        <div className="flex-1">
          <p className="font-semibold">วิเคราะห์ผิวในเครื่อง</p>
          <p className="text-xs text-muted">ใช้ดูแนวโน้มเทียบกับครั้งก่อน ไม่ใช่การวินิจฉัย</p>
        </div>
      </div>

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-canvas py-8 text-sm text-muted">
          <LoaderCircle className="h-5 w-5 animate-spin text-brand-400" /> กำลังวิเคราะห์บนเครื่อง…
        </div>
      )}
      {state === "error" && (
        <div className="flex items-start gap-2 rounded-2xl bg-orange-50 p-3 text-sm text-orange-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error || "วิเคราะห์ไม่สำเร็จ"}
        </div>
      )}

      {state === "done" && metrics && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={Flame} label="ความแดง" value={String(metrics.redness.mean ?? "–")} unit="a*" delta={<Delta v={d?.redness} />} hint="ต่ำลง = แดงน้อยลง" />
            <Stat icon={CircleDot} label="จุดแดง" value={String(metrics.spots.total)} unit="จุด" delta={<Delta v={d?.spots} />} hint="สิว / รอยแดงที่เห็นชัด" />
            <Stat icon={Droplets} label="ความมัน" value={String(metrics.oil ?? "–")} unit="%" delta={<Delta v={d?.oil} />} hint="จุดสะท้อนแสง T-zone" />
          </div>

          {Object.keys(urls).length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {SKIN_REGIONS.map((k, i) => (
                <figure key={k} className="pop-i overflow-hidden rounded-xl bg-canvas" style={{ ["--i" as any]: i }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {urls[k] && <img src={urls[k]} alt={REGION_LABEL[k]} className="aspect-square w-full object-cover" />}
                  <figcaption className="px-1 py-1 text-center text-[10px] leading-tight">
                    <span className="block font-medium">{REGION_LABEL[k]}</span>
                    <span className="text-muted">
                      a* {metrics.redness[k] ?? "–"} · {metrics.spots[k]} จุด
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {metrics.quality && (
            metrics.quality.warnings.length ? (
              <ul className="space-y-1 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
                {metrics.quality.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-1.5">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                <BadgeCheck className="h-4 w-4" /> รูปผ่านเกณฑ์ (หน้าตรง ชัด แสงพอ{metrics.quality.wb ? " ปรับสมดุลแสงจากตาขาวแล้ว" : ""})
              </p>
            )
          )}
          {metrics.spots.total > 0 && Object.keys(urls).length > 0 && (
            <p className="text-[11px] text-muted">วงสีชมพูในภาพ = จุดที่นับ</p>
          )}
          {d?.brightness != null && Math.abs(d.brightness) > 8 && (
            <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
              <SunDim className="h-4 w-4 shrink-0" /> แสงต่างจากรูปครั้งก่อนพอสมควร ตัวเลขอาจคลาดเคลื่อน — ถ่ายที่เดิม แสงเดิมจะเทียบได้แม่นกว่า
            </p>
          )}
        </>
      )}
    </section>
  );
}
