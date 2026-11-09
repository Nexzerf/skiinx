"use client";
import Link from "next/link";
import { Check, CircleCheck, Clock, Play, TriangleAlert } from "lucide-react";
import { useData } from "@/lib/data";
import { SLOT_ICON, SLOT_LABEL, hhmm, minToHHMM, slotStart } from "@/lib/util";
import * as core from "@/lib/core.js";
import { StepChips, StepTile } from "./StepIcon";
import { IconTile } from "./ui";
import type { Slot } from "@/lib/types";

export default function RoutineCard({ slot }: { slot: Slot }) {
  const { info, today, checkinOf, setCheck, settings, now } = useData();
  const steps: any[] = info[slot];
  const ck = checkinOf(today, slot);
  const mins = core.logicalMinutes(now, settings);
  const start = slotStart(slot, info, settings);
  const overdue = !ck && mins >= start && (slot === "pm" || mins < core.toMin(settings.amCutoff));
  const missedAm = slot === "am" && !ck && mins >= core.toMin(settings.amCutoff);

  return (
    <section className={`card rise ${overdue ? "ring-2 ring-brand-300" : ""}`}>
      <div className="mb-3 flex items-center gap-3">
        <IconTile icon={SLOT_ICON[slot]} size={42} className={slot === "am" ? "bg-amber-50 text-amber-500" : "bg-violet-50 text-violet-500"} />
        <div className="flex-1">
          <p className="font-semibold">รูทีน{SLOT_LABEL[slot]}</p>
          <p className="text-xs text-muted">{steps.length} ขั้นตอน</p>
        </div>
        {ck ? (
          <span className="chip bg-emerald-50 py-1 text-xs text-emerald-600">
            <CircleCheck className="h-3.5 w-3.5" /> {hhmm(ck.done_at, settings.tz)}
            {ck.source === "discord" && " · Discord"}
            {ck.source === "push" && " · แจ้งเตือน"}
          </span>
        ) : overdue ? (
          <span className="chip animate-pulse bg-brand-500 py-1 text-xs text-white">
            <TriangleAlert className="h-3.5 w-3.5" /> ยังไม่ได้ทา
          </span>
        ) : (
          <span className="chip bg-gray-50 py-1 text-xs text-muted">
            <Clock className="h-3.5 w-3.5" /> {missedAm ? "เลยเวลาแล้ว" : `เริ่ม ${minToHHMM(start)}`}
          </span>
        )}
      </div>

      <ol className="relative">
        {steps.map((s, i) => (
          <li key={s.i} className="rise relative flex items-center gap-3 py-2" style={{ ["--i" as any]: i }}>
            {i < steps.length - 1 && <span className="absolute top-[38px] left-[11px] h-[calc(100%-22px)] w-px bg-brand-100" />}
            <span
              className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                ck ? "bg-emerald-500 text-white" : "bg-brand-100 text-brand-600"
              }`}
            >
              {ck ? <Check className="check-burst h-3.5 w-3.5" strokeWidth={3} style={{ animationDelay: `${i * 70}ms` }} /> : i + 1}
            </span>
            <StepTile step={s} size={46} />
            <div className={`min-w-0 flex-1 ${ck ? "opacity-60" : ""}`}>
              <p className="truncate text-[15px] font-semibold">{s.category || s.name}</p>
              <p className="truncate text-xs text-muted">{s.category ? s.name : s.product !== s.name ? s.product : ""}</p>
              <div className="mt-1">
                <StepChips step={s} />
              </div>
            </div>
          </li>
        ))}
      </ol>

      {ck ? (
        <button className="mt-2 w-full text-center text-xs text-muted underline" onClick={() => setCheck(today, slot, false)}>
          ยกเลิกการติ๊ก
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <Link href={`/focus/${slot}`} className="btn-primary shine flex-1">
            <Play className="h-4 w-4" fill="currentColor" /> เริ่มทา{SLOT_LABEL[slot]}
          </Link>
          <button className="icon-btn h-12 w-12 bg-brand-50 text-brand-500 shadow-none" aria-label="ติ๊กว่าทาแล้ว" title="ติ๊กว่าทาแล้ว (ไม่ต้องทำทีละขั้น)" onClick={() => setCheck(today, slot, true)}>
            <Check className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </section>
  );
}
