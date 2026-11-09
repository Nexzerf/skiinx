// POST from Settings ("ส่งแจ้งเตือนทดสอบ"). Verifies the caller's JWT itself, then sends to every
// configured channel and reports per channel, so the page can say exactly what worked.
import * as core from "../_shared/core.js";
import { CORS, admin, json, loadUser } from "../_shared/db.ts";
import { discordReady, reminderButtons, routineEmbed, sendDiscord } from "../_shared/discord.ts";
import { pushAll } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = admin();
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth?.user) return json({ ok: false, error: "unauthorized" }, 401, CORS);
  const { data: row } = await db.from("settings").select("*").eq("user_id", auth.user.id).maybeSingle();
  if (!row) return json({ ok: false, error: "no settings" }, 400, CORS);

  const out: any = { ok: true, discord: null, push: null };
  try {
    const ctx = await loadUser(db, row);
    const slot = core.logicalMinutes(new Date(), ctx.settings) < 15 * 60 ? "am" : "pm";
    const info = core.dayInfo(ctx.today, ctx.schedules, ctx.settings);
    if (discordReady(ctx.settings)) {
      out.discord = await sendDiscord(db, row, {
        content: "🧪 ข้อความทดสอบจาก SkinDaily",
        embeds: info ? [routineEmbed(info, slot, ctx.settings, "ทดสอบ · ปุ่มด้านล่างใช้ได้จริง")] : [],
        components: info ? reminderButtons(ctx.today, slot) : [],
      });
    }
    out.push = await pushAll(db, row.user_id, {
      title: "SkinDaily — ทดสอบการแจ้งเตือน",
      body: info ? `วัน ${info.n}/${info.len} · ${info[slot].map((s: any) => s.name).join(" → ")}` : "การแจ้งเตือนพร้อมใช้งาน",
      tag: "test",
      url: `/focus/${slot}`,
      date: ctx.today,
      slot,
      actions: !!info,
    });
  } catch (e) {
    out.ok = false;
    out.error = String(e);
  }
  return json(out, 200, CORS);
});
