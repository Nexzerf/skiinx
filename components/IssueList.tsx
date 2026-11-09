import { CircleAlert, Info, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";

const STYLE: Record<string, [LucideIcon, string]> = {
  error: [CircleAlert, "bg-red-50 text-red-700"],
  warn: [TriangleAlert, "bg-orange-50 text-orange-700"],
  info: [Info, "bg-sky-50 text-sky-700"],
};

export default function IssueList({ issues }: { issues: any[] }) {
  if (!issues.length)
    return (
      <div className="flex items-start gap-2.5 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        ผ่านการตรวจทุกข้อ (กรดคู่ Retinol, Retinol ซ้ำซ้อน/ติดกัน, กันแดดตอนเช้า)
      </div>
    );
  const order = { error: 0, warn: 1, info: 2 } as Record<string, number>;
  return (
    <ul className="space-y-1.5">
      {[...issues]
        .sort((a, b) => order[a.level] - order[b.level])
        .map((i, k) => {
          const [Icon, cls] = STYLE[i.level];
          return (
            <li key={k} className={`flex items-start gap-2 rounded-2xl p-3 text-sm ${cls}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {i.day ? `วัน ${i.day}${i.slot ? (i.slot === "am" ? " เช้า" : " ก่อนนอน") : ""}: ` : ""}
                {i.msg}
              </span>
            </li>
          );
        })}
    </ul>
  );
}
