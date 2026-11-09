"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Camera, House, LibraryBig, Sparkles, type LucideIcon } from "lucide-react";
import { useData } from "@/lib/data";
import { slotStart } from "@/lib/util";
import * as core from "@/lib/core.js";

const LEFT: [string, string, LucideIcon][] = [
  ["/", "วันนี้", House],
  ["/shelf", "ชั้นวาง", LibraryBig],
];
const RIGHT: [string, string, LucideIcon][] = [
  ["/calendar", "ความคืบหน้า", CalendarDays],
  ["/photos", "รูปผิว", Camera],
];

export default function BottomNav() {
  const path = usePathname();
  const { info, checks, today, now, settings } = useData();
  if (path.startsWith("/focus") || path === "/login" || path.startsWith("/photos/capture")) return null;

  // red badge on "วันนี้" when a routine is due and not ticked
  const mins = core.logicalMinutes(now, settings);
  const due = info
    ? (["am", "pm"] as const).filter(
        (s) => !checks.has(core.ckey(today, s)) && mins >= slotStart(s, info, settings) && (s === "pm" || mins < core.toMin(settings.amCutoff)),
      ).length
    : 0;

  const Item = ([href, label, Icon]: [string, string, LucideIcon]) => {
    const active = href === "/" ? path === "/" : path.startsWith(href) || (href === "/shelf" && path.startsWith("/schedule"));
    return (
      <Link key={href} href={href} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "font-semibold text-brand-500" : "text-muted"}`}>
        <Icon key={String(active)} className={`h-[22px] w-[22px] transition ${active ? "bounce-in" : ""}`} strokeWidth={active ? 2.2 : 1.8} />
        {label}
        {href === "/" && due > 0 && (
          <span className="bounce-in absolute top-1 right-[calc(50%-18px)] grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {due}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-center rounded-[28px] bg-white/95 px-2 shadow-[0_-4px_30px_-10px_rgb(241_85_122/0.25)] backdrop-blur">
        {LEFT.map(Item)}
        <Link
          href="/focus/now"
          aria-label="เริ่มทาสกินแคร์"
          className="glow-pulse -mt-7 mx-1 grid h-16 w-16 shrink-0 place-items-center rounded-full text-white ring-[6px] ring-canvas transition hover:scale-105 active:scale-95"
          style={{ background: "linear-gradient(135deg,#fb7a98,#f1557a)" }}
        >
          <Sparkles className="twinkle-soft h-7 w-7" strokeWidth={2} />
        </Link>
        {RIGHT.map(Item)}
      </div>
    </nav>
  );
}
