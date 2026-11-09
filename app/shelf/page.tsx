"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, FileSpreadsheet, Flower2, Heart, Moon, Plus, Sparkles, Sprout, Star, Sun, Wand2 } from "lucide-react";
import { expiryState } from "@/lib/expiry.js";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { CATEGORIES } from "@/lib/ingredients.js";
import { PageTitle } from "@/components/ui";
import { ProductArt, seedOf } from "@/components/ProductArt";
import { ProductSheet } from "@/components/ProductSheet";
import type { Product } from "@/lib/types";
import { useUsage } from "@/lib/useUsage";

const PER_ROW = 3;

type DecoKind = "plant" | "flowers" | "star";
/** Fill one empty spot per shelf with a little decoration. */
function decoFor(row: number, col: number, used: number): DecoKind | null {
  if (used >= PER_ROW) return null;
  const spot = used === 0 ? (row % 2 ? 0 : 2) : PER_ROW - 1;
  if (col !== spot) return null;
  return (["plant", "flowers", "star"] as const)[row % 3];
}

function Deco({ kind, i }: { kind: DecoKind; i: number }) {
  const pot = (children: React.ReactNode, potColor: string) => (
    <span className="drop-in flex flex-col items-center" style={{ ["--i" as any]: i }} aria-hidden>
      <span className="sway-slow block">{children}</span>
      <span className="-mt-1 block h-[22px] w-[34px] rounded-[4px]" style={{ background: potColor, clipPath: "polygon(0 0,100% 0,86% 100%,14% 100%)" }} />
    </span>
  );
  if (kind === "plant") return pot(<Sprout className="h-10 w-10 text-emerald-500" strokeWidth={2} />, "linear-gradient(180deg,#ffb4c4,#f48aa5)");
  if (kind === "flowers") return pot(<Flower2 className="h-10 w-10 text-brand-400" strokeWidth={2} />, "linear-gradient(180deg,#c4b5fd,#a78bfa)");
  return (
    <span className="drop-in flex flex-col items-center" style={{ ["--i" as any]: i }} aria-hidden>
      <span className="twinkle-soft grid h-11 w-11 place-items-center rounded-full bg-amber-100">
        <Star className="h-6 w-6 fill-amber-300 text-amber-400" />
      </span>
      <span className="block h-4 w-1.5 bg-amber-200" />
      <span className="block h-1.5 w-8 rounded-full bg-amber-300" />
    </span>
  );
}

