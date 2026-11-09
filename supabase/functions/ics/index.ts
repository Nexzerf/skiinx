// GET /functions/v1/ics?token=<ics_token>[&download=1]  → calendar feed (60 days, 2 alarms per routine).
// Works as a subscribe URL (webcal://) or a one-off download. Deploy with --no-verify-jwt.
import * as core from "../_shared/core.js";
import { admin, env, loadUser } from "../_shared/db.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  if (!/^[0-9a-f]{20,}$/i.test(token)) return new Response("not found", { status: 404 });
  const db = admin();
  const { data: row } = await db.from("settings").select("*").eq("ics_token", token).maybeSingle();
  if (!row) return new Response("not found", { status: 404 });
  const ctx = await loadUser(db, row);
  const ics = core.buildIcs({ schedules: ctx.schedules, settings: ctx.settings, from: ctx.today, days: 60, appUrl: env("APP_URL") });
  const headers: Record<string, string> = { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "max-age=900" };
  if (url.searchParams.get("download")) headers["Content-Disposition"] = 'attachment; filename="skincare.ics"';
  return new Response(ics, { headers });
});
