import { Moon, Sun } from "lucide-react";
import * as core from "./core.js";

const TH_WD = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const TH_MON_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

/** "2026-11-13" → "ศุกร์ 13 พ.ย." */
export function thDate(d: string, withWeekday = true) {
  const [, m, day] = d.split("-").map(Number);
  return `${withWeekday ? TH_WD[core.weekdayOf(d)] + " " : ""}${day} ${TH_MON[m - 1]}`;
}
export const thWeekday = (d: string) => TH_WD[core.weekdayOf(d)];

/** ISO instant → "07:42" in the settings tz */
export function hhmm(iso: string, tz: string) {
  const p = core.zonedParts(new Date(iso), tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
export const minToHHMM = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const SLOT_LABEL = { am: "เช้า", pm: "ก่อนนอน" } as const;
export const SLOT_ICON = { am: Sun, pm: Moon } as const;

export function typeColor(settings: any, type: string) {
  return settings.typeColors?.[type] || "#94a3b8";
}

/** When reminders for a slot start (minutes since logical midnight). */
export function slotStart(slot: "am" | "pm", info: any, settings: any) {
  return slot === "am"
    ? core.toMin(settings.amTime)
    : core.toMin(settings.pmTime) - (info?.pmHasTimer ? settings.leadMinForTimedNights : 0);
}

let audio: AudioContext | null = null;
export function beep(times = 2) {
  try {
    audio = audio || new AudioContext();
    for (let i = 0; i < times; i++) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(audio.destination);
      const t = audio.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.start(t);
      o.stop(t + 0.3);
    }
  } catch {}
}
export const vibrate = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {}
};
