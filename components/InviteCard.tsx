"use client";
// Settings → invite a friend: one link = one person, valid 14 days.
import { useEffect, useState } from "react";
import { Check, Copy, LoaderCircle, Share2, UserPlus, Users } from "lucide-react";
import { Section } from "./ui";
import { createInvite, inviteLink, memberCount } from "@/lib/members";

export default function InviteCard({ onError }: { onError: (msg: string) => void }) {
  const [count, setCount] = useState<number | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  useEffect(() => {
    memberCount().then(setCount).catch(() => {});
  }, []);

  const make = async () => {
    setBusy(true);
    try {
      setCode(await createInvite());
    } catch (e: any) {
      onError(e.message || "สร้างลิงก์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  const link = code ? inviteLink(code) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onError("คัดลอกไม่ได้ — กดค้างที่ลิงก์เพื่อคัดลอกเอง");
    }
  };
  const share = () => navigator.share({ title: "ชวนใช้ Skiinx", text: `มาใช้ Skiinx ด้วยกัน รหัสเชิญ ${code}`, url: link }).catch(() => {});

  return (
    <Section title="ชวนเพื่อนมาใช้" icon={UserPlus}>
      <p className="flex items-center gap-2 text-sm text-muted">
        <Users className="h-4 w-4 shrink-0" />
        {count ? `ตอนนี้ใช้อยู่ ${count} คน · ` : ""}แต่ละคนมีข้อมูลของตัวเอง ไม่เห็นของกัน
      </p>
      {code ? (
        <div className="pop space-y-2.5 rounded-2xl bg-canvas p-3">
          <p className="text-center text-xs text-muted">รหัสเชิญ (ใช้ได้ 1 คน ภายใน 14 วัน)</p>
          <p className="text-center text-2xl font-bold tracking-[0.25em] text-brand-600 tabular-nums copyable" data-copyable>{code}</p>
          <p className="truncate rounded-xl bg-white px-3 py-2 text-center text-xs text-muted copyable" data-copyable>{link}</p>
          <div className="flex gap-2">
            <button className="btn-plain flex-1 py-2.5" onClick={copy}>
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </button>
            {canShare && (
              <button className="btn-primary flex-1 py-2.5" onClick={share}>
                <Share2 className="h-4 w-4" /> แชร์
              </button>
            )}
          </div>
          <button className="w-full py-1 text-xs text-muted underline-offset-2 hover:underline" onClick={make} disabled={busy}>
            สร้างรหัสใหม่สำหรับอีกคน
          </button>
        </div>
      ) : (
        <button className="btn-ghost w-full" onClick={make} disabled={busy}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          สร้างลิงก์เชิญ
        </button>
      )}
    </Section>
  );
}
