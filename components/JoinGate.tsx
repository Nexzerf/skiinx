"use client";
// Signed in, but not a member yet: ask for an invite code.
import { useState } from "react";
import { ArrowRight, LoaderCircle, LogOut, Sparkles, Ticket, TriangleAlert } from "lucide-react";
import { REDEEM_TEXT, normalizeCode, redeemInvite } from "@/lib/members";
import { sb } from "@/lib/supabase";

export default function JoinGate({ onJoined, initialError }: { onJoined: () => void; initialError?: string | null }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(initialError || null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await redeemInvite(code);
    if (r === "ok") onJoined();
    else {
      setErr(REDEEM_TEXT[r]);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-brand-100 via-canvas to-canvas" />
      <div className="float pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-300/30 blur-3xl" />
      <div className="stagger relative mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 py-10 text-center">
        <span className="splash-logo grid h-24 w-24 place-items-center rounded-[30px] text-white shadow-glow" style={{ background: "linear-gradient(135deg,#ff9fb6,#f1557a)" }}>
          <Ticket className="h-11 w-11" strokeWidth={1.8} />
        </span>
        <h1 className="mt-6 text-2xl font-bold">ใส่รหัสเชิญ</h1>
        <p className="mt-2 text-[15px] text-ink/70">Skiinx ใช้ได้เฉพาะคนที่ได้รับคำเชิญ ขอรหัสจากเพื่อนที่ใช้อยู่ แล้วใส่ตรงนี้</p>

        <form onSubmit={submit} className="mt-6 w-full space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, 12))}
            placeholder="ABCD2345"
            autoFocus
            autoCapitalize="characters"
            autoComplete="one-time-code"
            className="h-14 w-full rounded-2xl border border-brand-100 bg-white text-center text-xl font-bold tracking-[0.3em] uppercase shadow-soft outline-none placeholder:font-medium placeholder:tracking-[0.3em] placeholder:text-muted/40 focus:border-brand-300 focus:ring-4 focus:ring-brand-100"
            aria-label="รหัสเชิญ"
          />
          {err && (
            <p className="rise flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-left text-sm text-amber-800 ring-1 ring-amber-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {err}
            </p>
          )}
          <button className="btn-primary w-full py-3.5" disabled={busy || code.length < 6}>
            {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            เข้าร่วม
            {!busy && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <button className="mt-8 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted" onClick={() => sb().auth.signOut()}>
          <LogOut className="h-4 w-4" /> ใช้บัญชีอื่น
        </button>
      </div>
    </div>
  );
}
