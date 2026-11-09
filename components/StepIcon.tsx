"use client";
// Icons for routine steps (no emoji anywhere): product-type tile + ingredient chips.
import { Droplets, FlaskConical, Layers, Pipette, RefreshCw, ScanFace, SprayCan, Sun, Timer, TestTube, Zap, type LucideIcon } from "lucide-react";
import { IconTile } from "./ui";
import { ProductArt } from "./ProductArt";

export function productIcon(s: { name: string; product?: string; category?: string; flags?: any }): LucideIcon {
  const t = `${s.category} ${s.product} ${s.name}`.toLowerCase();
  if (s.flags?.sunscreen || /sunscreen|กันแดด|spf/.test(t)) return Sun;
  if (s.flags?.cleanser || /cleanser|ล้างหน้า|โฟม/.test(t)) return Droplets;
  if (/mask|มาสก์/.test(t)) return ScanFace;
  if (/spray|mist|สเปรย์/.test(t)) return SprayCan;
  if (/gel|เจล|spot|แต้ม/.test(t)) return TestTube;
  if (/serum|เซรั่ม|liposome|ampoule|essence/.test(t)) return Pipette;
  if (/emulsion|cream|moistur|lotion|ครีม/.test(t)) return Layers;
  return FlaskConical;
}

export function StepTile({ step, size = 52 }: { step: any; size?: number }) {
  // shelf products: their photo / bottle art
  if (step.image || step.icon || step.cat)
    return (
      <span className="grid shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-50 to-brand-100" style={{ width: size, height: size }}>
        <ProductArt p={{ image: step.image, icon: step.icon, color: step.color, cat: step.cat }} size={Math.round(size * 0.62)} />
      </span>
    );
  return <IconTile icon={productIcon(step)} size={size} className="rounded-2xl bg-linear-to-br from-brand-50 to-brand-100" />;
}

/** Small chips: Retinol / BHA·AHA / SPF / timer / swapped */
export function StepChips({ step, showSwap = true }: { step: any; showSwap?: boolean }) {
  const f = step.flags || {};
  const chips: [LucideIcon, string, string][] = [];
  if (f.retinol) chips.push([Zap, "Retinol", "bg-violet-50 text-violet-600"]);
  if (f.bha || f.aha) chips.push([FlaskConical, f.bha ? "BHA" : "AHA", "bg-amber-50 text-amber-700"]);
  if (f.sunscreen) chips.push([Sun, "SPF", "bg-orange-50 text-orange-600"]);
  if (step.timer?.kind === "hold") chips.push([Timer, `${step.timer.min}-${step.timer.max} นาที`, "bg-brand-50 text-brand-600"]);
  if (step.timer?.kind === "before") chips.push([Timer, `รอ ${step.timer.min}-${step.timer.max} นาที`, "bg-brand-50 text-brand-600"]);
  if (showSwap && step.swapped) chips.push([RefreshCw, "สลับเพราะผิวแสบ", "bg-sky-50 text-sky-700"]);
  if (!chips.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map(([Icon, label, cls]) => (
        <span key={label} className={`chip ${cls}`}>
          <Icon className="h-3 w-3" strokeWidth={2.2} />
          {label}
        </span>
      ))}
    </span>
  );
}
