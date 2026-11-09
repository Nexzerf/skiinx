"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { ANGLE_LABEL, allPhotos, deletePhoto, type Photo } from "@/lib/photos";
import { thDate } from "@/lib/util";
import CompareSlider from "@/components/CompareSlider";
import Timelapse from "@/components/Timelapse";
import ScoreChart from "@/components/ScoreChart";
import SkinLogForm from "@/components/SkinLogForm";
import { Camera, CalendarClock, ChartLine, Columns2, Film, HardDriveDownload, Images, LoaderCircle, NotebookPen, ScanFace, Trash2, X } from "lucide-react";
import { analyzePhoto } from "@/lib/skinAnalysis";
import { REGION_LABEL, SKIN_REGIONS } from "@/lib/skinMetrics.js";
import AnalysisCard, { useBlobUrls } from "@/components/AnalysisCard";
import TrendCharts from "@/components/TrendCharts";
import { Empty, IconTile, PageTitle, Segmented } from "@/components/ui";

type Tab = "gallery" | "compare" | "timelapse" | "chart";

export default function PhotosPage() {
  const { ready, today, info, settings, snap, upsertSkinLog } = useData();
  const [busy, setBusy] = useState<string | null>(null); // "all" or a photo id being analysed
  const [aiError, setAiError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<(Photo & { url: string })[]>([]);
  const [tab, setTab] = useState<Tab>("gallery");
  const [picked, setPicked] = useState<string[]>([]);
  const [view, setView] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);

  const load = () =>
    allPhotos().then((ps) => {
      setPhotos((old) => {
        old.forEach((p) => URL.revokeObjectURL(p.url));
        return ps.map((p) => ({ ...p, url: URL.createObjectURL(p.blob) }));
      });
    });
  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).get("score")) setScoring(true);
  }, []);

  const rounds = useMemo(() => {
    const m = new Map<string, (Photo & { url: string })[]>();
    for (const p of [...photos].reverse()) {
      const k = p.round ? `รอบ ${p.round}` : "ไม่ระบุรอบ";
      m.set(k, [...(m.get(k) || []), p]);
    }
    return [...m.entries()];
  }, [photos]);

  if (!ready) return null;

  const analyze = async (p: Photo) => {
    const done = await analyzePhoto(p, { sensitivity: settings.spotSensitivity });
    if (p.angle === "front") {
      const log = snap.skinLogs.find((l) => l.date === p.date);
      await upsertSkinLog({ ...(log || { date: p.date, acne: null, oil: null, irritation: null, overall: null, note: null, photo_angles: ["front"] }), ai: done.ai });
    }
    return done;
  };
  const analyzeOne = async (p: Photo) => {
    setBusy(p.id);
    setAiError(null);
    try {
      await analyze(p);
      await load();
    } catch (e: any) {
      setAiError(e?.message || "วิเคราะห์ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };
  const pending = photos.filter((p) => p.angle === "front" && !p.ai);
  const analyzeAll = async () => {
    setBusy("all");
    setAiError(null);
    let failed = 0;
    for (const p of pending) await analyze(p).catch(() => failed++);
    await load();
    setBusy(null);
    if (failed) setAiError(`วิเคราะห์ไม่สำเร็จ ${failed} รูป (ไม่พบใบหน้า)`);
  };

  const needBackup = photos.length > 0 && (!settings.lastExportAt || core.diffDays(today, settings.lastExportAt) >= 30);
  const nextPhotoDay = (() => {
    for (let i = 0; i < 60; i++) {
      const d = core.addDays(today, i);
      const inf = core.dayInfo(d, snap.schedules.filter((s) => s.enabled), settings);
      if (inf?.photoDay) return { d, n: inf.n };
    }
    return null;
  })();
  const pickedPhotos = picked.map((id) => photos.find((p) => p.id === id)!).filter(Boolean);
  const viewing = photos.find((p) => p.id === view);

  return (
    <div className="stagger space-y-4">
      <PageTitle
        title="รูปผิว"
        sub="รูปอยู่บนเครื่องนี้เท่านั้น ไม่ขึ้นคลาวด์"
        right={
          <Link href="/photos/capture" className="btn-primary px-4 py-2.5">
            <Camera className="h-4 w-4" /> ถ่ายรูป
          </Link>
        }
      />

      {needBackup && (
        <Link href="/settings" className="flex items-center gap-3 rounded-3xl bg-amber-50 p-3 text-sm text-amber-800">
          <IconTile icon={HardDriveDownload} size={38} className="rounded-xl bg-white text-amber-500" />
          <span>Export สำรองทุก 30 วัน — รูปอยู่ในเครื่องนี้เท่านั้น</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="card flex items-center gap-2.5 p-3">
          <IconTile icon={CalendarClock} size={38} className="rounded-xl" />
          <div className="min-w-0 text-xs">
            <p className="text-muted">ถ่ายครั้งถัดไป</p>
            <p className="truncate font-semibold">{info?.photoDay ? "วันนี้" : nextPhotoDay ? `${thDate(nextPhotoDay.d, false)} · วัน ${nextPhotoDay.n}` : "–"}</p>
          </div>
        </div>
        <button className={`card flex items-center gap-2.5 p-3 text-left ${scoring ? "ring-2 ring-brand-300" : ""}`} onClick={() => setScoring(!scoring)}>
          <IconTile icon={NotebookPen} size={38} className="rounded-xl" />
          <div className="text-xs">
            <p className="text-muted">บันทึกผิว</p>
            <p className="font-semibold text-brand-500">ให้คะแนนวันนี้</p>
          </div>
        </button>
      </div>
      {scoring && (
        <div className="card">
          <SkinLogForm date={today} onDone={() => setScoring(false)} />
        </div>
      )}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "gallery", label: "รูป", icon: Images },
          { value: "compare", label: "เทียบ", icon: Columns2 },
          { value: "timelapse", label: "แลปส์", icon: Film },
          { value: "chart", label: "กราฟ", icon: ChartLine },
        ]}
      />

      {tab === "gallery" &&
        (photos.length === 0 ? (
          <Empty icon={Camera} title="ยังไม่มีรูป" sub={`ถ่ายวันที่ ${settings.photoDays.join(", ")} ของแต่ละรอบ — ที่เดิม แสงเดิม หลังล้างหน้า`} />
        ) : (
          rounds.map(([label, list]) => (
            <div key={label}>
              <h2 className="mb-1 text-sm font-semibold text-muted">{label}</h2>
              <div className="grid grid-cols-3 gap-1.5">
                {list.map((p) => (
                  <button key={p.id} className="relative overflow-hidden rounded-2xl" onClick={() => setView(p.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="aspect-[3/4] w-full object-cover" />
                    {p.ai && (
                      <span className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-brand-500 shadow-soft">
                        <ScanFace className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-black/45 px-1 text-[10px] text-white">
                      {thDate(p.date, false)} · วัน {p.cycleDay ?? "?"} {p.angle !== "front" && `· ${ANGLE_LABEL[p.angle]}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))
        ))}

      {tab === "compare" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">เลือก 2 รูป (ก่อน → หลัง)</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {photos.map((p) => {
              const i = picked.indexOf(p.id);
              return (
                <button
                  key={p.id}
                  className={`relative shrink-0 overflow-hidden rounded-lg ${i >= 0 ? "ring-4 ring-brand-500" : ""}`}
                  onClick={() => setPicked(i >= 0 ? picked.filter((x) => x !== p.id) : [...picked.slice(-1), p.id])}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-24 w-18 object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/45 text-[10px] text-white">{thDate(p.date, false)}</span>
                  {i >= 0 && <span className="absolute top-0 left-0 bg-brand-500 px-1 text-xs text-white">{i === 0 ? "ก่อน" : "หลัง"}</span>}
                </button>
              );
            })}
          </div>
          {pickedPhotos.length === 2 && <CompareSlider before={pickedPhotos[0]} after={pickedPhotos[1]} />}
          {pickedPhotos.length === 2 && pickedPhotos[0].regions && pickedPhotos[1].regions && <RegionCompare a={pickedPhotos[0]} b={pickedPhotos[1]} />}
        </div>
      )}

      {tab === "timelapse" && <Timelapse photos={photos.filter((p) => p.angle === "front")} />}
      {tab === "chart" && (
        <div className="space-y-3">
          {pending.length > 0 && (
            <button className="btn-ghost w-full" disabled={!!busy} onClick={analyzeAll}>
              {busy === "all" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
              {busy === "all" ? "กำลังวิเคราะห์บนเครื่อง…" : `วิเคราะห์รูปที่ยังไม่ได้วิเคราะห์ (${pending.length})`}
            </button>
          )}
          {aiError && <p className="rounded-2xl bg-orange-50 p-3 text-sm text-orange-700">{aiError}</p>}
          <TrendCharts logs={snap.skinLogs} />
          <h3 className="px-1 pt-2 text-sm font-semibold text-muted">คะแนนที่ให้เอง</h3>
          <ScoreChart logs={snap.skinLogs} sensitive={settings.sensitiveLog || []} />
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/80 backdrop-blur-sm" onClick={() => setView(null)}>
          <div className="mx-auto min-h-full max-w-md space-y-3 p-4 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-white">
              <span className="text-sm">
                {thDate(viewing.date)} · วัน {viewing.cycleDay ?? "?"} · {ANGLE_LABEL[viewing.angle]}
              </span>
              <button className="grid h-10 w-10 place-items-center rounded-full bg-white/15" aria-label="ปิด" onClick={() => setView(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewing.url} alt="" className="pop w-full rounded-3xl" />
            {viewing.ai ? (
              <>
                <AnalysisCard
                  metrics={viewing.ai}
                  regions={viewing.regions}
                  prev={photos.filter((p) => p.ai && p.angle === "front" && p.date < viewing.date).pop()?.ai}
                />
                <button className="btn-plain w-full" disabled={!!busy} onClick={() => analyzeOne(viewing)}>
                  {busy === viewing.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
                  {busy === viewing.id ? "กำลังวิเคราะห์บนเครื่อง…" : "วิเคราะห์ใหม่"}
                </button>
              </>
            ) : viewing.angle === "front" ? (
              <button className="btn-primary w-full" disabled={!!busy} onClick={() => analyzeOne(viewing)}>
                {busy === viewing.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
                {busy === viewing.id ? "กำลังวิเคราะห์บนเครื่อง…" : "วิเคราะห์ผิวจากรูปนี้"}
              </button>
            ) : null}
            {aiError && busy === null && view === viewing.id && <p className="rounded-2xl bg-orange-50 p-3 text-sm text-orange-700">{aiError}</p>}
            <button
              className="flex w-full items-center justify-center gap-1.5 py-2 text-sm text-red-300"
              onClick={async () => {
                if (!confirm("ลบรูปนี้?")) return;
                await deletePhoto(viewing.id);
                setView(null);
                load();
              }}
            >
              <Trash2 className="h-4 w-4" /> ลบรูปนี้
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Same patch of skin, before vs after — the crops come from the face-landmark regions. */
function RegionCompare({ a, b }: { a: Photo; b: Photo }) {
  const ua = useBlobUrls(a.regions), ub = useBlobUrls(b.regions);
  return (
    <section className="card space-y-3">
      <h3 className="flex items-center gap-2 font-semibold">
        <ScanFace className="h-4 w-4 text-brand-500" /> เทียบทีละบริเวณ
      </h3>
      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-2 text-xs">
        <span />
        <span className="text-center text-muted">ก่อน · {thDate(a.date, false)}</span>
        <span className="text-center text-muted">หลัง · {thDate(b.date, false)}</span>
        {SKIN_REGIONS.map((k, i) => (
          <div key={k} className="contents">
            <span className="w-14 font-medium">{REGION_LABEL[k]}</span>
            {[{ u: ua[k], p: a }, { u: ub[k], p: b }].map(({ u, p }, j) => (
              <figure key={j} className="pop-i overflow-hidden rounded-xl bg-canvas" style={{ ["--i" as any]: i * 2 + j }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {u && <img src={u} alt="" className="aspect-square w-full object-cover" />}
                <figcaption className="py-1 text-center text-[10px] text-muted">
                  a* {p.ai?.redness?.[k] ?? "–"} · {p.ai?.spots?.[k] ?? "–"} จุด
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
