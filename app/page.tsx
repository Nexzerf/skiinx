"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, Camera, ClipboardList, HeartPulse, Lightbulb, Moon, NotebookPen, RefreshCw, Settings, Sparkles, Sun, X, type LucideIcon } from "lucide-react";
import { useData } from "@/lib/data";
import RoutineCard from "@/components/RoutineCard";
import TypeTag from "@/components/TypeTag";
import WeekStrip from "@/components/WeekStrip";
import StreakHero from "@/components/StreakHero";
import { Empty, IconTile, SectionHeader, Segmented } from "@/components/ui";
import { thDate } from "@/lib/util";
import * as core from "@/lib/core.js";
import type { Slot } from "@/lib/types";

export default function Today() {
  const { ready, info, today, now, settings, saveSettings, snap, infoFor } = useData();
  const pmNow = core.logicalMinutes(now, settings) >= 15 * 60;
  const [slot, setSlot] = useState<Slot>(pmNow ? "pm" : "am");
  const [askSensitive, setAskSensitive] = useState(false);
  useEffect(() => setSlot(pmNow ? "pm" : "am"), [pmNow]);

  if (!ready) return <p className="py-24 text-center text-muted">กำลังโหลด…</p>;

  const hour = core.zonedParts(now, settings.tz).hour;
  const greet = hour < 12 && hour >= 4 ? "สวัสดีตอนเช้า" : hour < 17 && hour >= 12 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";

  const header = (
    <header className="flex items-start justify-between pt-2">
      <div>
        <p className="text-[15px] text-muted">{greet},</p>
        {info ? (
          <h1 className="flex items-center gap-2 text-[34px] leading-tight font-bold text-brand-500">
            วันที่ {info.n}
            <Sparkles className="twinkle h-5 w-5 text-brand-300" />
          </h1>
        ) : (
          <h1 className="text-[34px] leading-tight font-bold text-brand-500">SkinDaily</h1>
        )}
        <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
          {thDate(today)}
          {info && <span>· จาก {info.len} วัน</span>}
        </p>
      </div>
      <Link href="/settings" className="icon-btn" aria-label="ตั้งค่า">
        <Settings className="h-5 w-5" strokeWidth={1.8} />
      </Link>
    </header>
  );

  if (!info)
    return (
      <div className="space-y-4">
        {header}
        <Empty
          icon={ClipboardList}
          title="ยังไม่มีตารางสกินแคร์"
          sub={snap.schedules.length ? "ตารางที่อัพโหลดไว้ยังไม่ถึงวันเริ่ม หรือถูกปิดใช้อยู่" : "อัพโหลดไฟล์ Excel ตาราง 30 วันเพื่อเริ่มใช้งาน"}
        >
          <Link href="/schedule" className="btn-primary mt-2">
            <ClipboardList className="h-4 w-4" /> ไปหน้าตาราง
          </Link>
        </Empty>
      </div>
    );

  const tomorrow = infoFor(core.addDays(today, 1));
  const sensitiveSet = async (days: number | null) => {
    setAskSensitive(false);
    if (days === null) {
      const log = (settings.sensitiveLog || [])
        .map((p: any) => (p.to >= today && p.from <= today ? { ...p, to: core.addDays(today, -1) } : p))
        .filter((p: any) => p.to >= p.from);
      await saveSettings({ sensitiveUntil: null, sensitiveLog: log });
    } else {
      const to = core.addDays(today, days - 1);
      await saveSettings({ sensitiveUntil: to, sensitiveLog: [...(settings.sensitiveLog || []), { from: today, to }] });
    }
  };

  const quick: { label: string; icon: LucideIcon; href?: string; onClick?: () => void; badge?: string; active?: boolean }[] = [
    { label: "ถ่ายรูปผิว", icon: Camera, href: "/photos/capture", badge: info.photoDay ? "วันนี้" : undefined },
    { label: "ผิวแสบ/ตึง", icon: HeartPulse, onClick: () => (info.sensitive ? sensitiveSet(null) : setAskSensitive(!askSensitive)), active: info.sensitive },
    { label: "บันทึกผิว", icon: NotebookPen, href: "/photos?score=1" },
    { label: "การแจ้งเตือน", icon: BellRing, href: "/settings" },
  ];

  return (
    <div className="stagger space-y-5">
      {header}
      <WeekStrip />
      <StreakHero />

      {info.sensitive && (
        <div className="flex items-center gap-3 rounded-3xl bg-sky-50 p-3 text-sm text-sky-800">
          <IconTile icon={RefreshCw} size={36} className="rounded-xl bg-white text-sky-500" />
          <span className="flex-1">โหมดผิวแสบถึง {thDate(settings.sensitiveUntil!, false)} — สลับคลีนเซอร์ที่มีกรดเป็นตัวอ่อนโยน</span>
          <button className="text-sky-600" aria-label="ยกเลิกโหมดผิวแสบ" onClick={() => sensitiveSet(null)}>
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div>
        <SectionHeader title="รูทีนวันนี้" action="ทาทีละขั้น" href={`/focus/${slot}`} />
        <div className="mb-3 flex items-center gap-2">
          <div className="flex-1">
            <Segmented
              value={slot}
              onChange={setSlot}
              options={[
                { value: "am", label: "เช้า", icon: Sun },
                { value: "pm", label: "ก่อนนอน", icon: Moon },
              ]}
            />
          </div>
        </div>
        {slot === "pm" && info.type && (
          <div className="mb-2 flex items-center gap-2 px-1 text-sm text-muted">
            คืนนี้ <TypeTag type={info.type} label={info.typeLabel} />
          </div>
        )}
        <RoutineCard key={slot} slot={slot} />
      </div>

      <div>
        <SectionHeader title="ทางลัด" />
        <div className="grid grid-cols-4 gap-2">
          {quick.map((q) => {
            const body = (
              <>
                <span className="relative">
                  <IconTile icon={q.icon} size={56} className={`rounded-[20px] ${q.active ? "bg-brand-500 text-white" : "bg-white shadow-soft"}`} />
                  {q.badge && <span className="absolute -top-1.5 -right-2 animate-bounce rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-white ring-2 ring-canvas">{q.badge}</span>}
                </span>
                <span className="text-center text-[12px] leading-tight text-ink">{q.label}</span>
              </>
            );
            return q.href ? (
              <Link key={q.label} href={q.href} className="press wiggle-hover flex flex-col items-center gap-1.5">
                {body}
              </Link>
            ) : (
              <button key={q.label} onClick={q.onClick} className="press wiggle-hover flex flex-col items-center gap-1.5">
                {body}
              </button>
            );
          })}
        </div>
        {askSensitive && (
          <div className="card rise mt-3 space-y-3">
            <p className="text-sm text-muted">ผิวแสบ/ตึง? จะสลับคลีนเซอร์ที่มีกรด (SA/BHA/AHA) เป็นตัวอ่อนโยน ทั้งเช้าและเย็น เป็นเวลา</p>
            <div className="flex gap-2">
              {[1, 3, 7].map((d) => (
                <button key={d} className="btn-ghost flex-1 py-2.5" onClick={() => sensitiveSet(d)}>
                  {d} วัน
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {(info.note || tomorrow) && (
        <section className="soft-gradient relative overflow-hidden rounded-3xl p-4">
          <Sparkles className="twinkle absolute top-3 right-3 h-5 w-5 text-brand-300" />
          {info.note && (
            <div className="flex gap-3">
              <IconTile icon={Lightbulb} size={40} className="rounded-xl bg-white text-amber-500" />
              <div className="flex-1 pr-6">
                <p className="font-semibold">อย่าลืมนะ</p>
                <p className="text-sm text-ink/75">{info.note}</p>
              </div>
            </div>
          )}
          {tomorrow && (
            <div className="mt-3 flex items-center gap-2 border-t border-brand-200/60 pt-3 text-sm text-muted">
              พรุ่งนี้ {tomorrow.type ? <TypeTag type={tomorrow.type} label={tomorrow.typeLabel} small /> : `วัน ${tomorrow.n}`}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
