// Discord Interactions endpoint (no always-on bot needed): buttons "ทาแล้ว"/"เลื่อน" and
// slash commands /today /tomorrow /streak. Deploy with --no-verify-jwt (Discord signs requests instead).
import * as core from "../_shared/core.js";
import { admin, env, json, loadUser, markDone, ownerSettings, snooze } from "../_shared/db.ts";
import { routineEmbed, verify } from "../_shared/discord.ts";

const SLOT_TH = { am: "ตอนเช้า", pm: "ก่อนนอน" } as const;
const reply = (data: any, type = 4) => json({ type, data });
const ephemeral = (content: string) => reply({ content, flags: 64 });

Deno.serve(async (req) => {
  const body = await req.text();
  if (!(await verify(req, body))) return new Response("invalid request signature", { status: 401 });
  const it = JSON.parse(body);
  if (it.type === 1) return json({ type: 1 }); // PING

  const who = it.user?.id ?? it.member?.user?.id;
  if (who !== env("DISCORD_USER_ID")) return ephemeral("บอทนี้ใช้ได้เฉพาะเจ้าของเท่านั้น");

  const db = admin();
  const row = await ownerSettings(db);
  if (!row) return ephemeral("ยังไม่มีผู้ใช้ในระบบ");
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
        7, // UPDATE_MESSAGE: buttons disappear
      );
    }
    if (action === "snooze") {
      const until = await snooze(db, row.user_id, date, slot, +(mins || 15));
      const settings = core.withDefaults(row.data);
      const p = core.zonedParts(until, settings.tz);
      const hhmm = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
      return reply({ content: `⏰ จะเตือนอีกครั้ง ${hhmm} (${SLOT_TH[slot]})`, embeds: it.message?.embeds ?? [], components: [] }, 7);
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
});
