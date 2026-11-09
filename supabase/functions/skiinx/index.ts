// One edge function, several routes (one deploy, one URL prefix):
//   POST /skiinx/remind        ← pg_cron every 5 min (x-cron-secret)
//   POST /skiinx/discord       ← Discord Interactions endpoint (Ed25519 signature)
//   GET  /skiinx/ics           ← calendar feed (?token=)
//   POST /skiinx/push-action   ← notification buttons from the service worker (device token)
//   POST /skiinx/test-notify   ← Settings page "send test" (user JWT)
// Deploy with verify_jwt = false: every route authenticates itself.
import { CORS, admin, loadConfig } from "./lib/db.ts";
import remind from "./routes/remind.ts";
import discord from "./routes/discord.ts";
import ics from "./routes/ics.ts";
import pushAction from "./routes/push-action.ts";
import testNotify from "./routes/test-notify.ts";

const ROUTES: Record<string, (req: Request) => Promise<Response>> = {
  remind,
  discord,
  ics,
  "push-action": pushAction,
  "test-notify": testNotify,
};

Deno.serve(async (req) => {
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
  const handler = ROUTES[route];
  if (!handler) return new Response("not found", { status: 404, headers: CORS });
  try {
    await loadConfig(admin());
    return await handler(req);
  } catch (e) {
    console.error(route, e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
  }
});
