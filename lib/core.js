// Shared, dependency-free logic used by the web app AND the Supabase edge
// functions (copied to supabase/functions/_shared/core.js by `sync-core`).
// No AI anywhere: every rule here is plain if/else.

export const DEFAULT_SETTINGS = {
  tz: "Asia/Bangkok",
  dayBoundaryHour: 4,      // a "day" runs 04:00 → 03:59, so a 01:00 night routine still counts for last night
  amTime: "07:30",
  amCutoff: "13:00",       // stop nagging about the morning routine after this
  pmTime: "21:30",
  leadMinForTimedNights: 20, // nights with a timed step (e.g. 10–15 min mask) get reminded earlier
  repeatMin: 15,
  maxRepeats: 8,
  weeklySummary: true,
  summaryTime: "20:00",    // Sunday
  lastSummaryWeek: null,   // "YYYY-MM-DD" (Monday) of the last weekly summary sent
  discordEnabled: true,    // channel switch; delivery itself needs the server-side Discord secrets
  autoAnalyze: true,       // run the on-device skin analysis right after a front photo
  freezesPerWeek: 1,
  photoDays: [1, 15, 30],
  requirePhoto: true,
  sensitiveUntil: null,    // "YYYY-MM-DD" — while set, BHA cleanser is swapped for the gentle one
  typeColors: { A: "#f97316", B: "#a855f7", C: "#22c55e" },
  photoAngles: ["front"],  // any of "front" | "left" | "right"
  sensitiveLog: [],        // [{ from, to }] — shaded on the skin-score chart
  lastExportAt: null,
};

export const withDefaults = (s) => ({ ...DEFAULT_SETTINGS, ...(s || {}) });

/* ───────────────────────── text helpers ───────────────────────── */

const RE = {
  retinol: /retinol|retinal|เรตินอล|tretinoin|adapalene|retinoid/i,
  bha: /\bSA\b|salicylic|\bBHA\b|ซาลิไซลิก/i,
  aha: /\bAHA\b|glycolic|lactic|mandelic/i,
  sunscreen: /sunscreen|กันแดด|\bSPF\b|sunblock/i,
  cleanser: /cleanser|คลีนเซอร์|โฟม|ล้างหน้า|cleansing/i,
};
export const flagsOf = (name) => ({
  retinol: RE.retinol.test(name),
  bha: RE.bha.test(name),
  aha: RE.aha.test(name),
  sunscreen: RE.sunscreen.test(name),
  cleanser: RE.cleanser.test(name),
});

