"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  BellRing, CalendarDays, Camera, CircleCheck, CircleX, Copy, Database, Download, Flame, KeyRound, LogOut, MessageCircle, Moon,
  Nfc, Palette, Printer, ScanFace, Send, Smartphone, Sun, Timer, Trash2, Upload, User,
} from "lucide-react";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { cloudEnabled, sb, supabaseUrl } from "@/lib/supabase";
import { download } from "@/lib/zip";
import { exportZip, readBackup, restorePhotos } from "@/lib/backup";
import { clearPhotos } from "@/lib/photos";
import { clearLocal, pendingCount } from "@/lib/store";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { PageTitle, Section } from "@/components/ui";
import { CheckChips, Select, Stepper, Swatches, Switch, TimePicker } from "@/components/controls";

const PUSH_NOTE: Record<PushState, string> = {
  on: "เปิดอยู่บนเครื่องนี้",
  off: "ปิดอยู่",
  denied: "ถูกบล็อกในเบราว์เซอร์",
  "needs-install": "เพิ่มแอพลงหน้าจอโฮมก่อน",
  unsupported: "เบราว์เซอร์นี้ไม่รองรับ",
  unavailable: "ใช้ได้เมื่อซิงก์บัญชีออนไลน์",
};

export default function SettingsPage() {
  const d = useData();
  const { ready, settings, saveSettings, snap, today, schedules } = d;
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [origin, setOrigin] = useState("");
  const [push, setPush] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
    pushState().then(setPush);
  }, []);
  if (!ready) return null;

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };
  const set = (patch: Record<string, any>) => saveSettings(patch).catch((e) => flash(e.message, false));

  const token = snap.settings.ics_token;
  const icsUrl = cloudEnabled && token ? `${supabaseUrl}/functions/v1/ics?token=${token}` : "";
  const types = Array.from(new Set(["A", "B", "C", ...schedules.flatMap((s) => s.data.days.map((x: any) => x.type).filter(Boolean))]));

  const togglePush = async (on: boolean) => {
    setBusy(true);
    try {
      const s = on ? await enablePush() : await disablePush();
      setPush(s);
      if (on && s === "on") flash("เปิดการแจ้งเตือนบนเครื่องนี้แล้ว");
      if (on && s === "denied") flash("เบราว์เซอร์บล็อกการแจ้งเตือนไว้", false);
    } catch (e: any) {
      flash(e.message, false);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    const { data, error } = await sb().functions.invoke("test-notify");
    setBusy(false);
    if (error || !data?.ok) return flash("ส่งไม่สำเร็จ" + (data?.error ? `: ${data.error}` : ""), false);
    const parts: string[] = [];
    if (data.push?.sent) parts.push(`เครื่อง ${data.push.sent} เครื่อง`);
    if (data.discord?.ok) parts.push("Discord");
    if (parts.length) flash(`ส่งแล้ว: ${parts.join(" · ")}`);
    else flash("ยังไม่มีช่องทางที่พร้อมรับแจ้งเตือน", false);
  };

  return (
    <div className="stagger space-y-4">
      <PageTitle title="ตั้งค่า" sub="การแจ้งเตือน รูปผิว และข้อมูลของคุณ" />
      {msg && (
        <div className="fixed inset-x-4 top-4 z-[60] mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-ink p-3 text-white shadow-lg">
          {msg.ok ? <CircleCheck className="h-5 w-5 text-emerald-300" /> : <CircleX className="h-5 w-5 text-red-300" />}
          {msg.text}
        </div>
      )}

      <Section title="บัญชี" icon={User}>
        {cloudEnabled ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{d.email || "–"}</p>
              <p className="text-xs text-muted">ซิงก์ข้อมูลอัตโนมัติ{pendingCount() > 0 ? ` · รอซิงก์ ${pendingCount()} รายการ` : ""}</p>
            </div>
            <button className="btn-plain px-4 py-2" onClick={() => sb().auth.signOut()}>
              <LogOut className="h-4 w-4" /> ออกจากระบบ
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink/75">ข้อมูลทั้งหมดเก็บอยู่บนเครื่องนี้</p>
        )}
      </Section>

      <Section title="การแจ้งเตือน" icon={BellRing}>
        <Row label="แจ้งเตือนบนเครื่องนี้" icon={Smartphone} sub={PUSH_NOTE[push]}>
          <Switch label="แจ้งเตือนบนเครื่องนี้" checked={push === "on"} disabled={busy || !["on", "off"].includes(push)} onChange={togglePush} />
        </Row>
        <Row label="Discord" icon={MessageCircle} sub={cloudEnabled ? (settings.discordEnabled ? "ส่งข้อความพร้อมปุ่มติ๊ก" : "ปิดอยู่") : PUSH_NOTE.unavailable}>
          <Switch label="Discord" checked={cloudEnabled && settings.discordEnabled} disabled={!cloudEnabled} onChange={(v) => set({ discordEnabled: v })} />
        </Row>
        <Divider />
        <Row label="รอบเช้า" icon={Sun}>
          <TimePicker value={settings.amTime} onChange={(v) => set({ amTime: v })} />
        </Row>
        <Row label="หยุดเตือนรอบเช้าหลัง">
          <TimePicker value={settings.amCutoff} onChange={(v) => set({ amCutoff: v })} />
        </Row>
        <Row label="รอบก่อนนอน" icon={Moon}>
          <TimePicker value={settings.pmTime} onChange={(v) => set({ pmTime: v })} />
        </Row>
        <Row label="คืนที่มีมาสก์ เตือนเร็วขึ้น" icon={Timer}>
          <Stepper value={settings.leadMinForTimedNights} min={0} max={90} step={5} unit="นาที" onChange={(v) => set({ leadMinForTimedNights: v })} />
        </Row>
        <Row label="เตือนซ้ำทุก">
          <Stepper value={settings.repeatMin} min={5} max={60} step={5} unit="นาที" onChange={(v) => set({ repeatMin: v })} />
        </Row>
        <Row label="เตือนสูงสุดต่อรอบ">
          <Stepper value={settings.maxRepeats} min={1} max={20} unit="ครั้ง" onChange={(v) => set({ maxRepeats: v })} />
        </Row>
        <Row label="สรุปทุกวันอาทิตย์">
          <div className="flex items-center gap-2">
            {settings.weeklySummary && <TimePicker value={settings.summaryTime} onChange={(v) => set({ summaryTime: v })} />}
            <Switch label="สรุปรายสัปดาห์" checked={settings.weeklySummary} onChange={(v) => set({ weeklySummary: v })} />
          </div>
        </Row>
        {cloudEnabled && (
          <button className="btn-ghost w-full" disabled={busy} onClick={sendTest}>
            <Send className="h-4 w-4" /> ส่งแจ้งเตือนทดสอบ
          </button>
        )}
      </Section>

      <Section title="ปฏิทิน" icon={CalendarDays}>
        <p className="text-sm text-ink/75">เพิ่มรูทีน 60 วันข้างหน้าลงแอพปฏิทิน พร้อมการเตือนในตัว</p>
        <button
          className="btn-ghost w-full"
          disabled={!schedules.length}
          onClick={() => {
            if (icsUrl) window.location.href = icsUrl + "&download=1";
            else {
              const ics = core.buildIcs({ schedules, settings, from: today, days: 60, appUrl: origin });
              download(new Blob([ics], { type: "text/calendar" }), "skincare.ics");
            }
          }}
        >
          <Download className="h-4 w-4" /> ดาวน์โหลดไฟล์ปฏิทิน
        </button>
        {icsUrl && (
          <div className="flex gap-2">
            <button
              className="btn-plain flex-1"
              onClick={() => navigator.clipboard.writeText(icsUrl.replace(/^https?:/, "webcal:")).then(() => flash("คัดลอกลิงก์แล้ว"))}
            >
              <Copy className="h-4 w-4" /> คัดลอกลิงก์ซิงก์
            </button>
            <button
              className="icon-btn h-12 w-12 shadow-none ring-1 ring-brand-100"
              aria-label="สร้างลิงก์ใหม่"
              title="สร้างลิงก์ใหม่ (ลิงก์เดิมจะใช้ไม่ได้)"
              onClick={() => confirm("ลิงก์เดิมจะใช้ไม่ได้อีก ต่อไหม?") && d.regenerateIcsToken().then(() => flash("สร้างลิงก์ใหม่แล้ว"))}
            >
              <KeyRound className="h-4 w-4" />
            </button>
          </div>
        )}
      </Section>

      <Section title="QR / NFC ที่กระจก" icon={Nfc}>
        <MirrorQr url={origin ? `${origin}/focus/now` : ""} onCopy={() => flash("คัดลอกลิงก์แล้ว")} />
      </Section>

      <Section title="Streak" icon={Flame}>
        <Row label="บัตรผ่านต่อสัปดาห์" sub="พลาดได้โดย streak ไม่หาย">
          <Select
            value={settings.freezesPerWeek}
            onChange={(v) => set({ freezesPerWeek: v })}
            options={[
              { value: 0, label: "ไม่มี", hint: "ต้องทาครบทุกวัน" },
              { value: 1, label: "1 ใบ", hint: "แนะนำ" },
              { value: 2, label: "2 ใบ" },
            ]}
          />
        </Row>
      </Section>

      <Section title="รูปผิว" icon={Camera}>
        <div>
          <p className="mb-2 text-sm text-ink/75">วันที่ต้องถ่ายในแต่ละรอบ</p>
          <DayGrid value={settings.photoDays} onChange={(v) => set({ photoDays: v })} />
        </div>
        <Row label="ต้องถ่ายรูปก่อนจบรอบ" sub="ในวันที่ต้องถ่าย">
          <Switch label="ต้องถ่ายรูปก่อนจบรอบ" checked={settings.requirePhoto} onChange={(v) => set({ requirePhoto: v })} />
        </Row>
        <Row label="มุมที่ถ่าย">
          <CheckChips
            value={settings.photoAngles}
            onChange={(v) => set({ photoAngles: v.includes("front") ? v : ["front", ...v] })}
            options={[
              { value: "front", label: "ตรง", locked: true },
              { value: "left", label: "ซ้าย" },
              { value: "right", label: "ขวา" },
            ]}
          />
        </Row>
        <Row label="วิเคราะห์ผิวอัตโนมัติ" icon={ScanFace} sub="ประมวลผลบนเครื่อง รูปไม่ถูกส่งออก">
          <Switch label="วิเคราะห์ผิวอัตโนมัติ" checked={settings.autoAnalyze} onChange={(v) => set({ autoAnalyze: v })} />
        </Row>
      </Section>

      <Section title="สีรูปแบบคืน" icon={Palette}>
        <div className="space-y-3">
          {types.map((t) => (
            <div key={t} className="flex items-center gap-3">
              <span className="tag w-9 justify-center" style={{ background: settings.typeColors?.[t] || "#94a3b8" }}>
                {t}
              </span>
              <Swatches value={settings.typeColors?.[t] || "#94a3b8"} onChange={(c) => set({ typeColors: { ...settings.typeColors, [t]: c } })} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="ข้อมูล" icon={Database}>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="btn-ghost"
            onClick={async () => {
              download(await exportZip(snap), `skindaily-backup-${today}.zip`);
              await set({ lastExportAt: today });
            }}
          >
            <Download className="h-4 w-4" /> สำรองข้อมูล
          </button>
          <label className="btn-plain cursor-pointer">
            <Upload className="h-4 w-4" /> กู้คืน
            <input
              type="file"
              accept=".zip"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const { data, photos } = await readBackup(f);
                  if (!confirm(`นำเข้า: ตาราง ${data.schedules.length}, ติ๊ก ${data.checkins.length}, คะแนนผิว ${data.skinLogs.length}, รูป ${photos.length} — ${cloudEnabled ? "รวมกับข้อมูลเดิม" : "แทนที่ข้อมูลในเครื่องนี้"}?`)) return;
                  await d.importSnapshot(data);
                  await restorePhotos(photos);
                  flash("นำเข้าแล้ว");
                } catch (err: any) {
                  flash(err.message, false);
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="text-xs text-muted">{settings.lastExportAt ? `สำรองล่าสุด ${settings.lastExportAt}` : "ยังไม่เคยสำรองข้อมูล"} · ไฟล์รวมรูปผิวทั้งหมด</p>
        <button
          className="flex w-full items-center justify-center gap-1.5 pt-1 text-sm text-red-500"
          onClick={async () => {
            if (!confirm("ลบข้อมูลทั้งหมดในเครื่องนี้ (รวมรูปหน้า)? ลบแล้วกู้คืนไม่ได้ถ้ายังไม่ได้สำรอง")) return;
            clearLocal();
            await clearPhotos();
            window.location.href = "/";
          }}
        >
          <Trash2 className="h-4 w-4" /> ลบข้อมูลในเครื่องนี้
        </button>
      </Section>
    </div>
  );
}

function Divider() {
  return <div className="-mx-4 h-px bg-brand-50" />;
}

function Row({ label, icon: Icon, sub, children }: { label: string; icon?: any; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="flex items-center gap-2 text-[15px] text-ink">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-brand-400" />}
          {label}
        </span>
        {sub && <span className={`block text-xs text-muted ${Icon ? "pl-6" : ""}`}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

/** Tap days 1–30 to choose photo days. */
function DayGrid({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="grid grid-cols-10 gap-1">
      {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => {
        const on = value.includes(n);
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== n) : [...value, n].sort((a, b) => a - b))}
            className={`aspect-square rounded-xl text-xs font-medium tabular-nums transition active:scale-90 ${
              on ? "bg-linear-to-br from-brand-400 to-brand-500 text-white shadow-glow" : "bg-canvas text-ink/60 hover:bg-brand-50"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function MirrorQr({ url, onCopy }: { url: string; onCopy: () => void }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: "#2b2230", light: "#ffffff" } }).then(setSrc);
  }, [url]);
  return (
    <div className="space-y-3">
      {src && (
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3 ring-1 ring-brand-100 print:ring-0" id="mirror-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="QR ไปหน้าทาทีละขั้น" className="h-44 w-44" />
          <span className="text-sm font-semibold">สแกนก่อนทาสกินแคร์</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-ghost"
          onClick={() => {
            document.body.classList.add("print-qr");
            window.addEventListener("afterprint", () => document.body.classList.remove("print-qr"), { once: true });
            window.print();
          }}
        >
          <Printer className="h-4 w-4" /> พิมพ์ QR
        </button>
        <button className="btn-plain" onClick={() => navigator.clipboard.writeText(url).then(onCopy)}>
          <Copy className="h-4 w-4" /> ลิงก์ NFC
        </button>
      </div>
    </div>
  );
}
