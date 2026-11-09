// Expiry tracking for shelf products (pure, unit-tested).
// A product goes off at the EARLIER of: the printed expiry date, or opened date + PAO months
// (the open-jar "12M" symbol). Dates are "YYYY-MM-DD" strings.

export const PAO_CHOICES = [3, 6, 9, 12, 18, 24, 36];
export const SOON_DAYS = 30;

/** Typical months-after-opening by category, used when the label doesn't say. */
export const DEFAULT_PAO = { sunscreen: 12, serum: 6, essence: 12, exfoliant: 12, treatment: 6, toner: 12, cleanser: 12, moisturizer: 12, eye: 6, mask: 12, sleeping: 12, oil: 12, other: 12 };

const pad = (n) => String(n).padStart(2, "0");
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function addMonths(date, months) {
  const d = toDate(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fmt(d);
}
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);

/** When it goes off, and why ("pao" = months after opening, "printed" = date on the pack). */
export function expiryOf(p) {
  const pao = p.status === "opened" && p.opened_at && p.pao_months ? addMonths(p.opened_at, p.pao_months) : null;
  const printed = p.expires_on || null;
  if (pao && printed) return pao <= printed ? { date: pao, by: "pao" } : { date: printed, by: "printed" };
  if (pao) return { date: pao, by: "pao" };
  if (printed) return { date: printed, by: "printed" };
  return null;
}

/** "expired" | "soon" (≤30 days) | "ok" | "unknown"; finished products are "empty". */
export function expiryState(p, today) {
  if (p.status === "empty") return { state: "empty", days: null, date: null, by: null };
  const e = expiryOf(p);
  if (!e) return { state: "unknown", days: null, date: null, by: null };
  const days = daysBetween(today, e.date);
  return { state: days < 0 ? "expired" : days <= SOON_DAYS ? "soon" : "ok", days, date: e.date, by: e.by };
}

/** "4 เดือน 13 วัน" between two dates (Thai). */
export function durationTh(from, to) {
  if (!from || !to || to < from) return "";
  let months = 0;
  while (addMonths(from, months + 1) <= to) months++;
  const days = daysBetween(addMonths(from, months), to);
  const parts = [];
  if (months >= 12) parts.push(`${Math.floor(months / 12)} ปี`);
  if (months % 12) parts.push(`${months % 12} เดือน`);
  if (days || !parts.length) parts.push(`${days} วัน`);
  return parts.join(" ");
}

/** "หมดอายุใน 5 วัน" / "หมดอายุแล้ว 3 วัน" / "เหลือ 4 เดือน" */
export function expiryText(st) {
  if (st.days == null) return "";
  if (st.days < 0) return `หมดอายุแล้ว ${-st.days} วัน`;
  if (st.days === 0) return "หมดอายุวันนี้";
  if (st.days <= 60) return `หมดอายุใน ${st.days} วัน`;
  return `เหลือ ${Math.round(st.days / 30)} เดือน`;
}

/* ───────── reading dates off a label (OCR text) ───────── */

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const year4 = (y) => {
  let n = +y;
  if (n < 100) n += 2000;
  if (n > 2400) n -= 543; // Thai Buddhist year
  return n;
};
const valid = (y, m, d = 1) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Printed expiry from label text: "EXP 05/2027", "EXP: 2027.05.12", "หมดอายุ 12/05/2570", "BB 05 2027",
 * "EXP MAY 2027". Month-only dates count as the end of that month. Returns "YYYY-MM-DD" or null.
 */
export function parseExpiry(text) {
  const t = String(text || "").replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, "0");
  const key = /(?:EXP(?:IRY|IRATION)?\.?(?:\s*DATE)?|E\.?X\.?P\.?|BEST\s*BEFORE|USE\s*BY|BB[E]?|หมดอายุ|วันหมดอายุ|ควรใช้ก่อน)\s*[:.\-]?\s*/gi;
  let m;
  while ((m = key.exec(t))) {
    const rest = t.slice(m.index + m[0].length, m.index + m[0].length + 24);
    let r;
    if ((r = rest.match(/^(\d{4})[./\- ](\d{1,2})(?:[./\- ](\d{1,2}))?/))) {
      const y = year4(r[1]), mo = +r[2], d = r[3] ? +r[3] : null;
      if (valid(y, mo, d || 1)) return `${y}-${pad(mo)}-${pad(d || lastDay(y, mo))}`;
    }
    if ((r = rest.match(/^(\d{1,2})[./\- ](\d{1,2})[./\- ](\d{2,4})/))) {
      const y = year4(r[3]), mo = +r[2], d = +r[1];
      if (valid(y, mo, d)) return `${y}-${pad(mo)}-${pad(d)}`;
    }
    if ((r = rest.match(/^(\d{1,2})[./\- ](\d{4}|\d{2})\b/))) {
      const y = year4(r[2]), mo = +r[1];
      if (valid(y, mo)) return `${y}-${pad(mo)}-${pad(lastDay(y, mo))}`;
    }
    if ((r = rest.match(/^([A-Za-z]{3,4})[.\s\-]*(\d{4}|\d{2})\b/)) && MON[r[1].toLowerCase()]) {
      const y = year4(r[2]), mo = MON[r[1].toLowerCase()];
      if (valid(y, mo)) return `${y}-${pad(mo)}-${pad(lastDay(y, mo))}`;
    }
  }
  return null;
}

/** Months-after-opening from the open-jar symbol text: "12M", "12 M", "6m". */
export function parsePao(text) {
  const m = String(text || "").match(/(?:^|[^\w])(3|6|9|12|18|24|30|36)\s?M(?![a-z])/);
  return m ? +m[1] : null;
}
