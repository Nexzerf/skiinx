"use client";
import { useEffect } from "react";

// Blocks copying and zooming app-wide. Copy is only allowed from form fields and
// from elements explicitly marked with `data-copyable` (e.g. invite code/link).
// Copy buttons that use navigator.clipboard.writeText still work — they don't fire "copy".
const ALLOWED = 'input, textarea, [contenteditable="true"], [data-copyable]';

function allowed(node: Node | null | undefined) {
  const el = node instanceof Element ? node : node?.parentElement;
  return !!el?.closest(ALLOWED);
}

function selectionAllowed() {
  const a = document.activeElement;
  if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) return true;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return true;
  return allowed(sel.anchorNode) && allowed(sel.focusNode);
}

export default function NoCopyNoZoom() {
  useEffect(() => {
    const opts = { passive: false, capture: true } as const;

    const onCopy = (e: ClipboardEvent) => {
      if (!selectionAllowed()) e.preventDefault();
    };
    const onContextMenu = (e: Event) => {
      if (!allowed(e.target as Node)) e.preventDefault();
    };
    const onSelectStart = (e: Event) => {
      if (!allowed(e.target as Node)) e.preventDefault();
    };
    const onDragStart = (e: DragEvent) => {
      if (!allowed(e.target as Node)) e.preventDefault();
    };
    // pinch-zoom (iOS Safari ignores user-scalable=no)
    const onGesture = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    // trackpad pinch / ctrl+scroll
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    // ctrl/cmd + (+ - = 0)
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "_", "0"].includes(e.key)) e.preventDefault();
    };

    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCopy, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("selectstart", onSelectStart, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("gesturestart", onGesture, opts);
    document.addEventListener("gesturechange", onGesture, opts);
    document.addEventListener("gestureend", onGesture, opts);
    document.addEventListener("touchmove", onTouchMove, opts);
    window.addEventListener("wheel", onWheel, opts);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCopy, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("selectstart", onSelectStart, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("gesturestart", onGesture, opts);
      document.removeEventListener("gesturechange", onGesture, opts);
      document.removeEventListener("gestureend", onGesture, opts);
      document.removeEventListener("touchmove", onTouchMove, opts);
      window.removeEventListener("wheel", onWheel, opts);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return null;
}
