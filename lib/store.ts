// Persistence layer. Two backends behind one API:
//  • local mode  — everything in localStorage (no account needed, works offline)
//  • cloud mode  — Supabase tables (RLS); a localStorage copy is kept as an offline cache,
//                  and check-ins made offline wait in `pendingCheckins` until we're online.
import { cloudEnabled, sb } from "./supabase";
import type { Checkin, ScheduleRow, SettingsRow, SkinLog, Slot, Snapshot } from "./types";

const K = {
  schedules: "sd.schedules",
  checkins: "sd.checkins",
  settings: "sd.settings",
  skin: "sd.skinlogs",
  pending: "pendingCheckins",
};

function get<T>(k: string, def: T): T {
  if (typeof localStorage === "undefined") return def;
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
}
const put = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

export const randomHex = (n = 18) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");

export function cached(): Snapshot {
  const settings = get<SettingsRow>(K.settings, { data: {}, ics_token: null });
  if (!cloudEnabled && !settings.ics_token && typeof localStorage !== "undefined") {
    settings.ics_token = randomHex();
    put(K.settings, settings);
  }
  return {
    schedules: get<ScheduleRow[]>(K.schedules, []),
    checkins: applyPending(get<Checkin[]>(K.checkins, [])),
    settings,
    skinLogs: get<SkinLog[]>(K.skin, []),
  };
}

function cache(s: Snapshot) {
  put(K.schedules, s.schedules);
  put(K.checkins, s.checkins);
  put(K.settings, s.settings);
  put(K.skin, s.skinLogs);
}

/* ───────── pending check-ins (offline queue) ───────── */

type Pending = { date: string; slot: Slot; done: boolean; done_at: string; source: Checkin["source"] };
const pending = () => get<Pending[]>(K.pending, []);
export const pendingCount = () => pending().length;

function applyPending(rows: Checkin[]): Checkin[] {
  const map = new Map(rows.map((r) => [`${r.date}|${r.slot}`, r]));
  for (const p of pending()) {
    const k = `${p.date}|${p.slot}`;
    if (p.done) map.set(k, { date: p.date, slot: p.slot, done_at: p.done_at, source: p.source });
    else map.delete(k);
  }
  return [...map.values()];
}

let flushing: Promise<number> | null = null;
export function flushPending(): Promise<number> {
  if (!cloudEnabled || (typeof navigator !== "undefined" && !navigator.onLine)) return Promise.resolve(pending().length);
  if (flushing) return flushing;
  flushing = (async () => {
    for (const p of pending()) {
      const q = p.done
        ? sb().from("checkins").upsert({ date: p.date, slot: p.slot, done_at: p.done_at, source: p.source })
        : sb().from("checkins").delete().eq("date", p.date).eq("slot", p.slot);
      const { error } = await q;
      if (error) break;
      // drop only this exact entry (a newer toggle for the same slot may have been queued meanwhile)
      put(K.pending, pending().filter((x) => !(x.date === p.date && x.slot === p.slot && x.done_at === p.done_at)));
    }
    return pending().length;
  })().finally(() => (flushing = null));
  return flushing;
}

/* ───────── load ───────── */

export async function loadAll(): Promise<Snapshot> {
  if (!cloudEnabled) return cached();
  await flushPending();
  const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const [s, c, st, l] = await Promise.all([
    sb().from("schedules").select("*").order("created_at"),
    sb().from("checkins").select("date,slot,done_at,source").gte("date", since),
    sb().from("settings").select("data,ics_token").maybeSingle(),
    sb().from("skin_logs").select("*").order("date"),
  ]);
  const err = s.error || c.error || st.error || l.error;
  if (err) {
    console.warn("load failed, using cache", err);
    return cached();
  }
  let settings = st.data as SettingsRow | null;
  if (!settings) {
    const ins = await sb().from("settings").insert({ data: {} }).select("data,ics_token").single();
    settings = (ins.data as SettingsRow) || { data: {} };
  }
  const snap: Snapshot = {
    schedules: (s.data || []) as ScheduleRow[],
    checkins: applyPending((c.data || []) as Checkin[]),
    settings,
    skinLogs: (l.data || []) as SkinLog[],
  };
  cache(snap);
  return snap;
}

/* ───────── writes ───────── */

