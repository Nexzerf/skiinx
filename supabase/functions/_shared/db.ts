// Service-role helpers shared by the edge functions. The service key never reaches the browser.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import * as core from "./core.js";

export const env = (k: string) => Deno.env.get(k) ?? "";

export function admin(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

export type UserCtx = {
  userId: string;
  settingsRow: { user_id: string; data: any; ics_token: string; discord_dm_channel: string | null };
  settings: any;
  schedules: any[];
  checks: Set<string>;
  states: Record<string, any>;
  today: string;
  streak: ReturnType<typeof core.computeStreak>;
  firstDate: string | null;
};

/** Everything core.js needs for one user at instant `now`. */
export async function loadUser(db: SupabaseClient, settingsRow: any, now = new Date()): Promise<UserCtx> {
  const userId = settingsRow.user_id;
  const settings = core.withDefaults(settingsRow.data);
  const today = core.logicalDate(now, settings);
  const [s, c, r] = await Promise.all([
    db.from("schedules").select("id,name,data,start_date,created_at").eq("user_id", userId).eq("enabled", true),
    db.from("checkins").select("date,slot").eq("user_id", userId).gte("date", core.addDays(today, -400)),
    db.from("reminder_state").select("*").eq("user_id", userId).in("date", [today, core.addDays(today, -1)]),
  ]);
  if (s.error || c.error || r.error) throw new Error((s.error || c.error || r.error)!.message);
  const schedules = s.data || [];
  const checks = core.toCheckSet(c.data || []);
  const states: Record<string, any> = {};
  for (const row of r.data || []) states[core.ckey(row.date, row.slot)] = row;
  const firstDate = schedules.length ? schedules.map((x: any) => x.start_date).sort()[0] : null;
  const streak = core.computeStreak(today, checks, firstDate && firstDate <= today ? firstDate : null, settings);
  return { userId, settingsRow, settings, schedules, checks, states, today, streak, firstDate };
}

/** The single owner of this deployment (APP_USER_ID secret, else the most recent settings row). */
export async function ownerSettings(db: SupabaseClient) {
  const id = env("APP_USER_ID");
  const q = db.from("settings").select("*");
  const { data, error } = id ? await q.eq("user_id", id).maybeSingle() : await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Mark a routine done (from Discord or a notification button). */
export async function markDone(db: SupabaseClient, userId: string, date: string, slot: string, source: "discord" | "push") {
  return db.from("checkins").upsert({ user_id: userId, date, slot, source, done_at: new Date().toISOString() });
}

/** Silence a routine for `mins` minutes, keeping its send counters. */
export async function snooze(db: SupabaseClient, userId: string, date: string, slot: string, mins: number) {
  const until = new Date(Date.now() + mins * 60e3);
  const { data: st } = await db.from("reminder_state").select("*").eq("user_id", userId).eq("date", date).eq("slot", slot).maybeSingle();
  await db.from("reminder_state").upsert({
    user_id: userId, date, slot,
    sent_count: st?.sent_count ?? 0, last_sent: st?.last_sent ?? null, snooze_until: until.toISOString(),
  });
  return until;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
