// Types for the dependency-free shared logic in core.js (kept as plain JS so Deno edge functions can use it too).
export type Settings = {
  tz: string;
  dayBoundaryHour: number;
  amTime: string;
  amCutoff: string;
  pmTime: string;
  leadMinForTimedNights: number;
  repeatMin: number;
  maxRepeats: number;
  weeklySummary: boolean;
  summaryTime: string;
  lastSummaryWeek: string | null;
  discordEnabled: boolean;
  autoAnalyze: boolean;
  spotSensitivity: "low" | "normal" | "high";
  freezesPerWeek: number;
  photoDays: number[];
  requirePhoto: boolean;
  sensitiveUntil: string | null;
  typeColors: Record<string, string>;
  photoAngles: string[];
  sensitiveLog: { from: string; to: string }[];
  lastExportAt: string | null;
  [k: string]: any;
};
export type Step = {
  i: number;
  name: string;
  product: string;
  category: string;
  howto: string;
  timer: { min: number; max: number; kind: "hold" | "before" } | null;
  flags: { retinol: boolean; bha: boolean; aha: boolean; sunscreen: boolean; cleanser: boolean };
  swapped: boolean;
  image?: string | null;
  icon?: string | null;
  color?: string | null;
  cat?: string | null;
};
export type Issue = { level: "error" | "warn" | "info"; day: number | null; slot: "am" | "pm" | null; msg: string };
export type ScheduleLike = { id: any; start_date: string; data: any; created_at: any; name?: string; [k: string]: any };
export type Streak = { current: number; best: number; status: Record<string, string>; freezesLeftThisWeek?: number };

export const DEFAULT_SETTINGS: Settings;
export function withDefaults(s?: any): Settings;
export function flagsOf(name: string): Step["flags"];
export function stepFlags(name: string, product?: any): Step["flags"];
export function splitSteps(cell: any): string[];
export function buildSchedule(sheets: { name: string; rows: string[][] }[]): any;
export function findProduct(step: string, schedule: any): any | null;
export function routineFor(schedule: any, n: number, slot: "am" | "pm", opts?: { sensitive?: boolean }): Step[];
export function validateSchedule(schedule: any): Issue[];
export function toMin(hhmm: string): number;
export function zonedParts(instant: Date, tz: string): { date: string; hour: number; minute: number; second: number; weekday: string };
export function logicalDate(instant: Date | number, s?: any): string;
export function logicalMinutes(instant: Date | number, s?: any): number;
export function addDays(d: string, n: number): string;
export function diffDays(a: string, b: string): number;
export function weekdayOf(d: string): number;
export function weekStart(d: string): string;
export function zonedToUtc(date: string, hhmm: string, tz: string): number;
export function scheduleFor<T extends ScheduleLike>(date: string, schedules: T[]): T | null;
export function startForCycleDay(date: string, n: number): string;
export function cycleRound(startDate: string, date: string, len: number): number;
export function cycleDay(startDate: string, date: string, len: number): number;
export function dayInfo(date: string, schedules: ScheduleLike[], settings?: any): any;
export function ckey(date: string, slot: string): string;
export function toCheckSet(rows: { date: string; slot: string }[]): Set<string>;
export function computeStreak(today: string, checks: Set<string>, firstDate: string | null, settings?: any): Streak;
export function periodStats(
  from: string,
  to: string,
  checks: Set<string>,
): { days: number; am: number; pm: number; done: number; total: number; rate: number; worst: { dow: number; slot: string; count: number; text: string } | null };
export function reminderText(slot: "am" | "pm", attempt: number, ctx: { mins?: number; streak?: number }): string;
export function planReminders(args: { now: Date; settings: any; schedules: ScheduleLike[]; checks: Set<string>; states: Record<string, any>; streak?: number }): {
  date: string;
  slot: "am" | "pm";
  attempt: number;
  info: any;
  text: string;
}[];
export function buildIcs(args: { schedules: ScheduleLike[]; settings: any; from: string; days?: number; appUrl?: string }): string;
