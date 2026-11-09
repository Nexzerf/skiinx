"use client";
import { useState } from "react";
import { cloudEnabled, sb } from "@/lib/supabase";
import { Mail, Sparkles } from "lucide-react";
import { IconTile } from "@/components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");
  if (!cloudEnabled) return <p className="py-20 text-center text-muted">โหมดเครื่องเดียว ไม่ต้อง login</p>;
  return (
    <div className="space-y-6 py-16 text-center">
      <div className="flex justify-center"><IconTile icon={Sparkles} size={80} className="rounded-[28px] bg-linear-to-br from-brand-100 to-brand-300 text-white" /></div>
      <div>
        <h1 className="text-3xl font-bold text-brand-500">SkinDaily</h1>
        <p className="text-sm text-muted">ดูแลผิวทุกวัน ไม่ต้องจำเอง</p>
      </div>
      {state === "sent" ? (
        <p className="text-muted">ส่งลิงก์เข้าสู่ระบบไปที่ {email} แล้ว — เปิดอีเมลบนเครื่องนี้แล้วกดลิงก์</p>
      ) : (
        <form
          className="mx-auto max-w-xs space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setState("sending");
            const { error } = await sb().auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } });
            setState(error ? error.message : "sent");
          }}
        >
          <input type="email" required className="input text-center" placeholder="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary w-full" disabled={state === "sending"}>
            <Mail className="h-4 w-4" /> {state === "sending" ? "กำลังส่ง…" : "ส่ง magic link"}
          </button>
          {!["idle", "sending"].includes(state) && <p className="text-sm text-red-600">{state}</p>}
        </form>
      )}
    </div>
  );
}
