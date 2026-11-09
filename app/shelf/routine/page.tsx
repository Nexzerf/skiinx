"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, Ban, Check, ChevronLeft, CircleAlert, CircleCheck, Info, Lightbulb, LoaderCircle, Minus, Moon, Plus, RotateCcw, Sun, TriangleAlert, X,
  type LucideIcon,
} from "lucide-react";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { CATEGORIES } from "@/lib/ingredients.js";
import { NIGHT_META, buildScheduleFromRoutine, checkRoutine, proposeRoutine, type Note, type Routine } from "@/lib/routineEngine.js";
import { thDate } from "@/lib/util";

const WD_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
import { PageTitle, Segmented } from "@/components/ui";
import { ProductArt } from "@/components/ProductArt";
import { Sheet } from "@/components/Sheet";

type Level = "gentle" | "normal";
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default function RoutineBuilder() {
  const { ready, snap, today, schedules, addSchedule } = useData();
  const router = useRouter();
  const products = useMemo(() => snap.products.filter((p) => p.status !== "empty").map((p) => ({ ...p, id: String(p.id) })), [snap.products]);
  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const [level, setLevel] = useState<Level>("normal");
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [unused, setUnused] = useState<{ id: string; reason: string }[]>([]);
  const [picker, setPicker] = useState<string | null>(null); // "am" | night key
  const [start, setStart] = useState<"today" | "tomorrow">("today");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bump, setBump] = useState(0);

  const propose = (lv: Level) => {
    const r = proposeRoutine(products, { level: lv });
    setRoutine(r.routine);
    setNotes(r.notes);
    setUnused(r.unused);
    setBump((b) => b + 1);
  };

  // first load: continue the routine in use (if it came from the shelf), else suggest one
  useEffect(() => {
    if (!ready || routine || !products.length) return;
    const active = core.scheduleFor(today, schedules);
    const r = active?.data?.source === "shelf" ? active.data.routine : null;
    if (r) {
      const known = (ids: string[]) => ids.map(String).filter((id) => byId[id]);
      const fixed: Routine = {
        am: known(r.am || []),
        nights: Object.fromEntries(Object.entries<any>(r.nights || {}).map(([k, n]) => [k, { label: n.label, ids: known(n.ids || []) }])),
        pattern: r.pattern || ["C"],
        level: r.level || "normal",
      };
      setLevel(fixed.level as Level);
      setRoutine(fixed);
      const fresh = proposeRoutine(products, { level: fixed.level });
      setNotes(fresh.notes);
      const used = new Set([...fixed.am, ...Object.values(fixed.nights).flatMap((n) => n.ids)]);
      setUnused(products.filter((p) => !used.has(p.id)).map((p) => ({ id: p.id, reason: fresh.unused.find((u) => String(u.id) === p.id)?.reason || "ยังไม่ได้ใส่ในรูทีน" })));
    } else propose(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, products.length]);

  const issues = useMemo(() => (routine ? checkRoutine(routine, byId) : []), [routine, byId]);
  const errors = issues.filter((i) => i.level === "error");

  if (!ready) return null;
  if (!products.length)
    return (
      <div className="space-y-4">
        <PageTitle title="จัดรูทีน" back={<BackBtn />} />
        <div className="card text-center">
          <p className="font-semibold">ยังไม่มีสกินแคร์บนชั้น</p>
          <p className="mt-1 text-sm text-muted">เพิ่มของที่มีก่อน แล้วระบบจะจัดให้</p>
          <Link href="/shelf" className="btn-primary mt-3 w-full">
            ไปที่ชั้นวาง
          </Link>
        </div>
      </div>
    );
  if (!routine) return null;

  const slotIds = (where: string) => (where === "am" ? routine.am : routine.nights[where]?.ids || []);
  const setSlot = (where: string, ids: string[]) =>
    setRoutine((r) => {
      const n = clone(r!);
      if (where === "am") n.am = ids;
      else n.nights[where].ids = ids;
      return n;
    });
  const move = (where: string, i: number, d: -1 | 1) => {
    const ids = [...slotIds(where)];
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setSlot(where, ids);
  };
  const removeAt = (where: string, i: number) => setSlot(where, slotIds(where).filter((_, k) => k !== i));
  const addTo = (where: string, id: string) => {
    // drop it in its natural place (thin → thick), sunscreen last
    const ids = [...slotIds(where), id];
    const ord = (x: string) => CATEGORIES[byId[x]?.category]?.order ?? 45;
    const at = slotIds(where).findIndex((x) => ord(x) > ord(id));
    if (at >= 0) {
      ids.pop();
      ids.splice(at, 0, id);
    }
    setSlot(where, ids);
    setUnused((u) => u.filter((x) => x.id !== id));
  };

  const nightKeys = Object.keys(routine.nights).sort();
  const setPattern = (p: string[]) => setRoutine((r) => ({ ...clone(r!), pattern: p }));
  const cycleAt = (i: number) => {
    const p = [...routine.pattern];
    p[i] = nightKeys[(nightKeys.indexOf(p[i]) + 1) % nightKeys.length];
    setPattern(p);
  };
  const colorOf = (k: string) => NIGHT_META[k]?.color || "#94a3b8";
  const whereLabel = (w: string) => (w === "am" ? "ตอนเช้า" : w === "pattern" ? "รอบคืน" : routine.nights[w]?.label || `คืน ${w}`);
  const startDate = start === "today" ? today : core.addDays(today, 1);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const data = buildScheduleFromRoutine({ ...routine, level, notes }, products, { title: "รูทีนจากชั้นวาง" });
      await addSchedule({ name: "รูทีนจากชั้นวาง", data, start_date: startDate, enabled: true });
      router.push("/");
    } catch (e: any) {
      setErr(e.message || String(e));
      setSaving(false);
    }
  };

  const renderSlot = (where: string, title: string, Icon: LucideIcon, tint: string) => {
    const ids = slotIds(where);
    const mine = issues.filter((i) => i.where === where);
    return (
      <section key={where} className="card relative space-y-2.5">
        <h2 className="flex items-center gap-2.5 font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: tint }}>
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <span className="text-xs font-normal text-muted">{ids.length} ขั้น</span>
        </h2>
        <ol className="space-y-1.5">
          {ids.map((id, i) => {
            const p = byId[id];
            if (!p) return null;
            return (
              <li key={`${id}-${bump}`} className="rise flex items-center gap-2 rounded-2xl bg-canvas py-1.5 pr-1.5 pl-2" style={{ ["--i" as any]: i }}>
                <span className="w-4 shrink-0 text-center text-xs font-semibold text-muted tabular-nums">{i + 1}</span>
                <ProductArt p={p} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted">{CATEGORIES[p.category]?.label}</span>
                </span>
                <span className="flex shrink-0">
                  <button className="grid h-9 w-8 place-items-center rounded-lg text-muted active:bg-white disabled:opacity-25" onClick={() => move(where, i, -1)} disabled={i === 0} aria-label="เลื่อนขึ้น">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button className="grid h-9 w-8 place-items-center rounded-lg text-muted active:bg-white disabled:opacity-25" onClick={() => move(where, i, 1)} disabled={i === ids.length - 1} aria-label="เลื่อนลง">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button className="grid h-9 w-8 place-items-center rounded-lg text-muted active:bg-white" onClick={() => removeAt(where, i)} aria-label="เอาออก">
                    <X className="h-4 w-4" />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
        <button className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-brand-100 text-sm font-medium text-brand-500 transition hover:border-brand-200 hover:bg-brand-50" onClick={() => setPicker(where)}>
          <Plus className="h-4 w-4" /> เพิ่มจากชั้นวาง
        </button>
        {mine.length > 0 && <IssueLines items={mine} />}
      </section>
    );
  };

  return (
    <div className="space-y-4 pb-20">
      <PageTitle title="จัดรูทีน" sub="ระบบจัดให้แล้ว ปรับต่อได้ตามใจ" back={<BackBtn />} />

      <div className="space-y-2">
        <Segmented<Level>
          value={level}
          onChange={(v) => {
            setLevel(v);
            propose(v);
          }}
          options={[
            { value: "gentle", label: "เพิ่งเริ่มใช้" },
            { value: "normal", label: "ผิวชินแล้ว" },
          ]}
        />
        <p className="px-2 text-center text-xs text-muted">{level === "gentle" ? "ใช้ตัวยาห่างขึ้น เหมาะกับช่วง 2-4 สัปดาห์แรก" : "ใช้ตัวยาตามรอบปกติ"}</p>
      </div>

      {/* overall status */}
      <div className={`flex items-center gap-3 rounded-3xl p-4 ${errors.length ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
        {errors.length ? <CircleAlert className="h-6 w-6 shrink-0" /> : <CircleCheck className="h-6 w-6 shrink-0" />}
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{errors.length ? `มี ${errors.length} จุดที่ต้องแก้` : "ไม่มีตัวที่ชนกัน ใช้ได้เลย"}</p>
          {errors.length > 0 && <p className="text-xs opacity-80">ดูจุดสีแดงในแต่ละช่วงด้านล่าง</p>}
        </div>
        <button className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-white/80 px-3 text-xs font-medium text-ink" onClick={() => propose(level)}>
          <RotateCcw className="h-3.5 w-3.5" /> จัดใหม่
        </button>
      </div>

      {renderSlot("am", "ตอนเช้า", Sun, "linear-gradient(135deg,#fbbf24,#f97316)")}
      {nightKeys.map((k) => renderSlot(k, routine.nights[k].label, Moon, colorOf(k)))}

      {/* rotation */}
      {nightKeys.length > 1 && (
        <section className="card space-y-3">
          <h2 className="font-semibold">สลับคืนแบบไหน</h2>
          <p className="-mt-2 text-xs text-muted">แตะช่องเพื่อเปลี่ยนคืนนั้น · วนทุก {routine.pattern.length} คืน</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {routine.pattern.map((k, i) => (
              <button
                key={i}
                onClick={() => cycleAt(i)}
                className="pop-i grid h-11 min-w-11 place-items-center rounded-2xl px-2 text-sm font-bold text-white shadow-sm transition active:scale-90"
                style={{ background: colorOf(k), ["--i" as any]: i }}
                aria-label={`คืนที่ ${i + 1}: ${routine.nights[k]?.label}`}
              >
                {i + 1}
              </button>
            ))}
            <button className="grid h-11 w-11 place-items-center rounded-2xl bg-canvas text-muted disabled:opacity-30" disabled={routine.pattern.length <= 1} onClick={() => setPattern(routine.pattern.slice(0, -1))} aria-label="ลดคืน">
              <Minus className="h-4 w-4" />
            </button>
            <button className="grid h-11 w-11 place-items-center rounded-2xl bg-canvas text-muted disabled:opacity-30" disabled={routine.pattern.length >= 7} onClick={() => setPattern([...routine.pattern, nightKeys.includes("C") ? "C" : nightKeys[0]])} aria-label="เพิ่มคืน">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {nightKeys.map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(k) }} />
                {routine.nights[k].label}
              </span>
            ))}
          </div>
          {/* the next 7 nights */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, i) => {
              const d = core.addDays(startDate, i);
              const k = routine.pattern[i % routine.pattern.length];
              return (
                <div key={d} className="flex flex-col items-center gap-1 rounded-xl bg-canvas py-1.5">
                  <span className="text-[10px] text-muted">{WD_SHORT[core.weekdayOf(d)]}</span>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(k) }} />
                  <span className="text-[11px] font-semibold tabular-nums">{Number(d.slice(8))}</span>
                </div>
              );
            })}
          </div>
          <IssueLines items={issues.filter((i) => i.where === "pattern")} />
        </section>
      )}

      {notes.length > 0 && (
        <section className="card space-y-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Lightbulb className="h-5 w-5 text-amber-500" /> คำแนะนำ
          </h2>
          <ul className="space-y-1.5">
            {notes.map((n, i) => (
              <li key={i} className={`flex gap-2 rounded-2xl p-2.5 text-sm ${n.level === "warn" ? "bg-amber-50 text-amber-900" : "bg-canvas text-ink/80"}`}>
                {n.level === "warn" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />}
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unused.filter((u) => byId[u.id]).length > 0 && (
        <section className="card space-y-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Ban className="h-5 w-5 text-muted" /> ยังไม่ได้ใส่ในรูทีน
          </h2>
          <ul className="space-y-1.5">
            {unused
              .filter((u) => byId[u.id])
              .map((u) => (
                <li key={u.id} className="flex items-center gap-2.5 rounded-2xl bg-canvas p-2">
                  <ProductArt p={byId[u.id]} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{byId[u.id].name}</span>
                    <span className="block text-xs text-muted">{u.reason}</span>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* save bar */}
      <div className="fixed inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] z-30 px-4">
        <div className="mx-auto max-w-md rounded-[26px] bg-white/95 p-2 shadow-[0_10px_40px_-12px_rgb(43_34_48/0.35)] backdrop-blur">
          {err && <p className="px-2 pt-1 pb-2 text-xs text-red-600">{err}</p>}
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 rounded-full bg-canvas p-1" role="radiogroup" aria-label="เริ่มใช้">
              {(["today", "tomorrow"] as const).map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={start === v}
                  onClick={() => setStart(v)}
                  title={thDate(v === "today" ? today : core.addDays(today, 1))}
                  className={`h-10 rounded-full px-3 text-[13px] font-medium transition ${start === v ? "bg-white text-brand-600 shadow-sm" : "text-muted"}`}
                >
                  {v === "today" ? "เริ่มวันนี้" : "พรุ่งนี้"}
                </button>
              ))}
            </div>
            <button className="btn-primary h-12 min-w-0 flex-1 px-3" disabled={saving || errors.length > 0} onClick={save}>
              {saving ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /> : <Check className="h-4 w-4 shrink-0" strokeWidth={2.6} />}
              <span className="truncate">{errors.length ? "แก้จุดสีแดงก่อน" : "ใช้รูทีนนี้"}</span>
            </button>
          </div>
        </div>
      </div>

      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker ? `เพิ่มใน${whereLabel(picker)}` : ""}>
        {picker && (
          <div className="grid grid-cols-3 gap-2">
            {products
              .filter((p) => !slotIds(picker).includes(p.id))
              .map((p, i) => (
                <button
                  key={p.id}
                  className="pop-i press flex flex-col items-center gap-1.5 rounded-2xl bg-white p-2.5 shadow-soft"
                  style={{ ["--i" as any]: i }}
                  onClick={() => {
                    addTo(picker, p.id);
                    setPicker(null);
                  }}
                >
                  <ProductArt p={p} size={48} />
                  <span className="line-clamp-2 w-full text-center text-[12px] leading-tight font-medium">{p.name}</span>
                </button>
              ))}
            {!products.filter((p) => !slotIds(picker).includes(p.id)).length && <p className="col-span-3 py-6 text-center text-sm text-muted">ทุกชิ้นอยู่ในช่วงนี้แล้ว</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function BackBtn() {
  return (
    <Link href="/shelf" className="icon-btn mt-0.5" aria-label="กลับไปชั้นวาง">
      <ChevronLeft className="h-5 w-5" />
    </Link>
  );
}

function IssueLines({ items }: { items: { level: string; text: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((i, k) => (
        <li
          key={k}
          className={`flex gap-2 rounded-xl px-2.5 py-2 text-[13px] ${i.level === "error" ? "bg-red-50 text-red-700" : i.level === "warn" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800"}`}
        >
          {i.level === "error" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : i.level === "warn" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}
