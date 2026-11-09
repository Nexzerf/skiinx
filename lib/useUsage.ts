"use client";
import { useMemo } from "react";
import { useData } from "./data";
import * as core from "./core.js";

/** Where each shelf product is used in the routine that's active today (shelf-built routines only). */
export function useUsage() {
  const { schedules, today } = useData();
  return useMemo(() => {
    const active = core.scheduleFor(today, schedules);
    const r = active?.data?.source === "shelf" ? active.data.routine : null;
    const map: Record<string, { am: boolean; pm: boolean; where: string[] }> = {};
    if (!r) return { map, active };
    const add = (id: string, slot: "am" | "pm", where: string) => {
      const m = (map[String(id)] ||= { am: false, pm: false, where: [] });
      m[slot] = true;
      if (!m.where.includes(where)) m.where.push(where);
    };
    for (const id of r.am || []) add(id, "am", "ตอนเช้า");
    for (const [k, n] of Object.entries<any>(r.nights || {})) if ((r.pattern || []).includes(k)) for (const id of n.ids || []) add(id, "pm", n.label || `คืน ${k}`);
    return { map, active };
  }, [schedules, today]);
}
