"use client";
// Bottom sheet: slides up over the page, closes on backdrop tap / Escape / the X.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="sheet-backdrop absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="sheet-panel relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-[30px] bg-canvas shadow-[0_-20px_50px_-20px_rgb(43_34_48/0.4)]">
        <div className="flex items-center gap-2 px-5 pt-2.5">
          <span className="absolute top-2 left-1/2 h-1.5 w-11 -translate-x-1/2 rounded-full bg-brand-200" />
          <h2 className="mt-4 min-w-0 flex-1 truncate text-lg font-bold">{title}</h2>
          <button className="icon-btn mt-3 h-10 w-10" onClick={onClose} aria-label="ปิด">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-5">{children}</div>
        {footer && <div className="border-t border-brand-100/70 bg-white/80 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
