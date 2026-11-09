// Discord Interactions endpoint (no always-on bot needed): buttons "ทาแล้ว"/"เลื่อน" and
// slash commands /today /tomorrow /streak. Deploy with --no-verify-jwt (Discord signs requests instead).
//
// Discord gives an interaction 3 seconds to answer, but a cold edge function + DB lookups takes
// 3–6 s ("This interaction failed"). So we ACK at once with a deferred response and do the real
// work in the background, then edit the message through the interaction webhook (no bot token
// or online bot needed — the interaction token is valid for 15 minutes).
import * as core from "../lib/core.js";
import { admin, json, loadUser, markDone, snooze } from "../lib/db.ts";
import { discordIdFor, routineEmbed, verify } from "../lib/discord.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const API = "https://discord.com/api/v10";
const SLOT_TH = { am: "ตอนเช้า", pm: "ก่อนนอน" } as const;
// what the background work decided: replace the original message, or a private note to the presser
type Out = { kind: "update"; data: any } | { kind: "ephemeral"; data: any };
const reply = (data: any): Out => ({ kind: "update", data });
const ephemeral = (content: string): Out => ({ kind: "ephemeral", data: { content } });

export default async function handler(req: Request): Promise<Response> {
  const body = await req.text();
  if (!(await verify(req, body))) return new Response("invalid request signature", { status: 401 });
  const it = JSON.parse(body);
  if (it.type === 1) return json({ type: 1 }); // PING

  const hook = `${API}/webhooks/${it.application_id}/${it.token}`;
  const finish = async () => {
    let out: Out;
    try {
      out = await work(it);
    } catch (e) {
      console.error("discord", e);
      out = ephemeral("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    }
    const send = (url: string, method: string, data: any) =>
      fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(async (r) => {
        if (!r.ok) console.error("discord followup", r.status, await r.text());
      });
    // buttons: an "update" edits the reminder message, an error is a private follow-up
    // slash commands: the deferred "thinking…" message is replaced either way
    if (out.kind === "ephemeral" && it.type === 3) await send(hook, "POST", { ...out.data, flags: 64 });
    else await send(`${hook}/messages/@original`, "PATCH", out.data);
  };
  const job = finish();
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(job);
  // 6 = DEFERRED_UPDATE_MESSAGE (button), 5 = DEFERRED_CHANNEL_MESSAGE ("Skiinx is thinking…")
  return json({ type: it.type === 3 ? 6 : 5 });
}

async function work(it: any): Promise<Out> {
  const who = String(it.user?.id ?? it.member?.user?.id ?? "");
  const db = admin();
  // whoever pressed the button / typed the command must be a Skiinx user linked to this Discord account
  const { data: rows } = await db.from("settings").select("*");
  let row: any = null;
  for (const r of rows || []) if (who && (await discordIdFor(db, r.user_id)) === who) { row = r; break; }
  if (!row) return ephemeral("บัญชี Discord นี้ยังไม่ได้เชื่อมกับ Skiinx — เข้าสู่ระบบในแอพด้วย Discord ก่อน");
  const now = new Date();

  // ── buttons
  if (it.type === 3) {
    const [action, date, slot, mins] = String(it.data.custom_id).split("|") as [string, string, "am" | "pm", string?];
    if (action === "done") {
      const { error } = await markDone(db, row.user_id, date, slot, "discord");
      if (error) return ephemeral("บันทึกไม่สำเร็จ: " + error.message);
      const ctx = await loadUser(db, row, now);
      const info = core.dayInfo(date, ctx.schedules, ctx.settings);
      return reply(
        { content: `✅ ทาแล้ว — วัน ${info?.n ?? "?"}/${info?.len ?? "?"} ${SLOT_TH[slot]} · 🔥 streak ${ctx.streak.current} วัน`, embeds: [], components: [] },
      ); // edits the reminder: buttons disappear
    }
    if (action === "snooze") {
      const until = await snooze(db, row.user_id, date, slot, +(mins || 15));
      const settings = core.withDefaults(row.data);
      const p = core.zonedParts(until, settings.tz);
      const hhmm = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
      return reply({ content: `⏰ จะเตือนอีกครั้ง ${hhmm} (${SLOT_TH[slot]})`, embeds: it.message?.embeds ?? [], components: [] });
    }
    return ephemeral("ไม่รู้จักปุ่มนี้");
  }

  // ── slash commands
  if (it.type === 2) {
    const ctx = await loadUser(db, row, now);
    const name = it.data.name;
    if (name === "today" || name === "tomorrow") {
      const date = name === "today" ? ctx.today : core.addDays(ctx.today, 1);
      const info = core.dayInfo(date, ctx.schedules, ctx.settings);
      if (!info) return ephemeral("ไม่มีตารางสำหรับวันนั้น");
      const embeds = (["am", "pm"] as const).map((slot) => {
        const done = ctx.checks.has(core.ckey(date, slot));
        return routineEmbed(info, slot, ctx.settings, name === "today" ? (done ? "✅ ทาแล้ว" : "⬜ ยังไม่ได้ทา") : "พรุ่งนี้");
      });
      return reply({ content: `${name === "today" ? "📅 วันนี้" : "🗓️ พรุ่งนี้"} ${date.split("-").reverse().join("/")}`, embeds });
    }
    if (name === "streak") {
      const st = core.periodStats(core.weekStart(ctx.today), ctx.today, ctx.checks);
      return reply({
        content: `🔥 streak ${ctx.streak.current} วัน (สูงสุด ${ctx.streak.best})\n📊 สัปดาห์นี้ทาครบ ${st.rate}% · บัตรผ่านเหลือ ${ctx.streak.freezesLeftThisWeek ?? 0} ใบ${st.worst ? `\n😴 ลืมบ่อยสุด: ${st.worst.text}` : ""}`,
      });
    }
  }
  return ephemeral("ไม่รู้จักคำสั่งนี้");
}
