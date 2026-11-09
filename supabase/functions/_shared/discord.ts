// Discord helpers: DM via bot (with buttons) or channel webhook (link only), embeds, signature check.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import * as core from "./core.js";
import { env } from "./db.ts";

const API = "https://discord.com/api/v10";
const SLOT = { am: "☀️ เช้า", pm: "🌙 ก่อนนอน" } as const;

export type Msg = { content?: string; embeds?: any[]; components?: any[] };
export type SendResult = { ok: true } | { ok: false; status: number; error: string; retryAfter?: number };

const mode = (): "bot" | "webhook" => (env("DISCORD_MODE") === "webhook" ? "webhook" : "bot");
/** Discord is usable when its secrets exist and the user hasn't switched it off in Settings. */
export const discordReady = (settings: any) =>
  settings.discordEnabled !== false && (mode() === "webhook" ? !!env("DISCORD_WEBHOOK_URL") : !!(env("DISCORD_BOT_TOKEN") && env("DISCORD_USER_ID")));
const hexToInt = (hex: string) => parseInt(String(hex || "#f472b6").replace("#", ""), 16) || 0xf472b6;

async function result(res: Response): Promise<SendResult> {
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, error: body?.message || res.statusText, retryAfter: body?.retry_after };
}

async function dmChannel(db: SupabaseClient, settingsRow: any): Promise<string> {
  if (settingsRow.discord_dm_channel) return settingsRow.discord_dm_channel;
  const res = await fetch(`${API}/users/@me/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${env("DISCORD_BOT_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: env("DISCORD_USER_ID") }),
  });
  if (!res.ok) throw new Error(`open DM failed: ${res.status} ${await res.text()}`);
  const { id } = await res.json();
  await db.from("settings").update({ discord_dm_channel: id }).eq("user_id", settingsRow.user_id);
  settingsRow.discord_dm_channel = id;
  return id;
}

/** Send to the owner. In webhook mode buttons are dropped (webhooks can't carry interactive components). */
export async function sendDiscord(db: SupabaseClient, settingsRow: any, msg: Msg): Promise<SendResult> {
  const uid = env("DISCORD_USER_ID");
  const content = uid ? `<@${uid}> ${msg.content ?? ""}`.trim() : msg.content;
  if (mode() === "webhook") {
    return result(
      await fetch(env("DISCORD_WEBHOOK_URL") + "?wait=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, embeds: msg.embeds, allowed_mentions: { users: uid ? [uid] : [] } }),
      }),
    );
  }
  const ch = await dmChannel(db, settingsRow);
  return result(
    await fetch(`${API}/channels/${ch}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${env("DISCORD_BOT_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content, embeds: msg.embeds, components: msg.components }),
    }),
  );
}

export function routineEmbed(info: any, slot: "am" | "pm", settings: any, footer: string) {
  const steps = info[slot]
    .map((s: any, i: number) => `${i + 1}. ${s.name}${s.timer?.kind === "hold" ? ` ⏱ ${s.timer.min}-${s.timer.max} นาที` : ""}${s.swapped ? " 🔄" : ""}`)
    .join("\n");
  const typePart = slot === "pm" && info.type ? ` · [${info.type}] ${info.typeLabel}` : "";
  return {
    title: `วัน ${info.n}/${info.len}${typePart} · ${SLOT[slot]}`,
    description: steps + (info.note && slot === "pm" ? `\n\n💡 ${info.note}` : "") + (info.sensitive ? "\n\n🔄 โหมดผิวแสบ: สลับคลีนเซอร์เป็นตัวอ่อนโยน" : ""),
    color: hexToInt(slot === "pm" && info.type ? settings.typeColors?.[info.type] : "#fbbf24"),
    footer: { text: footer },
    url: env("APP_URL") ? `${env("APP_URL")}/focus/${slot}` : undefined,
  };
}

export function reminderButtons(date: string, slot: "am" | "pm") {
  const row: any[] = [
    { type: 2, style: 3, label: "ทาแล้ว ✅", custom_id: `done|${date}|${slot}` },
    { type: 2, style: 2, label: "เลื่อน 15 นาที", custom_id: `snooze|${date}|${slot}|15` },
  ];
  if (env("APP_URL")) row.push({ type: 2, style: 5, label: "เปิดแอพ", url: `${env("APP_URL")}/focus/${slot}` });
  return [{ type: 1, components: row }];
}

/** Numbers for the Sunday summary (shared by Discord embed and the phone notification). */
export function weeklyNumbers(ctx: { today: string; checks: Set<string>; streak: any; schedules: any[]; settings: any; skinLogs: any[] }) {
  const { today, checks, schedules, settings, skinLogs } = ctx;
  const from = core.weekStart(today);
  const st = core.periodStats(from, today, checks);
  let nextPhoto = "";
  for (let i = 1; i <= 60 && !nextPhoto; i++) {
    const d = core.addDays(today, i);
    const inf = core.dayInfo(d, schedules, settings);
    if (inf?.photoDay) nextPhoto = `${d.split("-").reverse().join("/")} (วัน ${inf.n})`;
  }
  const avg = (a: string, b: string) => {
    const xs = skinLogs.filter((l) => l.date >= a && l.date <= b && l.overall != null).map((l) => l.overall);
    return xs.length ? xs.reduce((x: number, y: number) => x + y, 0) / xs.length : null;
  };
  const now = avg(from, today), prev = avg(core.addDays(from, -7), core.addDays(from, -1));
  const score = now == null ? "ยังไม่มีคะแนน" : `${now.toFixed(1)}/5${prev != null ? ` (สัปดาห์ก่อน ${prev.toFixed(1)})` : ""}`;
  return { from, st, nextPhoto, score };
}

export function weeklySummary(ctx: Parameters<typeof weeklyNumbers>[0]) {
  const { from, st, nextPhoto, score } = weeklyNumbers(ctx);
  const { today, streak } = ctx;
  return {
    content: "📊 สรุปสกินแคร์สัปดาห์นี้",
    embeds: [
      {
        title: `สัปดาห์ ${from.split("-").reverse().join("/")} – ${today.split("-").reverse().join("/")}`,
        color: 0xf472b6,
        fields: [
          { name: "ทาครบ", value: `${st.rate}% (${st.done}/${st.total} รอบ)`, inline: true },
          { name: "Streak", value: `🔥 ${streak.current} วัน (สูงสุด ${streak.best})`, inline: true },
          { name: "ลืมบ่อยสุด", value: st.worst?.text || "ไม่ลืมเลย 🎉" },
          { name: "ถ่ายรูปครั้งถัดไป", value: nextPhoto || "–", inline: true },
          { name: "คะแนนผิวเฉลี่ย (พอใจ)", value: score, inline: true },
        ],
      },
    ],
  };
}

/* ───────── interactions signature (Ed25519) ───────── */

const hex = (s: string) => new Uint8Array((s.match(/.{2}/g) || []).map((b) => parseInt(b, 16)));
let key: CryptoKey | null = null;
export async function verify(req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get("X-Signature-Ed25519");
  const ts = req.headers.get("X-Signature-Timestamp");
  if (!sig || !ts) return false;
  key ??= await crypto.subtle.importKey("raw", hex(env("DISCORD_PUBLIC_KEY")), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, hex(sig), new TextEncoder().encode(ts + body));
}