export function splitSteps(cell) {
  return String(cell || "")
    .split(/\s*(?:->|→|➔|➜|=>|\n)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ALIASES = { "กันแดด": "sunscreen", "คลีนเซอร์": "cleanser", "เซรั่ม": "serum", "มาสก์": "mask", "สเปรย์": "spray" };
function tokens(s) {
  return String(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean)
    .map((t) => ALIASES[t] || t);
}

function minutesIn(text) {
  const m = String(text).match(/(\d+)\s*(?:-|–|ถึง)?\s*(\d+)?\s*(?:นาที|min)/i);
  if (!m) return null;
  return { min: parseInt(m[1], 10), max: m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10) };
}

/* ───────────────────────── parse uploaded workbook ───────────────────────── */

function findRow(rows, test) {
  return rows.findIndex((r) => r && r.some((c) => c && test(c)));
}

/**
 * sheets: [{name, rows}] from readXlsx(). Returns the schedule object stored
 * in the DB. Throws a Thai error message if the 30-day table can't be found.
 */
export function buildSchedule(sheets) {
  // 1) day-by-day table
  let sched = null;
  for (const sh of sheets) {
    const h = sh.rows.findIndex(
      (r) => r && r.some((c) => /เช้า|morning/i.test(c)) && r.some((c) => /เย็น|night|ก่อนนอน|evening/i.test(c)),
    );
    if (h >= 0) { sched = { sh, h }; break; }
  }
  if (!sched) throw new Error("หาตารางรายวันไม่เจอ — ต้องมีแถวหัวตารางที่มีคอลัมน์ 'เช้า/Morning' และ 'เย็น/Night'");
  const { sh, h } = sched;
  const header = sh.rows[h];
  const col = (re, skip = -1) => header.findIndex((c, i) => i !== skip && c && re.test(c));
  const cAm = col(/เช้า|morning/i);
  const cPm = col(/เย็น|night|ก่อนนอน|evening/i, cAm);
  let cDay = col(/ลำดับ|^day\b/i);
  if (cDay < 0) cDay = 0;
  const cType = col(/รูปแบบ|type|ประเภท/i);
  const cNote = col(/หมายเหตุ|note/i);
  const cDate = col(/วันที่|^date/i);
  const days = [];
  for (let i = h + 1; i < sh.rows.length; i++) {
    const r = sh.rows[i] || [];
    const am = splitSteps(r[cAm]);
    const pm = splitSteps(r[cPm]);
    if (!am.length && !pm.length) continue;
    const rawType = cType >= 0 ? r[cType] || "" : "";
    const tm = rawType.match(/\[\s*([A-Za-z0-9ก-ฮ]+)\s*\]\s*(.*)/);
    days.push({
      n: days.length + 1,
      label: r[cDay] || `วัน ${days.length + 1}`,
      am,
      pm,
      type: tm ? tm[1].toUpperCase() : rawType || "",
      typeLabel: tm ? tm[2].trim() : rawType,
      note: cNote >= 0 ? r[cNote] || "" : "",
    });
  }
  if (!days.length) throw new Error("ตารางรายวันว่างเปล่า");
  // the "date" column is only a hint for the upload page's default start date
  let suggestedStart = null;
  if (cDate >= 0) {
    const first = sh.rows.slice(h + 1).find((r) => r && r[cDate]);
    const m = first && String(first[cDate]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const iso = first && String(first[cDate]).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) suggestedStart = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    else if (iso) suggestedStart = `${iso[1]}-${iso[2]}-${iso[3]}`;
    else if (first && /^\d{5}(\.\d+)?$/.test(first[cDate])) suggestedStart = new Date(Date.UTC(1899, 11, 30) + Math.floor(+first[cDate]) * 864e5).toISOString().slice(0, 10);
  }
  const nonEmpty = sh.rows.slice(0, h).map((r) => (r || []).find(Boolean)).filter(Boolean);

  // 2) product guide + night-type table (optional)
  const products = [];
  const nightTypes = {};
  const tips = [];
  for (const s of sheets) {
    const rows = s.rows;
    const ph = findRow(rows, (c) => /ชื่อสินค้า|^product/i.test(c));
    if (ph >= 0) {
      const hr = rows[ph];
      const cName = hr.findIndex((c) => /ชื่อสินค้า|^product/i.test(c));
      const cCat = hr.findIndex((c) => /ประเภท|category|type/i.test(c));
      const cHow = hr.findIndex((c) => /วิธี|คำแนะนำ|how|usage/i.test(c));
      for (let i = ph + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        if (!r[cName] || !/^\d+$/.test(r[0] || "")) { if (products.length) break; continue; }
        products.push({ name: r[cName], category: cCat >= 0 ? r[cCat] : "", howto: cHow >= 0 ? r[cHow] : "", slot: "am" });
      }
    }
    const nh = findRow(rows, (c) => /รูปแบบคืน|night type/i.test(c));
    if (nh >= 0) {
      for (let i = nh + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const m = (r[0] || "").match(/\[\s*([A-Za-z0-9ก-ฮ]+)\s*\]\s*(.*)/);
        if (!m) continue;
        const cells = r.slice(1).filter(Boolean);
        nightTypes[m[1].toUpperCase()] = { label: m[2].trim(), cells };
        for (const cell of cells) {
          const pm = cell.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
          products.push({ name: (pm ? pm[1] : cell).trim(), category: "", howto: pm ? pm[2].trim() : "", slot: "pm" });
        }
      }
    }
    const th = findRow(rows, (c) => /^หัวข้อ$|^topic$/i.test(c));
    if (th >= 0) {
      for (let i = th + 1; i < rows.length; i++) {
        const r = (rows[i] || []).filter(Boolean);
        if (r.length >= 2) tips.push({ topic: r[0], advice: r[1], reason: r[2] || "" });
      }
    }
  }

  return { v: 1, title: nonEmpty[0] || "ตารางสกินแคร์", subtitle: nonEmpty[1] || "", suggestedStart, days, products, nightTypes, tips };
}

/* ───────────────────────── steps & routines ───────────────────────── */

export function findProduct(step, schedule) {
  const st = tokens(step);
  let best = null, bestScore = 0;
  for (const p of schedule.products || []) {
    const pt = new Set(tokens(p.name));
    const score = st.filter((t) => pt.has(t)).length;
    if (score > bestScore || (score === bestScore && best && !best.howto && p.howto)) { best = p; bestScore = score; }
  }
  const need = st.length <= 1 ? 1 : 2;
  return bestScore >= need ? best : null;
}

function gentleCleanser(schedule) {
  for (const d of schedule.days) for (const s of [...d.pm, ...d.am]) {
    const f = flagsOf(s);
    if (f.cleanser && !f.bha && !f.aha) return s;
  }
  return null;
}

/** Steps for a cycle day + slot, enriched with product info, timers and flags. */
export function routineFor(schedule, n, slot, { sensitive = false } = {}) {
  const day = schedule.days[n - 1];
  if (!day) return [];
  let names = day[slot].slice();
  let swapped = false;
  if (sensitive) {
    const gentle = gentleCleanser(schedule);
    if (gentle) names = names.map((s) => {
      const f = flagsOf(s);
      if (f.cleanser && (f.bha || f.aha)) { swapped = true; return gentle; }
      return s;
    });
  }
  return names.map((name, i) => {
    const p = findProduct(name, schedule);
    const text = `${name} ${p?.howto || ""}`;
    const mins = minutesIn(text);
    const before = mins && /ก่อน|before/i.test(p?.howto || "");
    return {
      i,
      name,
      product: p?.name || name,
      category: p?.category || "",
      howto: p?.howto || "",
      timer: mins ? { ...mins, kind: before ? "before" : "hold" } : null,
      flags: flagsOf(text),
      swapped: swapped && flagsOf(name).cleanser,
    };
  });
}

/* ───────────────────────── safety checks (plain rules) ───────────────────────── */

export function validateSchedule(schedule) {
  const issues = [];
  const L = schedule.days.length;
  const retinolNight = schedule.days.map((d) => d.pm.some((s) => RE.retinol.test(s)));
  for (const d of schedule.days) {
    for (const slot of ["am", "pm"]) {
      const steps = d[slot];
      const where = { day: d.n, slot };
      if (!steps.length) { issues.push({ level: "error", ...where, msg: `ไม่มีขั้นตอน${slot === "am" ? "ตอนเช้า" : "ก่อนนอน"}` }); continue; }
      const retinols = steps.filter((s) => RE.retinol.test(s));
      const acids = steps.filter((s) => RE.bha.test(s) || RE.aha.test(s));
      if (retinols.length && acids.length)
        issues.push({ level: "error", ...where, msg: `ใช้กรด (${acids.join(", ")}) คู่กับ Retinol (${retinols.join(", ")}) ในรอบเดียวกัน — เสี่ยงแสบ ลอก` });
      if (retinols.length > 1)
        issues.push({ level: "error", ...where, msg: `มี Retinol ซ้ำซ้อน ${retinols.length} ตัว (${retinols.join(", ")})` });
      if (slot === "am" && retinols.length)
        issues.push({ level: "warn", ...where, msg: "มี Retinol ในตอนเช้า — Retinol ควรใช้ตอนกลางคืน" });
      if (slot === "am" && !steps.some((s) => RE.sunscreen.test(s)))
        issues.push({ level: "warn", ...where, msg: "ตอนเช้าไม่มีกันแดด" });
    }
    const i = d.n - 1;
    if (retinolNight[i] && retinolNight[(i + 1) % L])
      issues.push({ level: "warn", day: d.n, slot: "pm", msg: `Retinol 2 คืนติดกัน (วัน ${d.n} และ ${((i + 1) % L) + 1})` });
  }
  const used = new Set(schedule.days.map((d) => d.type));
  for (const [t, nt] of Object.entries(schedule.nightTypes || {}))
    if (!used.has(t)) issues.push({ level: "info", day: null, slot: "pm", msg: `มีรูปแบบคืน [${t}] ${nt.label} ในชีต Routines แต่ไม่ได้ใช้ในตารางรายวันเลย` });
  if (L !== 30) issues.push({ level: "info", day: null, slot: null, msg: `ตารางมี ${L} วัน — ระบบจะวนทุก ${L} วัน` });
  return issues;
}

/* ───────────────────────── dates & cycle ───────────────────────── */

const pad = (n) => String(n).padStart(2, "0");
export const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

export function zonedParts(instant, tz) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "short",
  });
  const o = {};
  for (const p of f.formatToParts(instant)) o[p.type] = p.value;
  const hour = o.hour === "24" ? 0 : +o.hour;
  return { date: `${o.year}-${o.month}-${o.day}`, hour, minute: +o.minute, second: +o.second, weekday: o.weekday };
}

