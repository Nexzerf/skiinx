"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Camera, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Flame, Snowflake, Ticket, TrendingUp, Trophy, Undo2, X, type LucideIcon } from "lucide-react";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { SLOT_ICON, SLOT_LABEL, TH_MON_FULL, hhmm, thDate, typeColor } from "@/lib/util";
import { allPhotos } from "@/lib/photos";
import TypeTag from "@/components/TypeTag";
import { IconTile, PageTitle, SectionHeader } from "@/components/ui";

const STATUS_BG: Record<string, string> = {
  done: "bg-linear-to-br from-brand-300 to-brand-500 text-white font-semibold",
  half: "bg-brand-100 text-brand-700",
  "half-today": "bg-brand-100 text-brand-700 ring-2 ring-brand-400",
  frozen: "bg-sky-100 text-sky-700",
  missed: "bg-white text-brand-300 ring-1 ring-brand-100",
  today: "bg-white text-brand-600 font-semibold ring-2 ring-brand-400",
  future: "bg-canvas text-muted",
  none: "bg-transparent text-gray-300",
};
const SOURCE_LABEL: Record<string, string> = { app: "แอพ", manual: "ติ๊กย้อนหลัง", discord: "Discord", push: "แจ้งเตือน" };
const LEGEND: [string, string][] = [
  ["done", "ครบ"],
  ["half", "ครึ่งเดียว"],
  ["frozen", "บัตรผ่าน"],
  ["missed", "พลาด"],
];

