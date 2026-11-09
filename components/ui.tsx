"use client";
// Small shared UI kit: page titles, section headers, segmented pills, icon tiles.
import Link from "next/link";
import { ChevronRight, Sparkles, type LucideIcon } from "lucide-react";

export function PageTitle({ title, sub, right, back }: { title: string; sub?: React.ReactNode; right?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <header className="mb-1 flex items-start justify-between gap-3 pt-2">
      <div className="flex items-start gap-3">
        {back}
        <div>
          <h1 className="flex items-center gap-1.5 text-[26px] leading-tight font-bold">
            {title}
            <Sparkles className="twinkle h-4 w-4 text-brand-300" strokeWidth={2.2} />
          </h1>
          <span className="squiggle" />
          {sub && <div className="mt-1.5 text-sm text-muted">{sub}</div>}
        </div>
      </div>
      {right}
    </header>
  );
}

export function SectionHeader({ title, href, action, onAction }: { title: string; href?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-1">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {action &&
        (href ? (
          <Link href={href} className="-my-2.5 flex items-center rounded-full px-2 py-2.5 text-sm font-medium text-brand-500 active:bg-brand-50">
            {action}
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <button onClick={onAction} className="-my-2.5 flex items-center rounded-full px-2 py-2.5 text-sm font-medium text-brand-500 active:bg-brand-50">
            {action}
            <ChevronRight className="h-4 w-4" />
          </button>
        ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;
  return (
    <div className="relative flex rounded-full bg-white p-1 shadow-soft">
      {/* the pink pill glides to the selected option */}
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-full bg-linear-to-r from-brand-400 to-brand-500 shadow-glow transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)]"
        style={{ width: `calc((100% - 0.5rem) / ${n})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium transition-colors duration-300 ${
              active ? "text-white" : "text-muted hover:text-ink"
            }`}
          >
            {Icon && <Icon key={String(active)} className={`h-4 w-4 ${active ? "bounce-in" : ""}`} strokeWidth={2} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function IconTile({ icon: Icon, size = 48, className = "", iconClass = "" }: { icon: LucideIcon; size?: number; className?: string; iconClass?: string }) {
  return (
    <span className={`icon-tile ${className}`} style={{ width: size, height: size }}>
      <Icon className={iconClass} style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={1.8} />
    </span>
  );
}

export function Section({ title, icon, children, className = "" }: { title: string; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card relative space-y-3 has-[[aria-expanded=true]]:z-30 ${className}`}>
      <h2 className="flex items-center gap-2.5 font-semibold">
        {icon && <IconTile icon={icon} size={34} className="rounded-xl" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Empty({ icon, title, sub, children }: { icon: LucideIcon; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <IconTile icon={icon} size={72} className="rounded-[26px]" />
      <p className="text-lg font-semibold">{title}</p>
      {sub && <p className="max-w-xs text-sm text-muted">{sub}</p>}
      {children}
    </div>
  );
}