/** "Logical" date: before dayBoundaryHour still counts as the previous day. */
export function logicalDate(instant, s) {
  const st = withDefaults(s);
  return zonedParts(new Date(+instant - st.dayBoundaryHour * 3600e3), st.tz).date;
}

/** Minutes since the logical day's midnight (01:00 next morning → 1500). */
export function logicalMinutes(instant, s) {
  const st = withDefaults(s);
  const ld = logicalDate(instant, st);
  const p = zonedParts(instant, st.tz);
  const m = p.hour * 60 + p.minute;
  return p.date === ld ? m : m + 1440;
}

const utcOf = (d) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
export const addDays = (d, n) => new Date(utcOf(d) + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((utcOf(a) - utcOf(b)) / 864e5);
export const weekdayOf = (d) => new Date(utcOf(d)).getUTCDay(); // 0 = Sunday
export const weekStart = (d) => addDays(d, -((weekdayOf(d) + 6) % 7)); // Monday

/** Wall-clock time in tz → UTC instant (ms). */
export function zonedToUtc(date, hhmm, tz) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = zonedParts(new Date(guess), tz);
  const asUtc = Date.UTC(...p.date.split("-").map((v, i) => (i === 1 ? +v - 1 : +v)), p.hour, p.minute);
  return guess - (asUtc - guess);
}

