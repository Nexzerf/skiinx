// Supabase returns OAuth / magic-link failures in the URL (?error=… or #error=…). The app redirects
// to /login right away, which would drop them — so stash them first and show them in Thai.
const KEY = "sd.authError";

export function captureAuthError() {
  if (typeof window === "undefined") return;
  const read = (s: string) => new URLSearchParams(s.replace(/^[?#]/, ""));
  for (const p of [read(window.location.search), read(window.location.hash)]) {
    const desc = p.get("error_description") || p.get("error");
    if (desc) {
      sessionStorage.setItem(KEY, JSON.stringify({ code: p.get("error_code") || p.get("error") || "", desc }));
      return;
    }
  }
}

export function takeAuthError(): string | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    const { code, desc } = JSON.parse(raw);
    return explainAuthError(`${code} ${desc}`);
  } catch {
    return null;
  }
}

/** Map Supabase auth errors to something actionable. */
export function explainAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("signup") && (m.includes("not allowed") || m.includes("disabled")))
    return "บัญชี Discord นี้ยังไม่ได้เชื่อมกับ Skiinx — เข้าสู่ระบบด้วยอีเมลก่อน แล้วไปที่ ตั้งค่า → เชื่อมบัญชี Discord (ครั้งเดียว) จากนั้นจะเข้าด้วย Discord ได้เลย";
  if (m.includes("manual linking") || m.includes("manual_linking"))
    return "ยังเชื่อมบัญชีไม่ได้: ต้องเปิด “Allow manual linking” ใน Supabase → Authentication ก่อน";
  if (m.includes("identity") && m.includes("already"))
    return "บัญชี Discord นี้ถูกใช้กับผู้ใช้อื่นอยู่แล้ว";
  if (m.includes("provider is not enabled") || m.includes("unsupported provider"))
    return "ยังไม่ได้เปิดการเข้าสู่ระบบด้วย Discord ในระบบหลังบ้าน";
  if (m.includes("access_denied") || m.includes("denied"))
    return "ยกเลิกการเข้าสู่ระบบด้วย Discord";
  if (m.includes("expired") || m.includes("otp"))
    return "ลิงก์เข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว — ขอลิงก์ใหม่อีกครั้ง";
  if (m.includes("rate limit"))
    return "ขอลิงก์บ่อยเกินไป — รอสักครู่แล้วลองใหม่";
  return `เข้าสู่ระบบไม่สำเร็จ: ${msg.trim()}`;
}
