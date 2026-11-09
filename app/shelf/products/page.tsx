"use client";
// All my products with expiry tracking: expired / expiring soon, opened (how long), unopened, empties.
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, PackageCheck, PackageOpen, Plus, ScanLine, TriangleAlert, Archive } from "lucide-react";
import { useData } from "@/lib/data";
import { durationTh, expiryState, expiryText, type ExpiryState } from "@/lib/expiry.js";
import { PageTitle } from "@/components/ui";
import { ProductArt } from "@/components/ProductArt";
import { ProductSheet } from "@/components/ProductSheet";
import type { Product } from "@/lib/types";

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const thDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${TH_MONTHS[m - 1]} ${String(y + 543).slice(2)}`;
};

type Row = { p: Product; st: ExpiryState };

export default function ProductsPage() {
  const { ready, snap, today, updateProduct } = useData();
  const [sheet, setSheet] = useState<{ open: boolean; edit: Product | null; scan?: boolean }>({ open: false, edit: null });

  const rows: Row[] = useMemo(() => snap.products.map((p) => ({ p, st: expiryState(p, today) })), [snap.products, today]);
  const expired = rows.filter((r) => r.st.state === "expired");
  const soon = rows.filter((r) => r.st.state === "soon" || r.st.state === "ok").filter((r) => r.st.days != null).sort((a, b) => a.st.days! - b.st.days!).slice(0, 8);
  const opened = rows.filter((r) => (r.p.status ?? "opened") === "opened").sort((a, b) => (a.p.opened_at || "").localeCompare(b.p.opened_at || ""));
  const unopened = rows.filter((r) => r.p.status === "unopened");
  const empties = rows.filter((r) => r.p.status === "empty").sort((a, b) => (b.p.finished_at || "").localeCompare(a.p.finished_at || ""));
  const byMonth = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of empties) {
      const k = (r.p.finished_at || r.p.created_at || today).slice(0, 7);
      m.set(k, [...(m.get(k) || []), r]);
    }
    return [...m.entries()];
  }, [empties, today]);

  if (!ready) return null;
  const edit = (p: Product) => setSheet({ open: true, edit: p });

  return (
    <div className="stagger space-y-5">
      <PageTitle
        title="สินค้าของฉัน"
        sub={`${rows.length - empties.length} ชิ้นที่มี · ใช้หมดแล้ว ${empties.length}`}
        back={
          <Link href="/shelf" className="icon-btn mt-0.5" aria-label="กลับไปชั้นวาง">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
        right={
          <button className="icon-btn bg-linear-to-br from-brand-400 to-brand-500 text-white shadow-glow" onClick={() => setSheet({ open: true, edit: null, scan: true })} aria-label="สแกนสินค้า">
            <ScanLine className="h-5 w-5" strokeWidth={2.4} />
          </button>
        }
      />

      {!rows.length && (
        <div className="card text-center">
          <p className="font-semibold">ยังไม่มีสินค้า</p>
          <p className="mt-1 text-sm text-muted">สแกนบาร์โค้ดหรือถ่ายรูปฉลาก แล้วระบบดึงชื่อกับส่วนผสมให้</p>
          <button className="btn-primary mt-3 w-full" onClick={() => setSheet({ open: true, edit: null, scan: true })}>
            <ScanLine className="h-4 w-4" /> สแกนชิ้นแรก
          </button>
        </div>
      )}

      {(expired.length > 0 || soon.length > 0) && (
        <section>
          <h2 className="mb-2 px-1 text-lg font-bold text-brand-600">หมดอายุเร็วที่สุด</h2>
          <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
            {expired.length > 0 && (
              <div className="flex w-36 shrink-0 snap-start flex-col justify-between rounded-3xl bg-linear-to-br from-brand-100 to-brand-200 p-4 shadow-soft">
                <span className="text-5xl font-bold text-brand-600 tabular-nums">{expired.length}</span>
                <span className="text-lg leading-tight font-bold text-brand-600">หมดอายุแล้ว</span>
              </div>
            )}
            {expired.concat(soon).map(({ p, st }) => (
              <button key={p.id} onClick={() => edit(p)} className="press flex w-40 shrink-0 snap-start flex-col items-start gap-2 rounded-3xl bg-white p-3 text-left shadow-soft">
                <ProductArt p={p} size={44} className="self-center" />
                <span className="w-full">
                  {p.brand && <span className="block truncate text-xs font-semibold">{p.brand}</span>}
                  <span className="line-clamp-2 text-sm leading-snug text-ink/80">{p.name}</span>
                </span>
                <span className={`text-sm font-semibold ${st.state === "expired" ? "text-red-500" : st.state === "soon" ? "text-orange-500" : "text-emerald-600"}`}>{expiryText(st)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {opened.length > 0 && (
        <Group title="เปิดใช้อยู่" icon={PackageOpen}>
          {opened.map(({ p, st }) => (
            <Item key={p.id} p={p} onClick={() => edit(p)}>
              <span className="text-xs text-muted">{!p.opened_at ? "ยังไม่ได้ใส่วันที่เปิด" : p.opened_at >= today ? "เปิดวันนี้" : `เปิดมา ${durationTh(p.opened_at, today)}`}</span>
              {st.date && <Badge st={st} />}
            </Item>
          ))}
        </Group>
      )}

      {unopened.length > 0 && (
        <Group title="ยังไม่เปิด" icon={PackageCheck}>
          {unopened.map(({ p, st }) => (
            <Item key={p.id} p={p} onClick={() => edit(p)}>
              {st.date ? <Badge st={st} /> : <span className="text-xs text-muted">ไม่ได้ใส่วันหมดอายุ</span>}
              <button
                className="mt-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600 active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  updateProduct(p.id, { status: "opened", opened_at: today });
                }}
              >
                เปิดใช้วันนี้
              </button>
            </Item>
          ))}
        </Group>
      )}

      {byMonth.length > 0 && (
        <Group title="ใช้หมดแล้ว" icon={Archive}>
          {byMonth.map(([month, list]) => {
            const [y, m] = month.split("-").map(Number);
            return (
              <div key={month} className="rounded-2xl bg-canvas p-3">
                <p className="mb-2 flex justify-between text-sm font-semibold">
                  {TH_MONTHS[m - 1]} {y + 543} <span className="text-muted">{list.length}</span>
                </p>
                <div className="space-y-2">
                  {list.map(({ p }) => (
                    <button key={p.id} onClick={() => edit(p)} className="flex w-full items-center gap-3 rounded-xl bg-white p-2 text-left">
                      <ProductArt p={p} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block text-xs text-muted">
                          ✓ {p.finished_at ? thDate(p.finished_at) : "–"}
                          {p.opened_at && p.finished_at ? ` · ใช้ไป ${durationTh(p.opened_at, p.finished_at)}` : ""}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </Group>
      )}

      {rows.length > 0 && (
        <button className="btn-plain w-full" onClick={() => setSheet({ open: true, edit: null })}>
          <Plus className="h-4 w-4" /> เพิ่มสินค้า
        </button>
      )}

      <ProductSheet open={sheet.open} onClose={() => setSheet({ open: false, edit: null })} edit={sheet.edit} startScan={sheet.scan} />
    </div>
  );
}

function Group({ title, icon: Icon, children }: { title: string; icon: typeof PackageOpen; children: React.ReactNode }) {
  return (
    <section className="card space-y-2.5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 text-brand-500" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Item({ p, onClick, children }: { p: Product; onClick: () => void; children: React.ReactNode }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} className="press flex items-center gap-3 rounded-2xl bg-canvas p-2.5">
      <ProductArt p={p} size={40} />
      <span className="flex min-w-0 flex-1 flex-col items-start">
        {p.brand && <span className="block max-w-full truncate text-xs font-semibold text-muted">{p.brand}</span>}
        <span className="block max-w-full truncate text-sm font-medium">{p.name}</span>
        {children}
      </span>
    </div>
  );
}

function Badge({ st }: { st: ExpiryState }) {
  const cls = st.state === "expired" ? "text-red-500" : st.state === "soon" ? "text-orange-500" : "text-emerald-600";
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${cls}`}>
      {st.state === "expired" && <TriangleAlert className="h-3 w-3" />}
      {expiryText(st)}
    </span>
  );
}