/**
 * schedules: [{id, start_date, data, created_at}] (enabled ones).
 * The schedule for a date is the one with the latest start_date ≤ date.
 */
export function scheduleFor(date, schedules) {
  let best = null;
  for (const s of schedules || []) {
    if (!s.start_date || s.start_date > date) continue;
    if (!best || s.start_date > best.start_date || (s.start_date === best.start_date && String(s.created_at) > String(best.created_at))) best = s;
  }
  return best;
}

/** start_date that makes `date` land on cycle day n. */
export const startForCycleDay = (date, n) => addDays(date, -(n - 1));

/** Which pass through the table (1, 2, …) a date falls in. */
export const cycleRound = (startDate, date, len) => Math.floor(diffDays(date, startDate) / len) + 1;

export function cycleDay(startDate, date, len) {
  const d = diffDays(date, startDate);
  return ((d % len) + len) % len + 1;
}

/** Everything the UI / reminders need for one date. */
export function dayInfo(date, schedules, settings) {
  const st = withDefaults(settings);
  const s = scheduleFor(date, schedules);
  if (!s) return null;
  const sch = s.data;
  const n = cycleDay(s.start_date, date, sch.days.length);
  const d = sch.days[n - 1];
  const sensitive = !!(st.sensitiveUntil && date <= st.sensitiveUntil);
  const am = routineFor(sch, n, "am", { sensitive });
  const pm = routineFor(sch, n, "pm", { sensitive });
  return {
    date, n, len: sch.days.length, scheduleId: s.id, scheduleName: s.name || sch.title,
    type: d.type, typeLabel: d.typeLabel || sch.nightTypes?.[d.type]?.label || "", note: d.note,
    am, pm, sensitive,
    photoDay: (st.photoDays || []).includes(n),
    pmHasTimer: pm.some((x) => x.timer && x.timer.kind === "hold"),
  };
}

