// Skiinx service worker: keeps the app shell available offline.
// Pages → network first (fresh deploys), falling back to cache. Static assets → cache first.
// Supabase / anything cross-origin is never cached.
const CACHE = "skiinx-v3";
const SHELL = ["/", "/calendar", "/photos", "/schedule", "/settings", "/focus/am", "/focus/pm", "/focus/now", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(url.pathname.startsWith("/focus") ? "/focus/now" : "/"))),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/mediapipe/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});

/* ───────── notifications (Web Push from the `remind` edge function) ───────── */

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "Skiinx", body: e.data ? e.data.text() : "" };
  }
  const actions = d.actions
    ? [
        { action: "done", title: "ทาแล้ว" },
        { action: "snooze", title: "เลื่อน 15 นาที" },
      ]
    : [];
  e.waitUntil(
    self.registration.showNotification(d.title || "Skiinx", {
      body: d.body || "",
      tag: d.tag || "skiinx",
      renotify: true,
      requireInteraction: !!d.actions,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      vibrate: [180, 80, 180],
      data: d,
      actions,
    }),
  );
});

async function openApp(path) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) {
    if ("focus" in c) {
      await c.focus();
      if ("navigate" in c) return c.navigate(path);
      return;
    }
  }
  return self.clients.openWindow(path);
}

self.addEventListener("notificationclick", (e) => {
  const n = e.notification;
  const d = n.data || {};
  n.close();
  if ((e.action === "done" || e.action === "snooze") && d.api && d.token) {
    e.waitUntil(
      fetch(d.api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: d.token, action: e.action, date: d.date, slot: d.slot, minutes: 15 }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          if (e.action === "done")
            return self.registration.showNotification("บันทึกแล้ว", { body: "ทำได้ดีมาก ไว้เจอกันรอบหน้า", tag: d.tag, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", silent: true });
        })
        // offline or failed → open the app so the tick still happens
        .catch(() => openApp(d.url || "/")),
    );
    return;
  }
  e.waitUntil(openApp(d.url || "/"));
});
