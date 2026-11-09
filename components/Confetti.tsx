"use client";
import { useMemo } from "react";

const COLORS = ["#f43f5e", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#a855f7"];

export default function Confetti({ count = 80 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        dx: `${(Math.random() - 0.5) * 200}px`,
        delay: Math.random() * 0.8,
        color: COLORS[i % COLORS.length],
      })),
    [count],
  );
  return (
    <>
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti"
          style={{ left: `${b.left}%`, background: b.color, animationDelay: `${b.delay}s`, ["--dx" as any]: b.dx }}
        />
      ))}
    </>
  );
}
