"use client";
// Custom form controls (no native <select>/<input type=time>/checkbox look): consistent padding,
// soft pink focus rings, animated popovers. All keyboard-closable with Escape.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Minus, Plus } from "lucide-react";

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/** Opens upward when the panel would run under the bottom nav / off the screen. */
function useFlip(open: boolean) {
  const panel = useRef<any>(null);
  const [up, setUp] = useState(false);
  useLayoutEffect(() => {
    if (!open) return setUp(false);
    const p = panel.current?.getBoundingClientRect();
    const host = panel.current?.parentElement?.getBoundingClientRect();
    if (p && host && p.bottom > window.innerHeight - 104 && host.top - p.height - 8 > 8) setUp(true);
  }, [open]);
  return { panel, flip: up ? "bottom-full mb-2 mt-0 origin-bottom-right" : "" };
}

const trigger =
  "flex h-11 items-center justify-between gap-2 rounded-2xl border border-brand-100 bg-white pl-4 pr-3 text-[15px] font-medium text-ink shadow-[0_1px_2px_rgb(43_34_48/0.04)] transition hover:border-brand-200 focus-visible:border-brand-300 focus-visible:ring-4 focus-visible:ring-brand-100 outline-none disabled:opacity-50";
const panel = "pop-panel absolute right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-brand-100 bg-white p-1.5 shadow-[0_18px_40px_-12px_rgb(43_34_48/0.25)]";

