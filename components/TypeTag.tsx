"use client";
import { useData } from "@/lib/data";
import { typeColor } from "@/lib/util";

export default function TypeTag({ type, label, small }: { type: string; label?: string; small?: boolean }) {
  const { settings } = useData();
  return (
    <span className={`tag ${small ? "text-[11px]" : ""}`} style={{ background: typeColor(settings, type) }}>
      [{type}] {label}
    </span>
  );
}
