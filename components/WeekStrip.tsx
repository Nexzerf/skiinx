"use client";
import { Check, Snowflake, X } from "lucide-react";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";

const SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** 3 days back → 3 days ahead, as round badges coloured by check-in status. */
export default function WeekStrip() {
  const { today, streak } = useData();
  const days = Array.from({ length: 7 }, (_, i) => core.addDays(today, i - 3));
  return (
    <div className="flex justify-between">
      {days.map((d, i) => {
        const st = d > today ? "future" : streak.status[d] || "none";
        const isToday = d === today;
        const base = "grid h-10 w-10 place-items-center rounded-full text-sm font-semibold transition";
        const look =
          st === "done"
            ? "bg-linear-to-br from-brand-300 to-brand-500 text-white shadow-glow"
            : st === "frozen"
              ? "bg-sky-50 text-sky-500"
              : st === "missed"
                ? "bg-white text-brand-300 ring-1 ring-brand-100"
                : st === "half" || st === "half-today"
                  ? "bg-brand-50 text-brand-600 ring-2 ring-brand-300"
                  : isToday
                    ? "bg-white text-brand-600 ring-2 ring-brand-400"
                    : "bg-white/70 text-muted";
        return (
          <div key={d} className="flex flex-col items-center gap-1.5">
            <span className={`text-xs ${isToday ? "font-semibold text-brand-500" : "text-muted"}`}>{SHORT[core.weekdayOf(d)]}</span>
            <span className={`pop-i ${base} ${look}`} style={{ ["--i" as any]: i }}>
              {st === "done" ? (
                <Check className="h-4 w-4" strokeWidth={3} />
              ) : st === "frozen" ? (
                <Snowflake className="h-4 w-4" />
              ) : st === "missed" ? (
                <X className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                +d.slice(8)
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