/* ───────────────────────── streaks & stats ───────────────────────── */

export const ckey = (date, slot) => `${date}|${slot}`;
export const toCheckSet = (rows) => new Set((rows || []).map((r) => ckey(r.date, r.slot)));

/** Status of one date: "done" | "half" | "missed" | "frozen" | "today" | "future" | "none". */
export function computeStreak(today, checks, firstDate, settings) {
  const st = withDefaults(settings);
  const status = {};
  if (!firstDate) return { current: 0, best: 0, status };
  // walk forward to compute freezes deterministically
  const used = {};
  let run = 0, best = 0;
  for (let d = firstDate; d <= today; d = addDays(d, 1)) {
    const a = checks.has(ckey(d, "am")), p = checks.has(ckey(d, "pm"));
    if (a && p) { status[d] = "done"; run++; best = Math.max(best, run); continue; }
    if (d === today) { status[d] = a || p ? "half-today" : "today"; continue; }
    const wk = weekStart(d);
    if ((used[wk] || 0) < st.freezesPerWeek && run > 0) {
      used[wk] = (used[wk] || 0) + 1; status[d] = "frozen"; continue;
    }
    status[d] = a || p ? "half" : "missed";
    run = 0;
  }
  return { current: run, best, status, freezesLeftThisWeek: Math.max(0, st.freezesPerWeek - (used[weekStart(today)] || 0)) };
}

const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export function periodStats(from, to, checks) {
  let am = 0, pm = 0, days = 0;
  const missByDow = Array.from({ length: 7 }, () => ({ am: 0, pm: 0 }));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days++;
    const a = checks.has(ckey(d, "am")), p = checks.has(ckey(d, "pm"));
    if (a) am++; else missByDow[weekdayOf(d)].am++;
    if (p) pm++; else missByDow[weekdayOf(d)].pm++;
  }
  let worst = null;
  missByDow.forEach((m, dow) => {
    for (const slot of ["am", "pm"]) if (m[slot] > 0 && (!worst || m[slot] > worst.count)) worst = { dow, slot, count: m[slot] };
  });
  return {
    days, am, pm, done: am + pm, total: days * 2,
    rate: days ? Math.round(((am + pm) / (days * 2)) * 100) : 0,
    worst: worst && { ...worst, text: `${worst.slot === "am" ? "ตอนเช้า" : "ก่อนนอน"}วัน${TH_DAYS[worst.dow]} (${worst.count} ครั้ง)` },
  };
}

/* ───────────────────────── reminders (pure decision) ───────────────────────── */

const NAG = {
  am: [
    "ได้เวลาสกินแคร์ตอนเช้าแล้ว",
    "ยังไม่ได้ติ๊กรอบเช้า — อย่าลืมกันแดด",
    "ผ่านมา {mins} นาทีแล้ว ยังไม่ได้ทารอบเช้า",
    "แดดแรงขึ้นทุกนาที ทากันแดดก่อนออกจากบ้าน",
    "streak {streak} วันกำลังจะหาย — ไปทาเลย",
  ],
  pm: [
    "ได้เวลาสกินแคร์ก่อนนอนแล้ว",
    "ยังไม่ได้ติ๊กรอบก่อนนอน",
    "ผ่านมา {mins} นาทีแล้ว — ล้างหน้าก่อนเผลอหลับ",
    "อย่าเพิ่งนอน ยังไม่ได้ทาสกินแคร์",
    "streak {streak} วันกำลังจะหาย — ลุกไปทาก่อน",
  ],
};

