"use client";
// App-wide data: one snapshot (schedules / check-ins / settings / skin logs) + everything derived
// from it with lib/core.js. Pages use `useData()`.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as core from "./core.js";
import * as store from "./store";
import { cloudEnabled, sb } from "./supabase";
import { clearNotification } from "./push";
import type { Checkin, Product, ScheduleRow, SkinLog, Slot, Snapshot } from "./types";
import Splash from "@/components/Splash";
import { captureAuthError } from "./authError";
import { REDEEM_TEXT, captureInvite, ensureMembership } from "./members";
import JoinGate from "@/components/JoinGate";

type Ctx = {
  ready: boolean;
  snap: Snapshot;
  now: Date;
  settings: ReturnType<typeof core.withDefaults>;
  schedules: ScheduleRow[]; // enabled only
  checks: Set<string>;
  today: string;
  info: any; // core.dayInfo(today)
  streak: ReturnType<typeof core.computeStreak>;
  firstDate: string | null;
  checkinOf: (date: string, slot: Slot) => Checkin | undefined;
  infoFor: (date: string) => any;
  setCheck: (date: string, slot: Slot, done: boolean, source?: Checkin["source"]) => void;
  addSchedule: (row: Omit<ScheduleRow, "id" | "created_at">) => Promise<void>;
  updateSchedule: (id: ScheduleRow["id"], patch: Partial<ScheduleRow>) => Promise<void>;
  deleteSchedule: (id: ScheduleRow["id"]) => Promise<void>;
  saveSettings: (patch: Record<string, any>) => Promise<void>;
  regenerateIcsToken: () => Promise<void>;
  upsertSkinLog: (log: SkinLog) => Promise<void>;
  importSnapshot: (s: Snapshot) => Promise<void>;
  addProduct: (p: Omit<Product, "id">) => Promise<void>;
  updateProduct: (id: Product["id"], patch: Partial<Product>) => Promise<void>;
  deleteProduct: (id: Product["id"]) => Promise<void>;
  reload: () => Promise<void>;
  email: string | null;
  role: string | null; // "owner" | "member" in cloud mode
};

