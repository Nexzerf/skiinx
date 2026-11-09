// Web Push to every device the owner enabled notifications on (VAPID).
import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { env } from "./db.ts";

let ready = false;
export function pushReady() {
  if (ready) return true; // only cache success: keys may be added to Vault after the first run
  const pub = env("VAPID_PUBLIC_KEY"), priv = env("VAPID_PRIVATE_KEY");
  ready = !!(pub && priv);
  // subject must be a mailto: or https: URL — the app's own URL keeps personal email out of it
  if (ready) webpush.setVapidDetails(env("VAPID_SUBJECT") || env("APP_URL") || "https://skiinx.vercel.app", pub, priv);
  return ready;
}

export type PushPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
  date?: string;
  slot?: "am" | "pm";
  actions?: boolean; // show "ทาแล้ว" / "เลื่อน 15 นาที" buttons
};

/** Returns how many devices accepted it. Subscriptions the browser revoked (404/410) are removed. */
export async function pushAll(db: SupabaseClient, userId: string, payload: PushPayload) {
  if (!pushReady()) return { configured: false, sent: 0, failed: 0 };
  const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", userId);
  let sent = 0, failed = 0;
  const api = `${env("SUPABASE_URL")}/functions/v1/skiinx/push-action`;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...payload, token: s.token, api }),
        { TTL: 3600, urgency: "high", topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) },
      );
      sent++;
    } catch (e: any) {
      failed++;
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return { configured: true, sent, failed, devices: subs?.length ?? 0 };
}
