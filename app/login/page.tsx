"use client";
import { useEffect, useState } from "react";
import { ArrowRight, BellRing, Ticket, ChevronDown, Droplets, Footprints, LoaderCircle, Mail, MailCheck, Moon, ScanFace, ShieldCheck, Sparkles, Sun, TriangleAlert, type LucideIcon } from "lucide-react";
import { cloudEnabled, sb } from "@/lib/supabase";
import { explainAuthError, takeAuthError } from "@/lib/authError";
import { pendingInvite } from "@/lib/members";
import DiscordLogo from "@/components/DiscordLogo";

const FEATURES: [LucideIcon, string, string][] = [
  [BellRing, "เตือนจนกว่าจะทา", "ส่งเข้า Discord และมือถือ ซ้ำจนกว่าจะติ๊ก"],
  [Footprints, "ทาทีละขั้น ไม่ต้องจำ", "ตารางสลับคืนไหนใช้อะไร แอพจัดให้"],
  [ScanFace, "ดูแนวโน้มผิว", "วิเคราะห์จากรูปบนเครื่อง เทียบได้ทุกเดือน"],
];

/** Small icon bubbles floating around the logo. */
const BUBBLES: { icon: LucideIcon; cls: string; delay: string }[] = [
  { icon: Droplets, cls: "-left-14 top-2 h-11 w-11 text-sky-500", delay: "0s" },
  { icon: Sun, cls: "-right-14 top-0 h-10 w-10 text-amber-500", delay: "0.8s" },
  { icon: Moon, cls: "-left-10 bottom-0 h-9 w-9 text-violet-500", delay: "1.6s" },
  { icon: Sparkles, cls: "-right-10 bottom-2 h-9 w-9 text-brand-500", delay: "2.2s" },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [state, setState] = useState<"idle" | "discord" | "email" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);
  useEffect(() => {
    setInvited(!!pendingInvite());
    const e = takeAuthError();
    if (e) {
      setError(e);
      if (/อีเมล/.test(e)) setShowEmail(true);
    }
  }, []);
  // Coming back from Discord with the back button restores this page from the back/forward
  // cache with the spinner still on — put the buttons back so the user can try again.
  useEffect(() => {
    const reset = () => setState((s) => (s === "discord" ? "idle" : s));
    const onShow = (e: PageTransitionEvent) => e.persisted && reset();
    const onVisible = () => document.visibilityState === "visible" && reset();
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  // safety net: if the redirect never happens, don't spin forever
  useEffect(() => {
    if (state !== "discord") return;
    const t = setTimeout(() => setState("idle"), 10_000);
    return () => clearTimeout(t);
  }, [state]);

  if (!cloudEnabled) return <p className="py-20 text-center text-muted">ข้อมูลทั้งหมดเก็บอยู่บนเครื่องนี้</p>;

  const discord = async () => {
    setError(null);
    setState("discord");
    const { error } = await sb().auth.signInWithOAuth({ provider: "discord", options: { redirectTo: window.location.origin } });
    if (error) {
      setError(explainAuthError(error.message));
      setState("idle");
    }
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setState("email");
    // email is for existing accounts only — new accounts come in through Discord
    const { error } = await sb().auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } });
    if (error) {
      setError(explainAuthError(error.message));
      setState("idle");
    } else setState("sent");
  };

  return (
    <div className="relative -mx-5 -mt-[max(1rem,env(safe-area-inset-top))] -mb-32 min-h-dvh overflow-hidden px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-brand-100 via-canvas to-canvas" />
      <div className="float pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-300/30 blur-3xl" />
      <div className="float pointer-events-none absolute top-56 -left-28 h-64 w-64 rounded-full bg-violet-300/25 blur-3xl" style={{ animationDelay: "1.5s" }} />

      <div className="stagger relative mx-auto flex max-w-sm flex-col items-center">
        {/* logo + floating bubbles */}
        <div className="relative mt-6 mb-6">
          {BUBBLES.map(({ icon: Icon, cls, delay }, i) => (
            <span key={i} className={`float absolute grid place-items-center rounded-2xl bg-white/90 shadow-soft backdrop-blur ${cls}`} style={{ animationDelay: delay }}>
              <Icon className="h-1/2 w-1/2" strokeWidth={2} />
            </span>
          ))}
          <span className="splash-logo relative grid h-28 w-28 place-items-center rounded-[34px] text-white shadow-glow" style={{ background: "linear-gradient(135deg,#ff9fb6,#f1557a)" }}>
            <Sparkles className="h-12 w-12" strokeWidth={1.8} />
            <span className="absolute inset-0 rounded-[34px] ring-2 ring-white/40" />
          </span>
        </div>

        <div className="text-center">
          <h1 className="text-[40px] leading-none font-bold tracking-tight text-brand-500">Skiinx</h1>
          <p className="mt-2 text-[15px] text-ink/70">สกินแคร์ทุกวัน แบบไม่ต้องจำเอง</p>
        </div>

        {/* what you get */}
        <ul className="mt-7 w-full space-y-2.5 rounded-3xl bg-white/80 p-4 shadow-soft backdrop-blur">
          {FEATURES.map(([Icon, title, sub], i) => (
            <li key={title} className="rise flex items-center gap-3" style={{ ["--i" as any]: i + 2 }}>
              <span className="icon-tile h-10 w-10 rounded-xl bg-linear-to-br from-brand-50 to-brand-100">
                <Icon className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted">{sub}</p>
              </div>
            </li>
          ))}
        </ul>

        {invited && !error && (
          <p className="rise mt-4 flex w-full items-center gap-2.5 rounded-2xl bg-white p-3 text-sm shadow-soft ring-1 ring-brand-100">
            <span className="icon-tile h-9 w-9 rounded-xl">
              <Ticket className="h-4 w-4" />
            </span>
            <span className="text-left">
              <b className="block">คุณได้รับคำเชิญ</b>
              <span className="text-muted">เข้าสู่ระบบด้วย Discord เพื่อเริ่มใช้ได้เลย</span>
            </span>
          </p>
        )}

        {error && (
          <p className="rise mt-4 flex w-full items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {state === "sent" ? (
          <div className="rise mt-5 w-full rounded-3xl bg-white p-5 text-center shadow-soft">
            <span className="pop mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-500">
              <MailCheck className="h-7 w-7" />
            </span>
            <p className="mt-3 font-semibold">ส่งลิงก์ไปที่อีเมลแล้ว</p>
            <p className="mt-1 text-sm text-muted">
              เปิดอีเมล <b className="text-ink">{email}</b> บนเครื่องนี้ แล้วกดลิงก์เพื่อเข้าสู่ระบบ
            </p>
            <button className="mt-3 rounded-full px-3 py-2 text-sm text-brand-500 underline" onClick={() => setState("idle")}>
              ใช้อีเมลอื่น
            </button>
          </div>
        ) : (
          <div className="mt-5 w-full space-y-3">
            <button
              className="shine btn w-full py-4 text-base text-white shadow-[0_14px_30px_-12px_rgb(88_101_242/0.75)] transition hover:brightness-110 disabled:opacity-80"
              style={{ background: "linear-gradient(135deg,#6b77ff,#5865F2)" }}
              disabled={state !== "idle"}
              onClick={discord}
            >
              {state === "discord" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <DiscordLogo className="h-6 w-6" />}
              {state === "discord" ? "กำลังไปที่ Discord…" : "เข้าสู่ระบบด้วย Discord"}
            </button>
            <p className="text-center text-xs text-muted">บัญชีเดียวกับที่ใช้รับแจ้งเตือนใน Discord</p>

            <div className="flex items-center gap-3 pt-1 text-xs text-muted">
              <span className="h-px flex-1 bg-brand-100" />
              หรือ
              <span className="h-px flex-1 bg-brand-100" />
            </div>

            {showEmail ? (
              <form onSubmit={sendLink} className="rise flex gap-2 rounded-full bg-white p-1.5 shadow-soft ring-1 ring-brand-100 focus-within:ring-brand-300">
                <span className="grid w-9 shrink-0 place-items-center text-muted">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  required
                  autoFocus
                  inputMode="email"
                  autoComplete="email"
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/70"
                  placeholder="อีเมลของคุณ"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button className="btn-primary shrink-0 px-4 py-2.5" disabled={state !== "idle"} aria-label="ส่งลิงก์เข้าสู่ระบบ">
                  {state === "email" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                </button>
              </form>
            ) : (
              <button className="btn-plain w-full py-3.5" onClick={() => setShowEmail(true)}>
                <Mail className="h-4 w-4" /> เข้าสู่ระบบด้วยอีเมล
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>
            )}
          </div>
        )}

        <p className="mt-8 flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="h-4 w-4 text-emerald-500" /> รูปหน้าของคุณเก็บบนเครื่องนี้เท่านั้น
        </p>
      </div>
    </div>
  );
}
