// Called by pg_cron every 5 minutes. Decides (core.planReminders) and sends the nag to every
// channel that is set up: Discord DM and phone notifications (Web Push). Also the Sunday summary.
// Deploy with --no-verify-jwt; guarded by x-cron-secret.
import * as core from "../lib/core.js";
import { admin, env, json, loadUser } from "../lib/db.ts";
import { discordReady, reminderButtons, routineEmbed, sendDiscord, weeklyNumbers, weeklySummary } from "../lib/discord.ts";
import { pushAll, pushReady } from "../lib/push.ts";


export default async function handler(req: Request): Promise<Response> {
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return json({ error: "unauthorized" }, 401);
  const db = admin();
  const now = new Date();
  const [{ data: all, error }, { data: mem, error: mErr }] = await Promise.all([
    db.from("settings").select("*"),
    db.from("skiinx_members").select("user_id"),
  ]);
  if (error || mErr) return json({ error: (error || mErr)!.message }, 500);
  const members = new Set((mem || []).map((m: any) => m.user_id));
  const rows = (all || []).filter((r: any) => members.has(r.user_id));

  const report: any[] = [];
  for (const row of rows || []) {
    try {
      const ctx = await loadUser(db, row, now);
      const st = ctx.settings;
      const useDiscord = discordReady(st);
      const usePush = pushReady();
      if (!useDiscord && !usePush) continue;

      const plan = core.planReminders({ now, settings: st, schedules: ctx.schedules, checks: ctx.checks, states: ctx.states, streak: ctx.streak.current });
      for (const r of plan) {
        let delivered = false, rateLimited = false;
        const entry: any = { user: row.user_id, date: r.date, slot: r.slot, attempt: r.attempt };

        if (useDiscord) {
          const footer = `🔥 streak ${ctx.streak.current} วัน · เตือนครั้งที่ ${r.attempt}/${st.maxRepeats}`;
          const res = await sendDiscord(db, row, {
            content: r.text,
            embeds: [routineEmbed(r.info, r.slot, st, footer)],
            components: reminderButtons(r.date, r.slot),
          });
          entry.discord = res;
          delivered ||= res.ok;
          rateLimited = !res.ok && res.status === 429;
        }
        if (usePush) {
          const typePart = r.slot === "pm" && r.info.type ? ` · [${r.info.type}] ${r.info.typeLabel}` : "";
          const steps = r.info[r.slot].map((s: any) => s.name).join(" → ");
          const res = await pushAll(db, row.user_id, {
            title: `${r.text}`,
            body: `วัน ${r.info.n}/${r.info.len}${typePart}\n${steps}`,
            tag: `${r.date}-${r.slot}`,
            url: `/focus/${r.slot}`,
            date: r.date,
            slot: r.slot,
            actions: true,
          });
          entry.push = res;
          delivered ||= res.sent > 0;
        }
        report.push(entry);
        // failed sends don't count as an attempt; a rate-limited Discord retries on the next tick
        if (!delivered) {
          if (rateLimited) break;
          continue;
        }
        await db.from("reminder_state").upsert({
          user_id: row.user_id,
          date: r.date,
          slot: r.slot,
          sent_count: r.attempt,
          last_sent: now.toISOString(),
          snooze_until: ctx.states[core.ckey(r.date, r.slot)]?.snooze_until ?? null,
        });
      }

      // Sunday weekly summary (once per week)
      const p = core.zonedParts(now, st.tz);
      const wk = core.weekStart(ctx.today);
      if (st.weeklySummary && p.weekday === "Sun" && p.hour * 60 + p.minute >= core.toMin(st.summaryTime) && st.lastSummaryWeek !== wk) {
        const { data: logs } = await db.from("skin_logs").select("date,overall").eq("user_id", row.user_id).gte("date", core.addDays(wk, -7));
        const sctx = { ...ctx, skinLogs: logs || [] };
        let ok = false;
        if (useDiscord) ok = (await sendDiscord(db, row, weeklySummary(sctx))).ok || ok;
        if (usePush) {
          const n = weeklyNumbers(sctx);
          const res = await pushAll(db, row.user_id, {
            title: "สรุปสกินแคร์สัปดาห์นี้",
            body: `ทาครบ ${n.st.rate}% · streak ${ctx.streak.current} วัน${n.st.worst ? ` · ลืมบ่อยสุด ${n.st.worst.text}` : ""}`,
            tag: `summary-${wk}`,
            url: "/calendar",
          });
          ok = res.sent > 0 || ok;
        }
        if (ok) await db.from("settings").update({ data: { ...row.data, lastSummaryWeek: wk } }).eq("user_id", row.user_id);
        report.push({ user: row.user_id, summary: wk, ok });
      }
    } catch (e) {
      report.push({ user: row.user_id, error: String(e) });
    }
  }
  return json({ ok: true, at: now.toISOString(), sent: report });
}