export default function ShelfPage() {
  const { ready, snap, today } = useData();
  const [sheet, setSheet] = useState<{ open: boolean; edit: Product | null }>({ open: false, edit: null });
  const [poke, setPoke] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { map: usage, active } = useUsage();

  const products = useMemo(
    () =>
      snap.products
        .filter((p) => p.status !== "empty")
        .map((p, i) => [p, i] as const)
        .sort((a, b) => (CATEGORIES[a[0].category]?.order ?? 45) - (CATEGORIES[b[0].category]?.order ?? 45) || a[1] - b[1])
        .map(([p]) => p),
    [snap.products],
  );

  if (!ready) return null;

  const rows: (Product | "add")[][] = [];
  const items: (Product | "add")[] = [...products, "add"];
  for (let i = 0; i < items.length; i += PER_ROW) rows.push(items.slice(i, i + PER_ROW));
  while (rows.length < 2) rows.push([]);

  const open = (p: Product) => {
    setPoke(String(p.id));
    setTimeout(() => setSheet({ open: true, edit: p }), 420);
    setTimeout(() => setPoke((x) => (x === String(p.id) ? null : x)), 900);
  };
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };
  const shelfRoutine = active?.data?.source === "shelf";

  return (
    <div className="stagger space-y-4">
      <PageTitle
        title="ชั้นวางของฉัน"
        sub={products.length ? `${products.length} ชิ้นบนชั้น · แตะเพื่อดูหรือแก้ไข` : "เก็บสกินแคร์ที่มีไว้ตรงนี้"}
        right={
          <button className="icon-btn bg-linear-to-br from-brand-400 to-brand-500 text-white shadow-glow" onClick={() => setSheet({ open: true, edit: null })} aria-label="เพิ่มสกินแคร์">
            <Plus className="h-5 w-5" strokeWidth={2.4} />
          </button>
        }
      />

      {/* the shelf */}
      <section className="shelf-wall relative overflow-hidden rounded-[34px] px-3 pt-0 pb-4 shadow-soft">
        {/* striped awning with a scalloped edge */}
        <div className="shelf-awning -mx-3 h-7" aria-hidden />
        <div className="shelf-scallop -mx-3 -mt-px h-3" aria-hidden />

        {/* hanging sign */}
        <div className="relative mx-auto -mt-1 mb-2 flex w-fit flex-col items-center" aria-hidden>
          <span className="flex gap-12">
            <span className="h-4 w-px bg-brand-300" />
            <span className="h-4 w-px bg-brand-300" />
          </span>
          <span className="swing -mt-0.5 flex items-center gap-1.5 rounded-2xl border-2 border-white bg-linear-to-br from-brand-300 to-brand-500 px-3.5 py-1 text-[13px] font-bold text-white shadow-glow">
            <Heart className="h-3.5 w-3.5 fill-white" />
            {products.length ? `${products.length} ชิ้นน่ารัก` : "ชั้นยังว่างอยู่"}
            <Sparkles className="h-3.5 w-3.5" />
          </span>
        </div>

        {rows.map((row, ri) => (
          <div key={ri} className="relative mb-4 last:mb-0">
            {/* things standing on the shelf */}
            <div className="relative z-10 grid grid-cols-3 items-end gap-1 px-1">
              {Array.from({ length: PER_ROW }, (_, ci) => {
                const it = row[ci];
                const idx = ri * PER_ROW + ci;
                if (!it) {
                  const deco = decoFor(ri, ci, row.length);
                  return (
                    <span key={`d${ci}`} className="flex justify-center">
                      {deco && <Deco kind={deco} i={idx} />}
                    </span>
                  );
                }
                if (it === "add")
                  return (
                    <button key="add" onClick={() => setSheet({ open: true, edit: null })} className="drop-in shelf-item group flex justify-center" style={{ ["--i" as any]: idx }} aria-label="เพิ่มสกินแคร์">
                      <span className="grid h-[78px] w-[58px] place-items-center rounded-t-[26px] rounded-b-[14px] border-2 border-dashed border-brand-300 bg-white/70 text-brand-400 transition group-hover:bg-white">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100">
                          <Plus className="h-5 w-5" strokeWidth={2.6} />
                        </span>
                      </span>
                    </button>
                  );
                const id = String(it.id);
                const u = usage[id];
                const seed = seedOf(id);
                const poked = poke === id;
                return (
                  <button key={id} onClick={() => open(it)} className="drop-in shelf-item relative flex min-w-0 justify-center" style={{ ["--i" as any]: idx }} aria-label={it.name}>
                    <span className="sway block" style={{ animationDuration: `${3.2 + (seed % 17) / 10}s`, animationDelay: `-${(seed % 30) / 10}s` }}>
                      <span key={poked ? "poke" : "idle"} className={`block ${poked ? "jiggle" : ""}`}>
                        <ProductArt p={it} size={62} face mood={poked ? "happy" : "smile"} />
                      </span>
                    </span>
                    {poked && (
                      <span className="pointer-events-none absolute inset-x-0 top-0 flex justify-center" aria-hidden>
                        {[-16, 0, 16].map((x, k) => (
                          <Heart key={k} className="heart-rise absolute top-0 left-1/2 -ml-[7px] h-3.5 w-3.5 fill-brand-400 text-brand-400" style={{ ["--x" as any]: `${x}px`, animationDelay: `${k * 90}ms` }} />
                        ))}
                      </span>
                    )}
                    {u && (
                      <span className="absolute -top-1 right-1 flex gap-0.5">
                        {u.am && (
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-100 text-amber-600 ring-2 ring-white" title="ใช้ตอนเช้า">
                            <Sun className="h-3 w-3" strokeWidth={2.4} />
                          </span>
                        )}
                        {u.pm && (
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-violet-100 text-violet-600 ring-2 ring-white" title="ใช้กลางคืน">
                            <Moon className="h-3 w-3" strokeWidth={2.4} />
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* the plank, with little brackets */}
            <div className="relative -mt-1">
              <div className="shelf-plank relative h-4 rounded-full" />
              <span className="shelf-bracket absolute top-3 left-6" aria-hidden />
              <span className="shelf-bracket shelf-bracket-r absolute top-3 right-6" aria-hidden />
            </div>

            {/* name tags under the plank */}
            <div className="relative grid grid-cols-3 gap-1 px-1 pt-1.5">
              {Array.from({ length: PER_ROW }, (_, ci) => {
                const it = row[ci];
                if (!it) return <span key={ci} />;
                if (it === "add")
                  return (
                    <span key={ci} className="flex justify-center">
                      <button onClick={() => setSheet({ open: true, edit: null })} className="name-tag bg-brand-500 text-white">
                        เพิ่มชิ้นใหม่
                      </button>
                    </span>
                  );
                return (
                  <span key={ci} className="flex min-w-0 justify-center">
                    <button onClick={() => open(it)} className="name-tag max-w-full bg-white text-ink" tabIndex={-1}>
                      <span className="line-clamp-2 [overflow-wrap:normal] [word-break:normal]">{it.name}</span>
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {!products.length && (
        <div className="card text-center">
          <p className="font-semibold">ชั้นยังว่างอยู่</p>
          <p className="mt-1 text-sm text-muted">เพิ่มสกินแคร์ที่มี แล้วให้ระบบจัดรูทีนให้ — ไม่ต้องทำตารางเอง</p>
          <button className="btn-primary mt-3 w-full" onClick={() => setSheet({ open: true, edit: null })}>
            <Plus className="h-4 w-4" strokeWidth={2.6} /> เพิ่มชิ้นแรก
          </button>
        </div>
      )}

      {products.length > 0 && (
        <Link href="/shelf/routine" className="hero press flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/25">
            <Wand2 className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-bold">{shelfRoutine ? "ปรับรูทีนของฉัน" : "ให้ระบบจัดรูทีนให้"}</span>
            <span className="block text-sm text-white/85">เรียงลำดับ แยกตัวที่ห้ามใช้คู่กัน ให้อัตโนมัติ</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" />
        </Link>
      )}

      <ProductsLink products={snap.products} today={today} />

      <Link href="/schedule" className="card press flex items-center gap-3">
        <span className="icon-tile h-11 w-11 rounded-xl">
          <FileSpreadsheet className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">ตารางของฉัน</span>
          <span className="block text-sm text-muted">{active ? `ใช้อยู่: ${active.name}` : "มีตาราง Excel อยู่แล้ว? นำเข้าได้ที่นี่"}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
      </Link>

      <ProductSheet
        open={sheet.open}
        edit={sheet.edit}
        usedIn={sheet.edit ? usage[String(sheet.edit.id)]?.where : undefined}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        onSaved={(name) => !sheet.edit && flash(`วาง ${name} บนชั้นแล้ว`)}
      />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-6">
          <span className="pop rounded-full bg-ink/90 px-4 py-2.5 text-sm font-medium text-white shadow-lg">{toast}</span>
        </div>
      )}
    </div>
  );
}

function ProductsLink({ products, today }: { products: Product[]; today: string }) {
  const states = products.map((p) => expiryState(p, today).state);
  const expired = states.filter((x) => x === "expired").length, soon = states.filter((x) => x === "soon").length;
  return (
    <Link href="/shelf/products" className="card press flex items-center gap-3">
      <span className="icon-tile h-11 w-11 rounded-xl">
        <CalendarClock className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">สินค้าของฉัน · วันหมดอายุ</span>
        <span className="block text-sm text-muted">
          {expired ? <b className="text-red-500">หมดอายุแล้ว {expired} ชิ้น</b> : soon ? <b className="text-orange-500">ใกล้หมดอายุ {soon} ชิ้น</b> : "ดูวันเปิด ใช้ไปนานแค่ไหน และของที่ใช้หมด"}
        </span>
      </span>
      {expired + soon > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{expired + soon}</span>}
      <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  );
}
