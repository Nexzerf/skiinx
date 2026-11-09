"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { readXlsx } from "@/lib/xlsx.js";
import { thDate } from "@/lib/util";
import { download } from "@/lib/zip";
import SchedulePreview from "@/components/SchedulePreview";
import IssueList from "@/components/IssueList";
import { CircleX, Download, FileSpreadsheet, Lightbulb, Power, Save, Trash2, Upload } from "lucide-react";
import { IconTile, PageTitle, Section } from "@/components/ui";
import { Checkbox, DatePicker } from "@/components/controls";

type StartMode = "tomorrow" | "today" | "continue" | "custom";

export default function SchedulePage() {
  const { ready, snap, today, info, schedules, addSchedule, updateSchedule, deleteSchedule } = useData();
  const router = useRouter();
  const [parsed, setParsed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [mode, setMode] = useState<StartMode>("tomorrow");
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!ready) return null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setParsed(null);
    setAck(false);
    try {
      const sheets = await readXlsx(await file.arrayBuffer());
      const data = core.buildSchedule(sheets);
      setParsed({ data, issues: core.validateSchedule(data), file: file.name });
      setName(data.title);
      setCustom(data.suggestedStart || core.addDays(today, 1));
      setMode(info ? "tomorrow" : "today");
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  const startDate = (): string => {
    if (mode === "today") return today;
    if (mode === "tomorrow") return core.addDays(today, 1);
    if (mode === "continue") {
      const n = info ? Math.min(info.n, parsed.data.days.length) : 1;
      return core.startForCycleDay(today, n);
    }
    return custom;
  };

  const hasError = parsed?.issues.some((i: any) => i.level === "error");
  const save = async () => {
    setSaving(true);
    try {
      await addSchedule({ name: name || parsed.data.title, data: parsed.data, start_date: startDate(), enabled: true });
      setParsed(null);
      router.push("/");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const active = core.scheduleFor(today, schedules);
  const statusOf = (s: any) =>
    !s.enabled ? ["ปิดใช้", "bg-gray-100 text-muted"] : active?.id === s.id ? ["ใช้อยู่", "bg-emerald-100 text-emerald-700"] : s.start_date > today ? ["รอเริ่ม", "bg-amber-100 text-amber-700"] : ["เลิกใช้", "bg-gray-100 text-muted"];
  const tips = (active || snap.schedules[snap.schedules.length - 1])?.data?.tips || [];

  return (
    <div className="stagger space-y-4">
      <PageTitle title="ตารางของฉัน" sub="อัพโหลด Excel 30 วัน แล้วระบบวนรอบให้เอง" />

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onFile(e.dataTransfer.files[0]);
        }}
        className={`card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed py-8 text-center transition ${drag ? "border-brand-400 bg-brand-50" : "border-brand-200"}`}
      >
        <IconTile icon={Upload} size={64} className="rounded-[22px] bg-linear-to-br from-brand-50 to-brand-200" />
        <span className="font-medium">ลากไฟล์ .xlsx มาวาง หรือแตะเพื่อเลือก</span>
        <span className="text-xs text-muted">ไฟล์ถูกอ่านในเครื่องนี้ ไม่ได้ส่งไปเซิร์ฟเวอร์</span>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      {error && (
        <p className="flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
          <CircleX className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {parsed && (
        <div className="space-y-4">
          <div className="card flex gap-3">
            <IconTile icon={FileSpreadsheet} size={44} className="rounded-xl bg-emerald-50 text-emerald-600" />
            <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">{parsed.data.title}</p>
            {parsed.data.subtitle && <p className="text-sm text-muted">{parsed.data.subtitle}</p>}
            <p className="text-xs text-muted">
              {parsed.data.days.length} วัน · สินค้า {parsed.data.products.length} รายการ · รูปแบบคืน {Object.keys(parsed.data.nightTypes).join("/") || "–"} · Tips {parsed.data.tips.length} ข้อ
            </p>
            </div>
          </div>

          <IssueList issues={parsed.issues} />
          <SchedulePreview data={parsed.data} />

          <div className="card relative space-y-3 has-[[aria-expanded=true]]:z-30">
            <div>
              <span className="label">เริ่มใช้ตารางนี้</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["tomorrow", "เริ่มพรุ่งนี้"],
                    ["today", "เริ่มวันนี้"],
                    ["continue", info ? `ต่อจากวันเดิม (วัน ${info.n})` : "ต่อจากวันเดิม"],
                    ["custom", "เลือกวันเอง"],
                  ] as [StartMode, string][]
                ).map(([k, l]) => (
                  <button key={k} disabled={k === "continue" && !info} className={mode === k ? "btn-primary" : "btn-plain"} onClick={() => setMode(k)}>
                    {l}
                  </button>
                ))}
              </div>
              {mode === "custom" && <DatePicker className="mt-2" value={custom} onChange={setCustom} />}
              <p className="mt-2 text-sm text-muted">
                วันที่ 1 ของตาราง = <b>{startDate() && thDate(startDate())}</b> {startDate() && `(${startDate()})`}
                {mode === "tomorrow" && info && " · วันนี้ยังใช้ตารางเดิม"}
              </p>
            </div>
            <div>
              <span className="label">ชื่อเวอร์ชัน</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {hasError && (
              <div className="rounded-2xl bg-red-50 p-3 text-red-700">
                <Checkbox tone="danger" checked={ack} onChange={setAck}>
                  ตารางนี้มีจุดเสี่ยง (ดูด้านบน) — เข้าใจความเสี่ยงแล้ว ต้องการบันทึกต่อ
                </Checkbox>
              </div>
            )}
            <div className="flex gap-2">
              <button className="btn-plain" onClick={() => setParsed(null)}>
                ยกเลิก
              </button>
              <button className="btn-primary flex-1" disabled={saving || !startDate() || (hasError && !ack)} onClick={save}>
                <Save className="h-4 w-4" /> {saving ? "กำลังบันทึก…" : "บันทึกตาราง"}
              </button>
            </div>
          </div>
        </div>
      )}

      {snap.schedules.length > 0 && (
        <Section title="เวอร์ชันทั้งหมด" icon={FileSpreadsheet}>
          <ul className="divide-y divide-brand-50">
            {[...snap.schedules].reverse().map((s) => {
              const [label, cls] = statusOf(s);
              return (
                <li key={s.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>
                    <span className="flex-1 truncate text-sm font-medium">{s.name}</span>
                  </div>
                  <div className="mt-1 -mb-1 flex items-center gap-1 text-xs text-muted">
                    <span>เริ่ม {thDate(s.start_date, false)} {+s.start_date.slice(0, 4) + 543}</span>
                    <span>{s.data.days.length} วัน</span>
                    <span className="flex-1" />
                    <button className="flex items-center gap-1 rounded-full px-2.5 py-2 text-brand-600 active:bg-brand-50" onClick={() => updateSchedule(s.id, { enabled: !s.enabled })}>
                      <Power className="h-3.5 w-3.5" /> {s.enabled ? "ปิดใช้" : "เปิดใช้"}
                    </button>
                    <button className="flex items-center gap-1 rounded-full px-2.5 py-2 text-brand-600 active:bg-brand-50" onClick={() => download(new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }), `schedule-${s.start_date}.json`)}>
                      <Download className="h-3.5 w-3.5" /> JSON
                    </button>
                    <button
                      className="flex items-center gap-1 rounded-full px-2.5 py-2 text-red-500 active:bg-red-50"
                      onClick={() => confirm(`ลบ "${s.name}"? (ประวัติการติ๊กไม่หาย)`) && deleteSchedule(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> ลบ
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {active && !parsed && <SchedulePreview data={active.data} collapsed title={`ตารางที่ใช้อยู่ · ${active.name}`} highlight={info?.n} />}

      {tips.length > 0 && (
        <Section title="คำแนะนำจากตาราง" icon={Lightbulb}>
          <ul className="space-y-3">
            {tips.map((t: any, i: number) => (
              <li key={i} className="text-sm">
                <b>{t.topic}</b>
                <p className="text-ink/80">{t.advice}</p>
                {t.reason && <p className="text-xs text-muted">เหตุผล: {t.reason}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
