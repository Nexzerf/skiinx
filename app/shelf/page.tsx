"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileSpreadsheet, Moon, Plus, Sun, Wand2 } from "lucide-react";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { CATEGORIES } from "@/lib/ingredients.js";
import { PageTitle } from "@/components/ui";
import { ProductArt } from "@/components/ProductArt";
import { ProductSheet } from "@/components/ProductSheet";
import type { Product } from "@/lib/types";
import { useUsage } from "@/lib/useUsage";

const PER_ROW = 3;

export default function ShelfPage() {
  const { ready, snap } = useData();
  const [sheet, setSheet] = useState<{ open: boolean; edit: Product | null }>({ open: false, edit: null });
  const [poke, setPoke] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { map: usage, active } = useUsage();

  const products = useMemo(
    () =>
      snap.products
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
    setTimeout(() => setSheet({ open: true, edit: p }), 260);
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
      <section className="relative overflow-hidden rounded-[32px] bg-white px-3 pt-4 pb-3 shadow-soft">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-brand-50 to-transparent" />
        {rows.map((row, ri) => (
          <div key={ri} className="relative mb-3 last:mb-0">
            <div className="relative z-10 grid grid-cols-3 items-end gap-1 px-1">
              {row.map((it, ci) => {
                const idx = ri * PER_ROW + ci;
                if (it === "add")
                  return (
                    <button
                      key="add"
                      onClick={() => setSheet({ open: true, edit: null })}
                      className="drop-in shelf-item group flex flex-col items-center gap-1.5 pb-1"
                      style={{ ["--i" as any]: idx }}
                      aria-label="เพิ่มสกินแคร์"
                    >
                      <span className="grid h-[80px] w-[64px] place-items-center rounded-[20px] border-2 border-dashed border-brand-200 bg-brand-50/60 text-brand-400 transition group-hover:border-brand-300 group-hover:bg-brand-50">
                        <Plus className="h-6 w-6" strokeWidth={2.4} />
                      </span>
                      <span className="text-[12px] font-medium text-brand-500">เพิ่ม</span>
                    </button>
                  );
                const u = usage[String(it.id)];
                return (
                  <button
                    key={String(it.id)}
                    onClick={() => open(it)}
                    className="drop-in shelf-item relative flex min-w-0 flex-col items-center gap-1.5 pb-1"
                    style={{ ["--i" as any]: idx }}
                    aria-label={it.name}
                  >
                    <span key={poke === String(it.id) ? "poke" : "idle"} className={poke === String(it.id) ? "jiggle" : ""} onAnimationEnd={() => setPoke(null)}>
                      <ProductArt p={it} size={64} />
                    </span>
                    {u && (
                      <span className="absolute top-0 right-1 flex gap-0.5">
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
                    <span className="line-clamp-2 w-full px-0.5 text-center text-[12px] leading-tight font-medium break-words">{it.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="shelf-plank relative -mt-1 h-3.5 rounded-full" />
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
