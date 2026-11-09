"use client";
// Add / edit a shelf product: search Open Beauty Facts → pick → tweak, or add by hand
// with your own photo or a cute icon. Category and key actives are detected automatically.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle, PenLine, Search, Shapes, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { Sheet } from "./Sheet";
import { ICON_KEYS, PRODUCT_COLORS, PRODUCT_ICONS, ProductArt, defaultColor, defaultIcon } from "./ProductArt";
import { ACTIVES, ACTIVE_KEYS, CATEGORIES, CATEGORY_KEYS, analyzeProduct } from "@/lib/ingredients.js";
import { defaultHowto } from "@/lib/routineEngine.js";
import { searchProducts, type FoundProduct } from "@/lib/obf";
import { shrinkImage } from "@/lib/image";
import { uploadProductImage } from "@/lib/store";
import { useData } from "@/lib/data";
import type { Product } from "@/lib/types";

type Draft = {
  name: string;
  brand: string;
  category: string;
  actives: string[];
  ingredients: string;
  howto: string;
  image_url: string | null;
  icon: string | null;
  color: string | null;
  source: "manual" | "obf";
  off_code: string | null;
  tags?: string[];
};

const blank = (): Draft => ({ name: "", brand: "", category: "other", actives: [], ingredients: "", howto: "", image_url: null, icon: null, color: null, source: "manual", off_code: null });