export function reminderText(slot, attempt, ctx) {
  const list = NAG[slot];
  return list[Math.min(attempt - 1, list.length - 1)]
    .replace("{mins}", String(ctx.mins ?? 0))
    .replace("{streak}", String(ctx.streak ?? 0));
}

/**
 * Decide which reminders to send right now.
 * states: { "date|slot": { sent_count, last_sent, snooze_until } }
 * Returns [{ date, slot, attempt, info, text }]
 */
export function planReminders({ now, settings, schedules, checks, states, streak = 0 }) {
  const st = withDefaults(settings);
  const date = logicalDate(now, st);
  const info = dayInfo(date, schedules, st);
  if (!info) return [];
  const nowMin = logicalMinutes(now, st);
  const out = [];
  const windows = {
    am: [toMin(st.amTime), toMin(st.amCutoff)],
    pm: [toMin(st.pmTime) - (info.pmHasTimer ? st.leadMinForTimedNights : 0), 1440 + st.dayBoundaryHour * 60],
  };
  for (const slot of ["am", "pm"]) {
    const [start, end] = windows[slot];
    if (nowMin < start || nowMin >= end) continue;
    if (checks.has(ckey(date, slot))) continue;
    const s = states[ckey(date, slot)] || {};
    if (s.snooze_until && +new Date(s.snooze_until) > +now) continue;
    const sent = s.sent_count || 0;
    if (sent >= st.maxRepeats) continue;
    if (s.last_sent && +now - +new Date(s.last_sent) < (st.repeatMin - 1) * 60e3) continue;
    const attempt = sent + 1;
    out.push({ date, slot, attempt, info, text: reminderText(slot, attempt, { mins: nowMin - start, streak }) });
  }
  return out;
}

/* ───────────────────────── calendar file (.ics) ───────────────────────── */

function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "", len = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (len + b > limit) { out.push(cur); cur = ""; len = 0; limit = 74; }
    cur += ch; len += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const icsTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildIcs({ schedules, settings, from, days = 60, appUrl = "" }) {
  const st = withDefaults(settings);
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//skincare-routine//TH", "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:สกินแคร์ทุกวัน", "X-PUBLISHED-TTL:PT6H", "REFRESH-INTERVAL;VALUE=DURATION:PT6H"];
  const stamp = icsTime(Date.now());
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const info = dayInfo(date, schedules, st);
    if (!info) continue;
    for (const slot of ["am", "pm"]) {
      const steps = info[slot];
      let time = slot === "am" ? st.amTime : st.pmTime;
      if (slot === "pm" && info.pmHasTimer) {
        const m = toMin(time) - st.leadMinForTimedNights;
        time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      }
      const startMs = zonedToUtc(date, time, st.tz);
      const title = slot === "am"
        ? `☀️ สกินแคร์เช้า · วัน ${info.n}/${info.len}`
        : `🌙 ${info.type ? `[${info.type}] ` : ""}${info.typeLabel || "สกินแคร์ก่อนนอน"} · วัน ${info.n}/${info.len}`;
      const desc = steps.map((s, k) => `${k + 1}. ${s.name}${s.timer?.kind === "hold" ? ` (${s.timer.min}-${s.timer.max} นาที)` : ""}`).join("\n")
        + (slot === "pm" && info.note ? `\n\n${info.note}` : "") + (appUrl ? `\n\nติ๊กว่าทาแล้ว: ${appUrl}` : "");
      L.push("BEGIN:VEVENT", `UID:${date}-${slot}@skincare-routine`, `DTSTAMP:${stamp}`,
        `DTSTART:${icsTime(startMs)}`, `DTEND:${icsTime(startMs + 15 * 60e3)}`,
        `SUMMARY:${icsEscape(title)}`, `DESCRIPTION:${icsEscape(desc)}`,
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(title)}`, "TRIGGER:PT0M", "END:VALARM",
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape("ทาหรือยัง? " + title)}`, "TRIGGER:PT20M", "END:VALARM",
        "END:VEVENT");
    }
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
