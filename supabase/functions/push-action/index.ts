// Buttons on a phone notification ("ทาแล้ว" / "เลื่อน 15 นาที") land here from the service worker.
// Auth = the per-device random token that came inside the push payload (no login needed).
import { CORS, admin, json, markDone, snooze } from "../_shared/db.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405, CORS);
  const { token, action, date, slot, minutes } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f]{20,}$/i.test(String(token || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !["am", "pm"].includes(slot))
    return json({ ok: false, error: "bad request" }, 400, CORS);

  const db = admin();
  const { data: sub } = await db.from("push_subscriptions").select("user_id").eq("token", token).maybeSingle();
  if (!sub) return json({ ok: false, error: "unknown device" }, 404, CORS);

  if (action === "done") {
    const { error } = await markDone(db, sub.user_id, date, slot, "push");
    return json({ ok: !error, error: error?.message }, error ? 500 : 200, CORS);
  }
  if (action === "snooze") {
    const until = await snooze(db, sub.user_id, date, slot, Math.min(120, Math.max(5, +minutes || 15)));
    return json({ ok: true, until }, 200, CORS);
  }
  return json({ ok: false, error: "unknown action" }, 400, CORS);
});
