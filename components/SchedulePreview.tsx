"use client";
import { useMemo, useState } from "react";
import { useData } from "@/lib/data";
import * as core from "@/lib/core.js";
import { typeColor } from "@/lib/util";
import { ChevronDown, ChevronUp, Moon, Sun } from "lucide-react";

/** 30-row preview, colored by night type. Steps that don't match any product are highlighted yellow. */
export default function SchedulePreview({ data, collapsed, title, highlight }: { data: any; collapsed?: boolean; title?: string; highlight?: number }) {
  const { settings } = useData();
  const [open, setOpen] = useState(!collapsed);
  const unmatched = useMemo(() => {
    const set = new Set<string>();
    for (const d of data.days) for (const s of [...d.am, ...d.pm]) if (!core.findProduct(s, data)) set.add(s);
    return set;
  }, [data]);
  const matches = useMemo(() => {
    const names = new Set<string>();
    for (const d of data.days) for (const s of [...d.am, ...d.pm]) names.add(s);
    return [...names].map((n) => [n, core.findProduct(n, data)?.name] as const);
  }, [data]);

  const Step = ({ s }: { s: string }) => <span className={unmatched.has(s) ? "rounded bg-yellow-200 px-0.5" : ""}>{s}</span>;
  const Steps = ({ list }: { list: string[] }) => (
    <>
      {list.map((s, i) => (
        <span key={i}>
          {i > 0 && <span className="text-gray-300"> → </span>}
          <Step s={s} />
        </span>
      ))}
    </>
  );

  return (
    <div className="card">
      <button className="-my-2.5 flex w-full items-center justify-between gap-2 py-2.5 text-left font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="min-w-0 truncate">{title || "พรีวิวตาราง"}</span> {open ? <ChevronUp className="h-5 w-5 text-muted" /> : <ChevronDown className="h-5 w-5 text-muted" />}
      </button>
      {open && (
        <>
          <div className="mt-3 max-h-[60vh] overflow-auto rounded-lg ring-1 ring-brand-100">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-brand-50 text-left">
                <tr>
                  <th className="p-1.5">วัน</th>
                  <th className="p-2"><span className="flex items-center gap-1"><Sun className="h-3.5 w-3.5 text-amber-500" /> เช้า</span></th>
                  <th className="p-2"><span className="flex items-center gap-1"><Moon className="h-3.5 w-3.5 text-violet-500" /> ก่อนนอน</span></th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d: any) => (
                  <tr key={d.n} className={`border-t border-brand-50 align-top ${highlight === d.n ? "bg-brand-100/60" : ""}`}>
                    <td className="p-1.5 whitespace-nowrap">
                      {d.n}
                      {d.type && (
                        <span className="tag mt-1 block w-fit" style={{ background: typeColor(settings, d.type) }}>
                          {d.type}
                        </span>
                      )}
                    </td>
                    <td className="p-1.5">
                      <Steps list={d.am} />
                    </td>
                    <td className="p-1.5">
                      <Steps list={d.pm} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">
              ผลการจับคู่สินค้า ({matches.length - unmatched.size}/{matches.length} จับคู่ได้)
            </summary>
            <ul className="mt-2 space-y-1">
              {matches.map(([n, p]) => (
                <li key={n} className={p ? "" : "rounded bg-yellow-100 px-1"}>
                  {n} → <span className="text-muted">{p || "ไม่พบสินค้าที่ตรง (จะแสดงชื่อตามตาราง)"}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