export function ProductSheet({ open, onClose, edit, usedIn, onSaved }: { open: boolean; onClose: () => void; edit?: Product | null; usedIn?: string[]; onSaved?: (name: string) => void }) {
  const { addProduct, updateProduct, deleteProduct } = useData();
  const [step, setStep] = useState<"search" | "form">("search");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundProduct[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(false);
  const [d, setD] = useState<Draft>(blank);
  const [touched, setTouched] = useState({ cat: false, actives: false });
  const [art, setArt] = useState<"photo" | "icon">("icon");
  const [file, setFile] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // reset whenever the sheet opens
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setConfirmDel(false);
    setFile(null);
    setQ("");
    setFound(null);
    if (edit) {
      setD({
        name: edit.name,
        brand: edit.brand || "",
        category: edit.category || "other",
        actives: edit.actives || [],
        ingredients: edit.ingredients || "",
        howto: edit.howto || "",
        image_url: edit.image_url || null,
        icon: edit.icon || null,
        color: edit.color || null,
        source: edit.source || "manual",
        off_code: edit.off_code || null,
      });
      setTouched({ cat: true, actives: true });
      setArt(edit.image_url ? "photo" : "icon");
      setStep("form");
    } else {
      setD(blank());
      setTouched({ cat: false, actives: false });
      setArt("icon");
      setStep("search");
    }
  }, [open, edit]);

  useEffect(
    () => () => {
      if (file) URL.revokeObjectURL(file.url);
    },
    [file],
  );

  // search as you type
  useEffect(() => {
    if (step !== "search") return;
    const term = q.trim();
    if (term.length < 2) {
      setFound(null);
      setSearching(false);
      return;
    }
    const ac = new AbortController();
    setSearching(true);
    setSearchErr(false);
    const t = setTimeout(() => {
      searchProducts(term, ac.signal)
        .then((r) => setFound(r))
        .catch((e) => {
          if (e.name !== "AbortError") {
            setSearchErr(true);
            setFound([]);
          }
        })
        .finally(() => !ac.signal.aborted && setSearching(false));
    }, 450);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, step]);

  // auto-tag from the name until the user picks by hand
  const auto = useMemo(() => analyzeProduct({ name: d.name, brand: d.brand, ingredients: d.ingredients, tags: d.tags }), [d.name, d.brand, d.ingredients, d.tags]);
  useEffect(() => {
    setD((x) => ({
      ...x,
      category: touched.cat ? x.category : auto.category,
      actives: touched.actives ? x.actives : auto.actives,
    }));
  }, [auto, touched.cat, touched.actives]);

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const pick = (f: FoundProduct) => {
    setD({ ...blank(), name: f.name, brand: f.brand, ingredients: f.ingredients, image_url: f.image, source: "obf", off_code: f.code || null, tags: f.tags });
    setTouched({ cat: false, actives: false });
    setArt(f.image ? "photo" : "icon");
    setStep("form");
  };
  const manual = () => {
    setD({ ...blank(), name: q.trim() });
    setTouched({ cat: false, actives: false });
    setArt("icon");
    setStep("form");
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    setErr(null);
    try {
      const blob = await shrinkImage(f);
      setFile({ blob, url: URL.createObjectURL(blob) });
      setArt("photo");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const preview = {
    name: d.name,
    category: d.category,
    image_url: art === "photo" ? file?.url || d.image_url : null,
    icon: d.icon || defaultIcon(d.category),
    color: d.color || defaultColor(d.category),
  };

  const save = async () => {
    if (!d.name.trim()) return setErr("ใส่ชื่อสินค้าก่อนนะ");
    setSaving(true);
    setErr(null);
    try {
      let image_url = art === "photo" ? d.image_url : null;
      if (art === "photo" && file) image_url = await uploadProductImage(file.blob);
      const row = {
        name: d.name.trim(),
        brand: d.brand.trim() || null,
        category: d.category,
        actives: d.actives,
        ingredients: d.ingredients || null,
        howto: d.howto.trim() || null,
        image_url,
        icon: d.icon,
        color: d.color,
        source: d.source,
        off_code: d.off_code,
      };
      if (edit) await updateProduct(edit.id, row);
      else await addProduct(row);
      onSaved?.(row.name);
      onClose();
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!edit) return;
    if (!confirmDel) return setConfirmDel(true);
    setSaving(true);
    try {
      await deleteProduct(edit.id);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const title = step === "search" ? "เพิ่มสกินแคร์" : edit ? "แก้ไขสกินแคร์" : "เกือบเสร็จแล้ว";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        step === "form" ? (
          <div className="flex gap-2">
            {edit && (
              <button className={`btn shrink-0 px-4 ${confirmDel ? "bg-red-500 text-white" : "bg-white text-red-500 ring-1 ring-red-100"}`} onClick={remove} disabled={saving} aria-label="ลบ">
                <Trash2 className="h-4 w-4" />
                {confirmDel && "ยืนยันลบ"}
              </button>
            )}
            <button className="btn-primary flex-1" onClick={save} disabled={saving || !d.name.trim()}>
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.6} />}
              {edit ? "บันทึก" : "วางบนชั้น"}
            </button>
          </div>
        ) : undefined
      }
    >
      {step === "search" ? (
        <div className="space-y-3">
          <label className="flex h-12 items-center gap-2 rounded-2xl border border-brand-100 bg-white px-3.5 shadow-soft focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-100">
            <Search className="h-5 w-5 shrink-0 text-brand-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ชื่อสินค้า เช่น CeraVe, Anessa"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/70"
              enterKeyHint="search"
            />
            {searching ? (
              <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-brand-400" />
            ) : (
              q && (
                <button className="-mr-1.5 grid h-9 w-9 place-items-center rounded-full text-muted" onClick={() => setQ("")} aria-label="ล้าง">
                  <X className="h-4 w-4" />
                </button>
              )
            )}
          </label>

          <button onClick={manual} className="press flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-soft">
            <span className="icon-tile h-11 w-11 rounded-xl">
              <PenLine className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{q.trim() ? `เพิ่ม “${q.trim()}” เอง` : "เพิ่มเอง ไม่ต้องค้นหา"}</span>
              <span className="block text-xs text-muted">ใส่รูปของตัวเองหรือเลือกไอคอนน่ารัก ๆ</span>
            </span>
          </button>

          {searchErr && <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">ค้นหาไม่ได้ตอนนี้ — เพิ่มเองได้เลย</p>}
          {found && !found.length && !searchErr && !searching && (
            <p className="py-4 text-center text-sm text-muted">ไม่เจอในฐานข้อมูล — กด “เพิ่มเอง” ด้านบนได้เลย</p>
          )}
          {found && found.length > 0 && (
            <>
              <p className="px-1 text-xs text-muted">ผลการค้นหา</p>
              <div className="grid grid-cols-2 gap-2.5">
                {found.map((f, i) => (
                  <button key={`${f.code}${i}`} onClick={() => pick(f)} className="pop-i press flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center shadow-soft" style={{ ["--i" as any]: i }}>
                    <ProductArt p={{ image_url: f.image, category: analyzeProduct({ name: f.name, tags: f.tags }).category }} size={64} />
                    <span className="line-clamp-2 w-full text-[13px] leading-snug font-medium">{f.name}</span>
                    {f.brand && <span className="-mt-1.5 w-full truncate text-[11px] text-muted">{f.brand}</span>}
                  </button>
                ))}
              </div>
              <p className="px-1 pt-1 text-center text-[11px] text-muted">ข้อมูลจาก Open Beauty Facts</p>
            </>
          )}
          {!found && !searching && (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted">
              <Sparkles className="h-6 w-6 text-brand-300" />
              พิมพ์ชื่ออย่างน้อย 2 ตัวอักษรเพื่อค้นหา
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* preview */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative grid h-40 w-40 place-items-center rounded-[32px] soft-gradient">
              <span key={`${art}${preview.icon}${preview.color}${preview.category}${preview.image_url}`} className="jiggle">
                <ProductArt p={preview} size={92} face mood="happy" />
              </span>
            </div>
            <div className="flex rounded-full bg-white p-1 shadow-soft">
              <button
                className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition ${art === "photo" ? "bg-brand-500 text-white" : "text-muted"}`}
                onClick={() => (file || d.image_url ? setArt("photo") : fileRef.current?.click())}
              >
                <ImagePlus className="h-4 w-4" /> รูปถ่าย
              </button>
              <button className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition ${art === "icon" ? "bg-brand-500 text-white" : "text-muted"}`} onClick={() => setArt("icon")}>
                <Shapes className="h-4 w-4" /> ไอคอน
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || undefined)} />
            {art === "photo" && (
              <button className="text-sm font-medium text-brand-500 underline-offset-2 hover:underline" onClick={() => fileRef.current?.click()}>
                {file || d.image_url ? "เปลี่ยนรูป" : "เลือกรูป"}
              </button>
            )}
          </div>

          {art === "icon" && (
            <div className="card space-y-3">
              <div className="grid grid-cols-7 gap-1.5">
                {ICON_KEYS.map((k) => {
                  const Icon = PRODUCT_ICONS[k];
                  const on = (d.icon || defaultIcon(d.category)) === k;
                  return (
                    <button
                      key={k}
                      onClick={() => set({ icon: k })}
                      aria-label={k}
                      className={`grid aspect-square place-items-center rounded-2xl transition active:scale-90 ${on ? "bg-brand-500 text-white shadow-glow" : "bg-canvas text-ink/70 hover:bg-brand-50"}`}
                    >
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_COLORS.map((c) => {
                  const on = (d.color || defaultColor(d.category)).toLowerCase() === c;
                  return (
                    <button
                      key={c}
                      aria-label={`สี ${c}`}
                      onClick={() => set({ color: c })}
                      className={`grid h-9 w-9 place-items-center rounded-full transition hover:scale-110 ${on ? "ring-2 ring-offset-2" : ""}`}
                      style={{ background: c, ["--tw-ring-color" as any]: c }}
                    >
                      {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="pname">ชื่อสินค้า</label>
              <input id="pname" className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="เช่น Hydrating Cleanser" />
            </div>
            <div>
              <label className="label" htmlFor="pbrand">แบรนด์ (ไม่ใส่ก็ได้)</label>
              <input id="pbrand" className="input" value={d.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="เช่น CeraVe" />
            </div>
          </div>

          <div>
            <p className="label">ประเภท</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_KEYS.map((k) => {
                const on = d.category === k;
                return (
                  <button
                    key={k}
                    onClick={() => {
                      setTouched((t) => ({ ...t, cat: true }));
                      set({ category: k });
                    }}
                    className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition active:scale-95 ${
                      on ? "border-transparent bg-brand-500 text-white shadow-glow" : "border-brand-100 bg-white text-ink/70 hover:border-brand-200"
                    }`}
                  >
                    {on && <Check className="check-burst h-3.5 w-3.5" strokeWidth={3} />}
                    {CATEGORIES[k].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="label flex items-center justify-between gap-2">
              ส่วนผสมเด่น
              {!touched.actives && d.actives.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-brand-500">
                  <Sparkles className="h-3 w-3" /> ตรวจจากชื่อให้แล้ว
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ACTIVE_KEYS.map((k) => {
                const on = d.actives.includes(k);
                return (
                  <button
                    key={k}
                    onClick={() => {
                      setTouched((t) => ({ ...t, actives: true }));
                      set({ actives: on ? d.actives.filter((x) => x !== k) : [...d.actives, k] });
                    }}
                    className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition active:scale-95 ${
                      on ? (ACTIVES[k].strong ? "border-transparent bg-violet-500 text-white" : "border-transparent bg-brand-500 text-white") : "border-brand-100 bg-white text-ink/70 hover:border-brand-200"
                    }`}
                  >
                    {on && <Check className="check-burst h-3.5 w-3.5" strokeWidth={3} />}
                    {ACTIVES[k].label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">ใช้จัดลำดับและเช็กตัวที่ห้ามใช้คู่กัน ไม่แน่ใจปล่อยว่างได้</p>
          </div>

          <div>
            <label className="label" htmlFor="phow">วิธีใช้ (ไม่ใส่ก็ได้)</label>
            <input id="phow" className="input" value={d.howto} onChange={(e) => set({ howto: e.target.value })} placeholder={defaultHowto(d.category) || "เช่น ทาบาง ๆ ทั่วหน้า"} />
          </div>

          {edit && usedIn && usedIn.length > 0 && (
            <p className="rounded-2xl bg-white p-3 text-sm text-muted shadow-soft">
              ใช้อยู่ใน: <b className="text-ink">{usedIn.join(" · ")}</b>
            </p>
          )}
          {err && (
            <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {err}
            </p>
          )}
          {!edit && (
            <button className="w-full py-1 text-center text-sm text-muted" onClick={() => setStep("search")}>
              กลับไปค้นหา
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