/* ───────── Select ───────── */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  className = "",
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const { panel: listRef, flip } = useFlip(open);
  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" disabled={disabled} className={`${trigger} w-full min-w-28`} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="truncate">{current?.label ?? "เลือก"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul ref={listRef} role="listbox" className={`${panel} ${flip} min-w-full w-max max-w-[16rem]`}>
          {options.map((o) => {
            const sel = o.value === value;
            return (
              <li key={String(o.value)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition ${sel ? "bg-brand-50 font-semibold text-brand-600" : "hover:bg-canvas"}`}
                >
                  <span className="flex-1">
                    {o.label}
                    {o.hint && <span className="block text-xs font-normal text-muted">{o.hint}</span>}
                  </span>
                  <Check className={`h-4 w-4 transition ${sel ? "opacity-100" : "opacity-0"}`} strokeWidth={2.5} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────── Time picker ───────── */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function TimeCol({ items, cur, onPick, refEl }: { items: string[]; cur: string; onPick: (v: string) => void; refEl: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={refEl} className="h-48 w-16 snap-y overflow-y-auto overscroll-contain py-1 [scrollbar-width:none]">
      {items.map((v) => (
        <button
          key={v}
          type="button"
          data-sel={v === cur}
          onClick={() => onPick(v)}
          className={`block w-full snap-center rounded-xl py-2 text-center text-[15px] tabular-nums transition ${
            v === cur ? "bg-linear-to-r from-brand-400 to-brand-500 font-semibold text-white shadow-glow" : "text-ink/80 hover:bg-canvas"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function TimePicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const [h, m] = value.split(":");
  const { panel: timeRef, flip: timeFlip } = useFlip(open);
  const hourCol = useRef<HTMLDivElement>(null);
  const minCol = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // centre the selected values in each column
    for (const col of [hourCol.current, minCol.current]) {
      const sel = col?.querySelector<HTMLElement>("[data-sel=true]");
      if (col && sel) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.clientHeight / 2;
    }
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} className={`${trigger} w-28`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tabular-nums">{value}</span>
        <Clock className="h-4 w-4 text-brand-400" />
      </button>
      {open && (
        <div ref={timeRef} className={`${panel} ${timeFlip} flex items-start gap-1`}>
          <TimeCol items={HOURS} cur={h} onPick={(v) => onChange(`${v}:${m}`)} refEl={hourCol} />
          <span className="self-center pb-1 text-lg font-semibold text-muted">:</span>
          {/* keep an off-grid minute (e.g. 07:32 from an older setting) selectable */}
          <TimeCol items={MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort()} cur={m} onPick={(v) => { onChange(`${h}:${v}`); setOpen(false); }} refEl={minCol} />
        </div>
      )}
    </div>
  );
}

/* ───────── Date picker ───────── */
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function DatePicker({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const [vy, vm, vd] = (value || new Date().toISOString().slice(0, 10)).split("-").map(Number);
  const [view, setView] = useState({ y: vy, m: vm - 1 });
  const { panel: dateRef, flip: dateFlip } = useFlip(open);
  useEffect(() => {
    if (open) setView({ y: vy, m: vm - 1 });
  }, [open, vy, vm]);
  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const lead = (first + 6) % 7; // Monday first
  const len = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const shift = (n: number) => setView(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" className={`${trigger} w-full`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{value ? `${vd} ${TH_MONTHS[vm - 1]} ${vy + 543}` : "เลือกวันที่"}</span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={dateRef} className={`${panel} ${dateFlip} left-0 w-72 p-3`}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="grid h-8 w-8 place-items-center rounded-xl hover:bg-canvas" onClick={() => shift(-1)} aria-label="เดือนก่อน">
              <ChevronDown className="h-4 w-4 rotate-90" />
            </button>
            <span className="text-sm font-semibold">
              {TH_MONTHS[view.m]} {view.y + 543}
            </span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-xl hover:bg-canvas" onClick={() => shift(1)} aria-label="เดือนถัดไป">
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
            {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: lead }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: len }, (_, i) => {
              const d = ymd(view.y, view.m, i + 1);
              const sel = d === value;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  className={`aspect-square rounded-xl text-sm tabular-nums transition ${sel ? "bg-linear-to-br from-brand-400 to-brand-500 font-semibold text-white shadow-glow" : "hover:bg-brand-50"}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Switch ───────── */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-300 outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:opacity-40 ${
        checked ? "bg-linear-to-r from-brand-400 to-brand-500 shadow-glow" : "bg-gray-200"
      }`}
    >
      <span
        className={`absolute left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] ${checked ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

/* ───────── Stepper (− value +) ───────── */
export function Stepper({ value, onChange, min, max, step = 1, unit }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const btn = "grid h-9 w-9 place-items-center rounded-xl text-brand-500 transition hover:bg-brand-50 active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex h-11 items-center gap-1 rounded-2xl border border-brand-100 bg-white px-1">
      <button type="button" className={btn} aria-label="ลด" disabled={value <= min} onClick={() => set(value - step)}>
        <Minus className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <span key={value} className="bounce-in min-w-12 text-center text-[15px] font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted">{unit}</span>}
      </span>
      <button type="button" className={btn} aria-label="เพิ่ม" disabled={value >= max} onClick={() => set(value + step)}>
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* ───────── Checkbox (single) ───────── */
export function Checkbox({ checked, onChange, children, tone = "brand" }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; tone?: "brand" | "danger" }) {
  const on = tone === "danger" ? "border-red-500 bg-red-500" : "border-brand-500 bg-linear-to-br from-brand-400 to-brand-500";
  return (
    <label className="flex cursor-pointer items-start gap-3 select-none">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100 ${
          checked ? `${on} text-white` : "border-brand-200 bg-white"
        }`}
      >
        {checked && <Check className="check-burst h-3.5 w-3.5" strokeWidth={3.2} />}
      </span>
      <span className="text-sm leading-relaxed">{children}</span>
    </label>
  );
}

/* ───────── Check chips (multi-select) ───────── */
export function CheckChips<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T[];
  onChange: (v: T[]) => void;
  options: { value: T; label: string; locked?: boolean }[];
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            disabled={o.locked}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition active:scale-95 ${
              on ? "border-transparent bg-brand-500 text-white shadow-glow" : "border-brand-100 bg-white text-ink/70 hover:border-brand-200"
            } ${o.locked ? "cursor-default" : ""}`}
          >
            {on && <Check className="check-burst h-3.5 w-3.5" strokeWidth={3} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────── Colour swatches ───────── */
const SWATCHES = ["#f97316", "#f59e0b", "#22c55e", "#14b8a6", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#f1557a", "#64748b"];
export function Swatches({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`เลือกสี ${c}`}
          onClick={() => onChange(c)}
          className={`grid h-9 w-9 place-items-center rounded-full transition hover:scale-110 ${value.toLowerCase() === c ? "ring-2 ring-offset-2 ring-offset-white" : ""}`}
          style={{ background: c, ["--tw-ring-color" as any]: c }}
        >
          {value.toLowerCase() === c && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}
