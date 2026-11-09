// Who may use this Skiinx: members only. The first account becomes the owner; everyone else
// joins with an invite code (link: /join?code=XXXX). All checks run in Postgres (RLS + RPCs).
import { sb } from "./supabase";

const KEY = "sd.invite";
const CODE_RE = /^[A-Z0-9]{6,12}$/;

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Remember the code from an invite link before the app redirects to /login. */
export function captureInvite() {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/join") return;
  const code = normalizeCode(new URLSearchParams(window.location.search).get("code") || "");
  if (CODE_RE.test(code)) localStorage.setItem(KEY, code);
}
export const pendingInvite = () => (typeof localStorage === "undefined" ? null : localStorage.getItem(KEY));
export const clearInvite = () => localStorage.removeItem(KEY);

export type RedeemResult = "ok" | "invalid" | "used" | "expired" | "signin" | "error";
export const REDEEM_TEXT: Record<Exclude<RedeemResult, "ok">, string> = {
  invalid: "ไม่พบรหัสเชิญนี้ — ลองเช็กตัวอักษรอีกครั้ง",
  used: "รหัสนี้ถูกใช้ไปแล้ว — ขอรหัสใหม่จากคนที่ชวน",
  expired: "รหัสนี้หมดอายุแล้ว — ขอรหัสใหม่จากคนที่ชวน",
  signin: "เข้าสู่ระบบก่อน แล้วค่อยใส่รหัส",
  error: "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง",
};

export async function redeemInvite(code: string): Promise<RedeemResult> {
  const { data, error } = await sb().rpc("skiinx_redeem_invite", { p_code: normalizeCode(code) });
  if (error) return "error";
  return (data as RedeemResult) || "error";
}

/** "owner" | "member" | null (not a member). Uses a pending invite link automatically. */
export async function ensureMembership(): Promise<{ role: string | null; redeem?: RedeemResult }> {
  const { data, error } = await sb().rpc("skiinx_membership");
  if (error) throw new Error(error.message);
  if (data) {
    if (pendingInvite()) clearInvite();
    return { role: data as string };
  }
  const code = pendingInvite();
  if (!code) return { role: null };
  const r = await redeemInvite(code);
  if (r !== "error") clearInvite();
  return r === "ok" ? { role: "member", redeem: r } : { role: null, redeem: r };
}

export async function createInvite(): Promise<string> {
  const { data, error } = await sb().rpc("skiinx_create_invite");
  if (error) throw new Error(error.message);
  return data as string;
}

export async function memberCount(): Promise<number> {
  const { data } = await sb().rpc("skiinx_member_count");
  return (data as number) || 0;
}

export const inviteLink = (code: string) => `${window.location.origin}/join?code=${code}`;
