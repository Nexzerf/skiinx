"use client";
// A product drawn as a little bottle / jar / tube (or its photo). Used on the shelf, in the
// routine builder and on routine steps.
import { useState } from "react";
import {
  Cherry, Citrus, Droplet, Droplets, Flower2, FlaskConical, Gem, Heart, Layers, Leaf, Moon, Pipette, ScanFace, Snowflake, Sparkles, SprayCan, Star, Sun, TestTube, Waves,
  type LucideIcon,
} from "lucide-react";

export const PRODUCT_ICONS: Record<string, LucideIcon> = {
  droplets: Droplets,
  droplet: Droplet,
  pipette: Pipette,
  layers: Layers,
  sun: Sun,
  moon: Moon,
  flask: FlaskConical,
  tube: TestTube,
  spray: SprayCan,
  mask: ScanFace,
  sparkles: Sparkles,
  leaf: Leaf,
  flower: Flower2,
  heart: Heart,
  star: Star,
  gem: Gem,
  citrus: Citrus,
  cherry: Cherry,
  snow: Snowflake,
  waves: Waves,
};
export const ICON_KEYS = Object.keys(PRODUCT_ICONS);

export const PRODUCT_COLORS = ["#f1557a", "#fb923c", "#f59e0b", "#84cc16", "#22c55e", "#14b8a6", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#94a3b8", "#b08968"];

const CAT_ICON: Record<string, string> = {
  cleanser: "droplets",
  mask: "mask",
  toner: "waves",
  exfoliant: "flask",
  essence: "droplet",
  serum: "pipette",
  treatment: "tube",
  eye: "sparkles",
  moisturizer: "layers",
  oil: "droplet",
  sleeping: "moon",
  sunscreen: "sun",
  other: "star",
};
const CAT_COLOR: Record<string, string> = {
  cleanser: "#0ea5e9",
  mask: "#14b8a6",
  toner: "#6366f1",
  exfoliant: "#f59e0b",
  essence: "#a855f7",
  serum: "#ec4899",
  treatment: "#22c55e",
  eye: "#a855f7",
  moisturizer: "#f1557a",
  oil: "#b08968",
  sleeping: "#6366f1",
  sunscreen: "#fb923c",
  other: "#94a3b8",
};
export const defaultIcon = (cat?: string | null) => CAT_ICON[cat || "other"] || "star";
export const defaultColor = (cat?: string | null) => CAT_COLOR[cat || "other"] || "#f1557a";

type Shape = "jar" | "dropper" | "tube" | "bottle" | "sachet" | "pump";
const SHAPE: Record<string, Shape> = {
  moisturizer: "jar",
  sleeping: "jar",
  eye: "jar",
  serum: "dropper",
  essence: "dropper",
  exfoliant: "bottle",
  oil: "dropper",
  treatment: "tube",
  sunscreen: "tube",
  cleanser: "pump",
  toner: "bottle",
  mask: "sachet",
  other: "bottle",
};

export type ArtProduct = { name?: string; category?: string | null; cat?: string | null; image_url?: string | null; image?: string | null; icon?: string | null; color?: string | null };

/** Bottle-shaped art. `size` is the width in px; height is 1.25 × width. */
/** Small stable number from a string, so each product blinks / sways on its own rhythm. */
export const seedOf = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

/** Kawaii face: two blinking eyes, a smile and rosy cheeks. */
function Face({ w, seed, mood = "smile" }: { w: number; seed: number; mood?: "smile" | "happy" }) {
  const eye = Math.max(3, Math.round(w * 0.075));
  const delay = `${(seed % 40) / 10}s`;
  return (
    <span className="relative flex flex-col items-center" style={{ gap: w * 0.025 }}>
      <span className="flex items-center" style={{ gap: w * 0.17 }}>
        {[0, 1].map((i) =>
          mood === "happy" ? (
            <span key={i} className="block border-t-[2px] border-[#2b2230] rounded-t-full" style={{ width: eye * 1.5, height: eye * 0.75 }} />
          ) : (
            <span key={i} className="blink block rounded-full bg-[#2b2230]" style={{ width: eye, height: eye * 1.15, animationDelay: delay }}>
              <span className="block rounded-full bg-white" style={{ width: eye * 0.38, height: eye * 0.38, margin: `${eye * 0.14}px 0 0 ${eye * 0.5}px` }} />
            </span>
          ),
        )}
      </span>
      <span className="block rounded-b-full border-b-[2px] border-[#2b2230]" style={{ width: w * 0.11, height: w * 0.055 }} />
      <span className="absolute flex justify-between" style={{ width: w * 0.5, top: eye * 1.25 }}>
        <span className="block rounded-full bg-[#ff6b8f]/55" style={{ width: w * 0.11, height: w * 0.06 }} />
        <span className="block rounded-full bg-[#ff6b8f]/55" style={{ width: w * 0.11, height: w * 0.06 }} />
      </span>
    </span>
  );
}

export function ProductArt({ p, size = 64, className = "", face = false, mood }: { p: ArtProduct; size?: number; className?: string; face?: boolean; mood?: "smile" | "happy" }) {
  const cat = p.category || p.cat || "other";
  const img = p.image_url || p.image;
  const [broken, setBroken] = useState(false);
  const color = p.color || defaultColor(cat);
  const Icon = PRODUCT_ICONS[p.icon || ""] || PRODUCT_ICONS[defaultIcon(cat)];
  const W = size, H = Math.round(size * 1.25);

  // on the shelf a photo becomes a little polaroid sticker with a heart
  if (img && !broken && face)
    return (
      <span className={`relative grid shrink-0 place-items-end justify-center ${className}`} style={{ width: W, height: H }}>
        <span className="relative block rotate-[-4deg] rounded-[14px] bg-white p-[3px] pb-[9px] shadow-[0_6px_12px_-4px_rgb(43_34_48/0.3)]" style={{ width: W * 0.92 }}>
          <img src={img} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} className="block w-full rounded-[11px] bg-canvas object-cover" style={{ height: H * 0.78 }} />
          <span className="absolute -top-2 -right-2 grid h-6 w-6 rotate-12 place-items-center rounded-full bg-brand-400 text-white shadow-sm ring-2 ring-white">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.4 3 5 6.4 5c2 0 3.4 1.1 4.1 2.3h3C14.2 6.1 15.6 5 17.6 5 21 5 23.1 8.4 21.6 11.7 19.5 16.4 12 21 12 21z" />
            </svg>
          </span>
        </span>
      </span>
    );

  if (img && !broken)
    return (
      <span className={`relative grid shrink-0 place-items-end justify-center ${className}`} style={{ width: W, height: H }}>
        <img
          src={img}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
          className="max-h-full max-w-full rounded-xl object-contain drop-shadow-[0_6px_8px_rgb(43_34_48/0.18)]"
        />
      </span>
    );

  const shape = SHAPE[cat] || "bottle";
  const body = `linear-gradient(160deg, ${color}cc, ${color})`;
  const glass = "linear-gradient(90deg, rgb(255 255 255 / 0.45), rgb(255 255 255 / 0) 35%)";
  const iconBox = Math.round(W * 0.34);
  const badge = Math.round(W * 0.24);
  const label =
    face && W >= 44 ? (
      <>
        <Face w={W} seed={seedOf(`${p.name}${color}`)} mood={mood} />
        <span className="absolute grid place-items-center rounded-full bg-white/90 shadow-sm" style={{ width: badge, height: badge, top: W * 0.04, right: W * 0.04 }}>
          <Icon style={{ width: badge * 0.62, height: badge * 0.62, color }} strokeWidth={2.4} />
        </span>
      </>
    ) : (
      <span className="grid place-items-center rounded-full bg-white/90 shadow-sm" style={{ width: iconBox, height: iconBox }}>
        <Icon style={{ width: iconBox * 0.58, height: iconBox * 0.58, color }} strokeWidth={2.2} />
      </span>
    );
  const part = (w: number, h: number, extra: React.CSSProperties, children?: React.ReactNode, cls = "") => (
    <span className={`relative grid place-items-center ${cls}`} style={{ width: W * w, height: H * h, ...extra }}>
      {children}
    </span>
  );
  const cap = (w: number, h: number, r = "6px") => part(w, h, { background: `color-mix(in oklab, ${color} 55%, #2b2230)`, borderRadius: r });

  let content: React.ReactNode;
  switch (shape) {
    case "jar":
      content = (
        <>
          {cap(0.92, 0.15, "10px 10px 4px 4px")}
          {part(0.86, 0.52, { background: `${glass}, ${body}`, borderRadius: "8px 8px 18px 18px", marginTop: -1 }, label)}
        </>
      );
      break;
    case "dropper":
      content = (
        <>
          {part(0.26, 0.17, { background: `color-mix(in oklab, ${color} 45%, #2b2230)`, borderRadius: "999px 999px 6px 6px" })}
          {cap(0.36, 0.08, "4px")}
          {part(0.6, 0.6, { background: `${glass}, ${body}`, borderRadius: "14px 14px 16px 16px" }, label)}
        </>
      );
      break;
    case "tube":
      content = (
        <>
          {part(0.62, 0.72, { background: `${glass}, ${body}`, borderRadius: "6px 6px 22px 22px", clipPath: "polygon(0 0,100% 0,92% 100%,8% 100%)" }, label)}
          {cap(0.42, 0.14, "4px 4px 10px 10px")}
        </>
      );
      break;
    case "pump":
      content = (
        <>
          <span className="relative" style={{ width: W * 0.42, height: H * 0.12 }}>
            <span className="absolute top-0 left-0 rounded-md" style={{ width: W * 0.42, height: H * 0.06, background: `color-mix(in oklab, ${color} 55%, #2b2230)` }} />
            <span className="absolute top-0 right-[30%] rounded-sm" style={{ width: W * 0.1, height: H * 0.12, background: `color-mix(in oklab, ${color} 55%, #2b2230)` }} />
          </span>
          {cap(0.3, 0.08, "3px")}
          {part(0.64, 0.62, { background: `${glass}, ${body}`, borderRadius: "16px 16px 14px 14px" }, label)}
        </>
      );
      break;
    case "sachet":
      content = part(0.84, 0.74, { background: `${glass}, ${body}`, borderRadius: "10px", boxShadow: "inset 0 6px 0 rgb(255 255 255 / 0.35)" }, label);
      break;
    default:
      content = (
        <>
          {cap(0.34, 0.15, "6px 6px 3px 3px")}
          {part(0.2, 0.05, { background: `${color}aa` })}
          {part(0.62, 0.66, { background: `${glass}, ${body}`, borderRadius: "14px" }, label)}
        </>
      );
  }
  return (
    <span className={`flex shrink-0 flex-col items-center justify-end drop-shadow-[0_6px_6px_rgb(43_34_48/0.14)] ${className}`} style={{ width: W, height: H }} aria-hidden>
      {content}
    </span>
  );
}
