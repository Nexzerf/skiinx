"use client";
import { useEffect, useState } from "react";
import { Mail, Sparkles, TriangleAlert } from "lucide-react";
import { explainAuthError, takeAuthError } from "@/lib/authError";
import { cloudEnabled, sb } from "@/lib/supabase";
import { IconTile } from "@/components/ui";
import DiscordLogo from "@/components/DiscordLogo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const e = takeAuthError();
    if (e) {
      setNotice(e);
      if (/อีเมล/.test(e)) setShowEmail(true); // the fix starts with an email sign-in
    }
  }, []);
  if (!cloudEnabled) return <p className="py-20 text-center text-muted">ข้อมูลทั้งหมดเก็บอยู่บนเครื่องนี้</p>;

  const discord = async () => {
    setState("sending");
    const { error } = await sb().auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: window.location.origin },
    });
    if (error) setState(explainAuthError(error.message));
  };

  return (
    <div className="stagger space-y-8 py-16 text-center">
      <div className="flex justify-center">
        <IconTile icon={Sparkles} size={80} className="float rounded-[28px] bg-linear-to-br from-brand-100 to-brand-300 text-white" />
      </div>
      <div>
        <h1 className="text-3xl font-bold text-brand-500">Skiinx</h1>
        <p className="text-sm text-muted">ดูแลผิวทุกวัน ไม่ต้องจำเอง</p>
      </div>

      {state === "sent" ? (
        <p className="text-muted">ส่งลิงก์เข้าสู่ระบบไปที่ {email} แล้ว — เปิดอีเมลบนเครื่องนี้แล้วกดลิงก์</p>
      ) : (
        <div className="mx-auto max-w-xs space-y-4">
          {notice && (
            <p className="rise flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-left text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
            </p>
          )}
          <button
            className="btn w-full py-3.5 text-white shadow-[0_12px_28px_-10px_rgb(88_101_242/0.7)] transition hover:brightness-110"
            style={{ background: "#5865F2" }}
            disabled={state === "sending"}
            onClick={discord}
          >
            <DiscordLogo /> {state === "sending" ? "กำลังไปที่ Discord…" : "เข้าสู่ระบบด้วย Discord"}
          </button>
          <p className="text-xs text-muted">ใช้บัญชีเดียวกับที่รับแจ้งเตือนใน Discord</p>

          {showEmail ? (
            <form
              className="rise space-y-3 pt-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setState("sending");
                const { error } = await sb().auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } });
                setState(error ? explainAuthError(error.message) : "sent");
              }}
            >
              <input type="email" required className="input text-center" placeholder="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn-plain w-full" disabled={state === "sending"}>
                <Mail className="h-4 w-4" /> ส่งลิงก์เข้าสู่ระบบ
              </button>
            </form>
          ) : (
            <button className="text-sm text-muted underline" onClick={() => setShowEmail(true)}>
              ใช้อีเมลแทน
            </button>
          )}
          {!["idle", "sending", "sent"].includes(state) && <p className="text-sm text-red-600">{state}</p>}
        </div>
      )}
    </div>
  );
}