const C = createContext<Ctx | null>(null);
const EMPTY: Snapshot = { schedules: [], checkins: [], settings: { data: {} }, skinLogs: [], products: [] };

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [gate, setGate] = useState<{ error: string | null } | null>(null); // signed in but not a member
  const [splash, setSplash] = useState(true);
  const [minShown, setMinShown] = useState(false);
  const hideSplash = useCallback(() => setSplash(false), []);
  const signedIn = useRef(false);
  const userIdRef = useRef<string | undefined>(undefined);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const router = useRouter();
  const path = usePathname();

  const reload = useCallback(async () => {
    try {
      setSnap(await store.loadAll(userIdRef.current));
    } catch (e) {
      console.warn(e);
      setSnap(store.cached());
    }
    setReady(true);
  }, []);

  // keep the launch screen up for a beat so it never just flickers
  useEffect(() => {
    const t = setTimeout(() => setMinShown(true), 650);
    return () => clearTimeout(t);
  }, []);

  // auth gate (cloud mode) + first load
  useEffect(() => {
    if (!cloudEnabled) {
      setSnap(store.cached());
      setReady(true);
      return;
    }
    captureAuthError();
    captureInvite();
    const auth = sb().auth;
    const enter = async (userId: string, mail: string | null) => {
      if (signedIn.current && userIdRef.current === userId) return;
      signedIn.current = true;
      userIdRef.current = userId;
      setEmail(mail);
      // members only — the first account becomes the owner, others need an invite
      let m: Awaited<ReturnType<typeof ensureMembership>> | null = null;
      try {
        m = await ensureMembership();
      } catch (e) {
        console.warn("membership check failed", e); // offline: fall through to the cached data
      }
      if (m && !m.role) {
        setGate({ error: m.redeem && m.redeem !== "ok" ? REDEEM_TEXT[m.redeem] : null });
        setReady(true);
        return;
      }
      setRole(m?.role ?? null);
      setGate(null);
      await reload();
      const p = window.location.pathname;
      if (p === "/login" || p === "/join") router.replace("/");
    };
    auth.getSession().then(({ data }) => {
      const s = data.session;
      if (!s) {
        if (window.location.pathname !== "/login") router.replace("/login");
        setSnap(EMPTY);
        setReady(true);
        return;
      }
      if (store.cacheOwner() === s.user.id) setSnap(store.cached()); // instant paint from this user's cache
      enter(s.user.id, s.user.email ?? null);
    });
    const { data: sub } = auth.onAuthStateChange((ev, session) => {
      if (ev === "SIGNED_IN" && session) enter(session.user.id, session.user.email ?? null);
      if (ev === "SIGNED_OUT") {
        signedIn.current = false;
        userIdRef.current = undefined;
        store.clearLocal(); // don't leave this account's data on a shared device
        setSnap(EMPTY);
        setEmail(null);
        setRole(null);
        setGate(null);
        router.replace("/login");
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // clock + refresh when the app comes back (Discord / notification buttons tick on the server)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        if (cloudEnabled && signedIn.current) reload();
      }
    };
    const onOnline = () => {
      if (!signedIn.current) return;
      store.flushPending().then(() => reload());
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [reload]);

  const settings = useMemo(() => core.withDefaults(snap.settings.data), [snap.settings.data]);
  const schedules = useMemo(() => snap.schedules.filter((s) => s.enabled), [snap.schedules]);
  const checks = useMemo(() => core.toCheckSet(snap.checkins), [snap.checkins]);
  const today = core.logicalDate(now, settings);
  const firstDate = useMemo(
    () => (schedules.length ? schedules.map((s) => s.start_date).sort()[0] : null),
    [schedules],
  );
  const infoCache = useMemo(() => new Map<string, any>(), [schedules, settings]);
  const infoFor = useCallback(
    (date: string) => {
      if (!infoCache.has(date)) infoCache.set(date, core.dayInfo(date, schedules, settings));
      return infoCache.get(date);
    },
    [infoCache, schedules, settings],
  );
  const info = infoFor(today);
  const streak = useMemo(
    () => core.computeStreak(today, checks, firstDate && firstDate <= today ? firstDate : null, settings),
    [today, checks, firstDate, settings],
  );

  // keep the ref in step immediately so back-to-back writes never start from a stale snapshot
  const commit = (next: Snapshot) => {
    snapRef.current = next;
    setSnap(next);
  };
  const wrap = (fn: (s: Snapshot, ...a: any[]) => Promise<Snapshot>) =>
    async (...a: any[]) => commit(await fn(snapRef.current, ...a));

  const value: Ctx = {
    ready,
    snap,
    now,
    settings,
    schedules,
    checks,
    today,
    info,
    streak,
    firstDate,
    infoFor,
    checkinOf: (date, slot) => snap.checkins.find((c) => c.date === date && c.slot === slot),
    setCheck: (date, slot, done, source = "app") => {
      commit(store.setCheckin(snapRef.current, date, slot, done, source));
      if (done) clearNotification(date, slot);
    },
    addSchedule: wrap(store.addSchedule) as any,
    updateSchedule: wrap(store.updateSchedule) as any,
    deleteSchedule: wrap(store.deleteSchedule) as any,
    saveSettings: async (patch) => commit(await store.saveSettings(snapRef.current, { ...snapRef.current.settings.data, ...patch })),
    regenerateIcsToken: wrap(store.regenerateIcsToken) as any,
    upsertSkinLog: wrap(store.upsertSkinLog) as any,
    importSnapshot: wrap(store.importSnapshot) as any,
    addProduct: wrap(store.addProduct) as any,
    updateProduct: wrap(store.updateProduct) as any,
    deleteProduct: wrap(store.deleteProduct) as any,
    reload,
    email,
    role,
  };
  return (
    <C.Provider value={value}>
      {gate ? (
        <JoinGate
          initialError={gate.error}
          onJoined={async () => {
            setGate(null);
            setRole("member");
            await reload();
            router.replace("/");
          }}
        />
      ) : (
        children
      )}
      {splash && <Splash done={ready && minShown} onGone={hideSplash} />}
    </C.Provider>
  );
}

export function useData() {
  const v = useContext(C);
  if (!v) throw new Error("useData outside DataProvider");
  return v;
}