export function setCheckin(snap: Snapshot, date: string, slot: Slot, done: boolean, source: Checkin["source"] = "app"): Snapshot {
  const done_at = new Date().toISOString();
  let checkins = snap.checkins.filter((r) => !(r.date === date && r.slot === slot));
  if (done) checkins = [...checkins, { date, slot, done_at, source }];
  put(K.checkins, checkins);
  if (cloudEnabled) {
    put(K.pending, [...pending().filter((p) => !(p.date === date && p.slot === slot)), { date, slot, done, done_at, source }]);
    flushPending().catch(() => {});
  }
  return { ...snap, checkins };
}

export async function addSchedule(snap: Snapshot, row: Omit<ScheduleRow, "id" | "created_at">): Promise<Snapshot> {
  let saved: ScheduleRow;
  if (cloudEnabled) {
    const { data, error } = await sb().from("schedules").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    saved = data as ScheduleRow;
  } else saved = { ...row, id: Date.now(), created_at: new Date().toISOString() };
  const next = { ...snap, schedules: [...snap.schedules, saved] };
  put(K.schedules, next.schedules);
  return next;
}

export async function updateSchedule(snap: Snapshot, id: ScheduleRow["id"], patch: Partial<ScheduleRow>): Promise<Snapshot> {
  if (cloudEnabled) {
    const { error } = await sb().from("schedules").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }
  const next = { ...snap, schedules: snap.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
  put(K.schedules, next.schedules);
  return next;
}

export async function deleteSchedule(snap: Snapshot, id: ScheduleRow["id"]): Promise<Snapshot> {
  if (cloudEnabled) {
    const { error } = await sb().from("schedules").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
  const next = { ...snap, schedules: snap.schedules.filter((s) => s.id !== id) };
  put(K.schedules, next.schedules);
  return next;
}

export async function saveSettings(snap: Snapshot, data: Record<string, any>): Promise<Snapshot> {
  if (cloudEnabled) {
    const { error } = await sb().from("settings").update({ data, updated_at: new Date().toISOString() }).not("user_id", "is", null);
    if (error) throw new Error(error.message);
  }
  const next = { ...snap, settings: { ...snap.settings, data } };
  put(K.settings, next.settings);
  return next;
}

export async function regenerateIcsToken(snap: Snapshot): Promise<Snapshot> {
  const ics_token = randomHex();
  if (cloudEnabled) {
    const { error } = await sb().from("settings").update({ ics_token }).not("user_id", "is", null);
    if (error) throw new Error(error.message);
  }
  const next = { ...snap, settings: { ...snap.settings, ics_token } };
  put(K.settings, next.settings);
  return next;
}

export async function upsertSkinLog(snap: Snapshot, log: SkinLog): Promise<Snapshot> {
  const row = { ...log, updated_at: new Date().toISOString() };
  if (cloudEnabled) {
    const { error } = await sb().from("skin_logs").upsert(row);
    if (error) throw new Error(error.message);
  }
  const next = {
    ...snap,
    skinLogs: [...snap.skinLogs.filter((l) => l.date !== log.date), row].sort((a, b) => a.date.localeCompare(b.date)),
  };
  put(K.skin, next.skinLogs);
  return next;
}

/** Restore a backup. Local mode overwrites; cloud mode upserts rows (existing data is kept). */
export async function importSnapshot(snap: Snapshot, data: Snapshot): Promise<Snapshot> {
  if (cloudEnabled) {
    const strip = (r: any) => {
      const { user_id, id, ...rest } = r;
      return rest;
    };
    for (const s of data.schedules) {
      if (snap.schedules.some((x) => x.created_at === s.created_at && x.name === s.name)) continue;
      const { error } = await sb().from("schedules").insert(strip(s));
      if (error) throw new Error(error.message);
    }
    if (data.checkins.length) {
      const { error } = await sb().from("checkins").upsert(data.checkins.map(strip));
      if (error) throw new Error(error.message);
    }
    if (data.skinLogs.length) {
      const { error } = await sb().from("skin_logs").upsert(data.skinLogs.map(strip));
      if (error) throw new Error(error.message);
    }
    await sb().from("settings").update({ data: data.settings.data }).not("user_id", "is", null);
    return loadAll();
  }
  const next: Snapshot = { ...data, settings: { ...data.settings, ics_token: data.settings.ics_token || randomHex() } };
  cache(next);
  return next;
}

export function clearLocal() {
  for (const k of Object.values(K)) localStorage.removeItem(k);
}
