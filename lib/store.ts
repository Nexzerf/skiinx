// Persistence layer. Two backends behind one API:
//  • local mode  — everything in localStorage (no account needed, works offline)
//  • cloud mode  — Supabase tables (RLS); a localStorage copy is kept as an offline cache,
//                  and check-ins made offline wait in `pendingCheckins` until we're online.
import { cloudEnabled, sb } from "./supabase";
import type { Checkin, Product, ScheduleRow, SettingsRow, SkinLog, Slot, Snapshot } from "./types";

const K = {
  schedules: "sd.schedules",
  checkins: "sd.checkins",
  settings: "sd.settings",
  skin: "sd.skinlogs",
  products: "sd.products",
  pending: "pendingCheckins",
  owner: "sd.owner", // user id the cached copy belongs to (absent = data made without an account)
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
    products: get<Product[]>(K.products, []),
  };
}

function cache(s: Snapshot) {
  put(K.schedules, s.schedules);
  put(K.checkins, s.checkins);
  put(K.settings, s.settings);
  put(K.skin, s.skinLogs);
  put(K.products, s.products);
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

export async function loadAll(userId?: string): Promise<Snapshot> {
  if (!cloudEnabled) return cached();
  // never show/sync one account's cached data under another account
  const owner = get<string | null>(K.owner, null);
  let local: Snapshot | null = null;
  if (userId && owner && owner !== userId) clearLocal();
  else if (userId && !owner) {
    const c = cached();
    if (c.schedules.length || c.checkins.length || c.skinLogs.length || c.products.length) local = c;
  }
  if (userId) put(K.owner, userId);
  await flushPending();
  const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const [s, c, st, l, pr] = await Promise.all([
    sb().from("schedules").select("*").order("created_at"),
    sb().from("checkins").select("date,slot,done_at,source").gte("date", since),
    sb().from("settings").select("data,ics_token").maybeSingle(),
    sb().from("skin_logs").select("*").order("date"),
    sb().from("skiinx_products").select("*").order("created_at"),
  ]);
  const err = s.error || c.error || st.error || l.error || pr.error;
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
    products: (pr.data || []) as Product[],
  };
  // first sign-in on a device that was used without an account: carry that data up once
  if (local && !snap.schedules.length && !snap.checkins.length && !snap.skinLogs.length && !snap.products.length) {
    try {
      return await importSnapshot(snap, { ...local, settings: { ...local.settings, data: { ...local.settings.data } } });
    } catch (e) {
      console.warn("migrating local data failed", e);
    }
  }
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
    for (const p of data.products || []) {
      if (snap.products.some((x) => x.name === p.name && (x.brand || "") === (p.brand || ""))) continue;
      const { created_at, ...rest } = strip(p);
      // device-only photos (data: URLs) are too big for a row — keep the icon instead
      if (rest.image_url?.startsWith("data:")) rest.image_url = null;
      const { error } = await sb().from("skiinx_products").insert(rest);
      if (error) throw new Error(error.message);
    }
    const { error } = await sb().from("settings").update({ data: data.settings.data }).not("user_id", "is", null);
    if (error) throw new Error(error.message);
    return loadAll();
  }
  const next: Snapshot = { ...data, products: data.products || [], settings: { ...data.settings, ics_token: data.settings.ics_token || randomHex() } };
  cache(next);
  return next;
}

/* ───────── shelf ───────── */

const PRODUCT_COLS = ["name", "brand", "category", "actives", "ingredients", "howto", "image_url", "icon", "color", "source", "off_code"] as const;
const pick = (p: Partial<Product>) => Object.fromEntries(PRODUCT_COLS.filter((k) => k in p).map((k) => [k, (p as any)[k]]));

export async function addProduct(snap: Snapshot, p: Omit<Product, "id">): Promise<Snapshot> {
  let saved: Product;
  if (cloudEnabled) {
    const { data, error } = await sb().from("skiinx_products").insert(pick(p)).select("*").single();
    if (error) throw new Error(error.message);
    saved = data as Product;
  } else saved = { ...p, id: `p${Date.now().toString(36)}${randomHex(2)}`, created_at: new Date().toISOString() } as Product;
  const next = { ...snap, products: [...snap.products, saved] };
  put(K.products, next.products);
  return next;
}

export async function updateProduct(snap: Snapshot, id: Product["id"], patch: Partial<Product>): Promise<Snapshot> {
  if (cloudEnabled) {
    const { error } = await sb().from("skiinx_products").update(pick(patch)).eq("id", id);
    if (error) throw new Error(error.message);
  }
  const next = { ...snap, products: snap.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
  put(K.products, next.products);
  return next;
}

export async function deleteProduct(snap: Snapshot, id: Product["id"]): Promise<Snapshot> {
  const p = snap.products.find((x) => x.id === id);
  if (cloudEnabled) {
    const { error } = await sb().from("skiinx_products").delete().eq("id", id);
    if (error) throw new Error(error.message);
    const path = p?.image_url?.split("/product-images/")[1];
    if (path) sb().storage.from("product-images").remove([decodeURIComponent(path)]).catch(() => {});
  }
  const next = { ...snap, products: snap.products.filter((x) => x.id !== id) };
  put(K.products, next.products);
  return next;
}

/** Store a product photo: Supabase Storage in cloud mode, an inline data URL on-device. */
export async function uploadProductImage(blob: Blob): Promise<string> {
  if (!cloudEnabled) {
    return await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }
  const { data: u } = await sb().auth.getUser();
  if (!u.user) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
  const path = `${u.user.id}/${Date.now().toString(36)}${randomHex(4)}.${ext}`;
  const { error } = await sb().storage.from("product-images").upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error(error.message);
  return sb().storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

export const cacheOwner = () => get<string | null>(K.owner, null);

export function clearLocal() {
  for (const k of Object.values(K)) localStorage.removeItem(k);
}

/**
 * Start over: delete schedules, check-ins and skin scores — in the cloud too (clearing only the
 * local cache made everything come straight back on the next sync). The shelf (products) and
 * settings are kept. RLS limits the deletes to the signed-in user's own rows.
 */
export async function resetData() {
  if (cloudEnabled) {
    for (const table of ["checkins", "skin_logs", "schedules"] as const) {
      const { error } = await sb().from(table).delete().not("user_id", "is", null);
      if (error) throw new Error(error.message);
    }
  }
  for (const k of [K.schedules, K.checkins, K.skin, K.pending]) localStorage.removeItem(k);
}