export default function CalendarPage() {
  const { ready, today, streak, checks, infoFor, settings, snap } = useData();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sel, setSel] = useState<string | null>(null);
  const [photoDates, setPhotoDates] = useState<Set<string>>(new Set());
  useEffect(() => {
    allPhotos()
      .then((ps) => setPhotoDates(new Set(ps.map((p) => p.date))))
      .catch(() => {});
  }, []);
  useEffect(() => setMonth(today.slice(0, 7)), [today]);

  const days = useMemo(() => {
    const first = `${month}-01`;
    const lead = (core.weekdayOf(first) + 6) % 7; // Monday first
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = first; d.startsWith(month); d = core.addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  if (!ready) return null;

  const hasPhoto = (d: string) => photoDates.has(d) || snap.skinLogs.some((l) => l.date === d && l.photo_angles?.length);
  const statusOf = (d: string) => (d > today ? "future" : streak.status[d] || "none");
  const monthEnd = core.addDays(core.addDays(`${month}-01`, 32).slice(0, 7) + "-01", -1);
  const first = snapFirst(snap) || today;
  const statFrom = `${month}-01` < first ? first : `${month}-01`;
  const statTo = monthEnd < today ? monthEnd : today;
  const stats = statFrom <= statTo ? core.periodStats(statFrom, statTo, checks) : null;
  const [y, m] = month.split("-").map(Number);
  const shift = (n: number) => setMonth(core.addDays(`${month}-15`, n * 30).slice(0, 7));

  return (
    <div className="stagger space-y-5">
      <PageTitle title="ความคืบหน้า" sub="ทาครบทั้งเช้าและก่อนนอน = 1 วัน" />

      <div className="grid grid-cols-3 gap-2">
        <Stat icon={TrendingUp} label="ทาครบเดือนนี้" value={stats ? `${stats.rate}%` : "–"} />
        <Stat icon={Flame} label="streak ตอนนี้" value={`${streak.current}`} />
        <Stat icon={Trophy} label="streak สูงสุด" value={`${streak.best}`} />
      </div>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <button className="icon-btn h-9 w-9 shadow-none ring-1 ring-brand-100" aria-label="เดือนก่อน" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="font-semibold">
            {TH_MON_FULL[m - 1]} {y + 543}
          </h2>
          <button className="icon-btn h-9 w-9 shadow-none ring-1 ring-brand-100" aria-label="เดือนถัดไป" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted">
          {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d, i) => {
            if (!d) return <div key={i} />;
            const anim = { ["--i" as any]: i };
            const info = infoFor(d);
            const st = statusOf(d);
            return (
              <button
                key={d}
                onClick={() => setSel(d)}
                style={anim}
                className={`pop-i relative grid aspect-square place-items-center rounded-full text-sm transition hover:scale-110 ${STATUS_BG[st]} ${sel === d ? "outline-2 outline-offset-2 outline-brand-500" : ""}`}
              >
                {st === "frozen" ? <Snowflake className="h-4 w-4" /> : +d.slice(8)}
                {info?.type && (
                  <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ring-2 ring-white" style={{ background: typeColor(settings, info.type) }} />
                )}
                {hasPhoto(d) && (
                  <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-white text-brand-500 shadow-soft">
                    <Camera className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {LEGEND.map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded-full ${STATUS_BG[k]}`} />
              {l}
            </span>
          ))}
        </div>
      </section>

      {sel && <DayDetail key={sel} date={sel} onClose={() => setSel(null)} />}

      <section className="soft-gradient space-y-2 rounded-3xl p-4">
        {stats?.worst ? (
          <Insight icon={Undo2} title="รอบที่ลืมบ่อยที่สุด" text={stats.worst.text} />
        ) : (
          <Insight icon={CircleCheck} title="เดือนนี้ยังไม่ลืมเลย" text="รักษามาตรฐานนี้ไว้นะ" />
        )}
        <Insight icon={Ticket} title="บัตรผ่านสัปดาห์นี้" text={`เหลือ ${streak.freezesLeftThisWeek ?? settings.freezesPerWeek} ใบ — พลาดได้โดย streak ไม่หาย`} />
      </section>

      <Upcoming />
    </div>
  );
}

function Insight({ icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <IconTile icon={icon} size={40} className="rounded-xl bg-white" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted">{text}</p>
      </div>
    </div>
  );
}

function DayDetail({ date, onClose }: { date: string; onClose: () => void }) {
  const { infoFor, today, checkinOf, settings, setCheck } = useData();
  const info = infoFor(date);
  const age = core.diffDays(today, date);
  const editable = age >= 0 && age <= 2;
  return (
    <section className="card rise space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          {thDate(date)} {info && <span className="text-muted">· วัน {info.n}/{info.len}</span>}
        </h2>
        <button className="text-muted" aria-label="ปิด" onClick={onClose}>
          <X className="h-5 w-5" />
        </button>
      </div>
      {!info ? (
        <p className="text-sm text-muted">ไม่มีตารางในวันนี้</p>
      ) : (
        <>
          {info.type && <TypeTag type={info.type} label={info.typeLabel} />}
          {(["am", "pm"] as const).map((slot) => {
            const ck = checkinOf(date, slot);
            const Icon = SLOT_ICON[slot];
            return (
              <div key={slot} className="rounded-2xl bg-brand-50/60 p-3">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <b className="flex items-center gap-1.5">
                    <Icon className="h-4 w-4 text-brand-500" /> {SLOT_LABEL[slot]}
                  </b>
                  {ck ? (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CircleCheck className="h-4 w-4" /> {hhmm(ck.done_at, settings.tz)} · {SOURCE_LABEL[ck.source] || "แอพ"}
                    </span>
                  ) : date <= today ? (
                    <span className="text-brand-500">ยังไม่ได้ทา</span>
                  ) : null}
                </div>
                <ol className="list-decimal pl-5 text-sm text-ink/80">
                  {info[slot].map((s: any) => (
                    <li key={s.i}>{s.name}</li>
                  ))}
                </ol>
                {editable && date !== today && (
                  <button className="mt-2 text-xs font-medium text-brand-600 underline" onClick={() => setCheck(date, slot, !ck, "manual")}>
                    {ck ? "ยกเลิกการติ๊ก" : "ติ๊กย้อนหลังว่าทาแล้ว"}
                  </button>
                )}
              </div>
            );
          })}
          {info.note && <p className="text-sm text-muted">{info.note}</p>}
          {!editable && date < today && <p className="text-xs text-muted">ติ๊กย้อนหลังได้ภายใน 2 วันเท่านั้น</p>}
        </>
      )}
    </section>
  );
}

function Upcoming() {
  const { today, infoFor } = useData();
  const [open, setOpen] = useState(false);
  const list = Array.from({ length: 30 }, (_, i) => core.addDays(today, i + 1));
  return (
    <section>
      <SectionHeader title="30 วันข้างหน้า" action={open ? "ซ่อน" : "ดูทั้งหมด"} onAction={() => setOpen(!open)} />
      <div className="card py-2">
        <ul className="divide-y divide-brand-50 text-sm">
          {(open ? list : list.slice(0, 4)).map((d) => {
            const info = infoFor(d);
            return (
              <li key={d} className="flex items-center gap-3 py-2">
                <IconTile icon={CalendarRange} size={34} className="rounded-xl" />
                <span className="w-24 shrink-0 text-muted">{thDate(d)}</span>
                {info ? (
                  <>
                    <span className="w-12 shrink-0 text-muted">วัน {info.n}</span>
                    {info.type ? <TypeTag type={info.type} label={info.typeLabel} small /> : <span className="truncate">{info.pm.map((s: any) => s.name).join(" → ")}</span>}
                  </>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </li>
            );
          })}
        </ul>
        {!open && (
          <button className="flex w-full items-center justify-center gap-1 pt-1 text-xs text-muted" onClick={() => setOpen(true)}>
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}

const snapFirst = (snap: any) =>
  snap.schedules
    .filter((s: any) => s.enabled)
    .map((s: any) => s.start_date)
    .sort()[0] as string | undefined;

function Stat({ icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="card press flex flex-col items-start gap-2 p-3">
      <IconTile icon={icon} size={34} className="rounded-xl" />
      <div>
        <div className="text-2xl leading-none font-bold text-brand-500">{value}</div>
        <div className="mt-1 text-[11px] text-muted">{label}</div>
      </div>
    </div>
  );
}
