// Rule-based routine builder: products on the shelf → morning routine + night types + rotation.
// Every decision is a plain rule (layering order, what clashes, AM vs PM). No AI.
import { CATEGORIES, ACTIVES, has, isAcid } from "./ingredients.js";

const ord = (p) => CATEGORIES[p.category]?.order ?? 45;
const byOrder = (list) => list.map((p, i) => [p, i]).sort((a, b) => ord(a[0]) - ord(b[0]) || a[1] - b[1]).map(([p]) => p);
const uniq = (arr) => [...new Set(arr)];

export const NIGHT_META = {
  A: { label: "คืนผลัดเซลล์", color: "#f59e0b" },
  B: { label: "คืนเรตินอยด์", color: "#8b5cf6" },
  C: { label: "คืนพักผิว", color: "#22c55e" },
};

const DEFAULT_HOWTO = {
  mask: "ทิ้งไว้ 10-15 นาที แล้วล้างออก",
  sunscreen: "ทาปริมาณ 2 ข้อนิ้ว ก่อนออกแดด 15 นาที",
  exfoliant: "ทาบาง ๆ ไม่ต้องล้างออก เลี่ยงรอบตา",
  treatment: "แต้มเฉพาะจุด",
};
export const defaultHowto = (category) => DEFAULT_HOWTO[category] || "";

const LIGHT = /gel|lotion|emulsion|fluid|light|water|aqua|เจล|โลชั่น|อิมัลชั่น/i;
const RICH = /cream|balm|rich|barrier|night|ครีม|บาล์ม/i;

/**
 * Suggest a routine from shelf products.
 * @param products [{ id, name, brand, category, actives }]
 * @param opts { level: "gentle" | "normal" }
 * @returns { routine: { am, nights, pattern, level }, notes: [{level,text}], unused: [{id, reason}] }
 */
export function proposeRoutine(products, opts = {}) {
  const level = opts.level === "gentle" ? "gentle" : "normal";
  const notes = [];
  const unused = [];
  const skip = (p, reason) => unused.push({ id: p.id, reason });
  const of = (c) => products.filter((p) => p.category === c);

  // cleansers: a plain one for mornings / retinoid nights, an acid/BPO wash for the other nights
  const cleansers = of("cleanser");
  const gentle = cleansers.find((p) => !isAcid(p) && !has(p, "bpo") && !has(p, "retinoid"));
  const active = cleansers.find((p) => p !== gentle && (isAcid(p) || has(p, "bpo")));
  const amClean = gentle || cleansers[0] || null;
  const pmCleanB = gentle || cleansers.find((p) => !isAcid(p)) || null; // never an acid wash on retinoid nights
  const pmCleanOther = active || gentle || cleansers[0] || null;
  for (const p of cleansers) if (p !== amClean && p !== pmCleanB && p !== pmCleanOther) skip(p, "มีคลีนเซอร์หลายตัว — ใช้ทีละตัวพอ");

  const leaveOn = products.filter((p) => p.category !== "cleanser" && p.category !== "mask");
  // one retinoid at a time
  const retinoids = leaveOn.filter((p) => has(p, "retinoid"));
  const retinoid = retinoids[0] || null;
  for (const p of retinoids.slice(1)) skip(p, "มีเรตินอยด์ซ้ำ — ใช้ทีละตัว เก็บไว้ใช้ตอนตัวแรกหมด");
  for (const p of retinoids) if (isAcid(p)) notes.push({ level: "warn", text: `${p.name} มีทั้งเรตินอยด์และกรด — เริ่มสัปดาห์ละ 2 คืนก่อน แล้วค่อยเพิ่ม` });

  // one leave-on acid at a time
  const acids = leaveOn.filter((p) => isAcid(p) && !has(p, "retinoid"));
  const acid = acids[0] || null;
  for (const p of acids.slice(1)) skip(p, "มีกรดผลัดเซลล์หลายตัว — ใช้ทีละตัวพอ ผิวจะได้ไม่บาง");

  const vitc = leaveOn.filter((p) => has(p, "vitc") && !has(p, "retinoid") && !isAcid(p));
  const bpo = leaveOn.filter((p) => has(p, "bpo") && !has(p, "retinoid") && !isAcid(p));
  const strongIds = new Set([...retinoids, ...acids, ...vitc, ...bpo].map((p) => p.id));

  // sunscreen: one
  const sun = leaveOn.filter((p) => p.category === "sunscreen");
  for (const p of sun.slice(1)) skip(p, "ใช้กันแดดตัวเดียวก็พอ (ตัวนี้เก็บไว้พกเติมระหว่างวัน)");

  // moisturizer: lighter in the morning, richer at night
  const moist = leaveOn.filter((p) => p.category === "moisturizer" && !strongIds.has(p.id));
  let amMoist = moist[0] || null, pmMoist = moist[0] || null;
  if (moist.length > 1) {
    amMoist = moist.find((p) => LIGHT.test(p.name)) || moist[0];
    pmMoist = moist.find((p) => p !== amMoist && RICH.test(p.name)) || moist.find((p) => p !== amMoist) || amMoist;
    for (const p of moist) if (p !== amMoist && p !== pmMoist) skip(p, "มีครีมหลายตัว — รอบละตัวก็พอ");
  }

  // the gentle middle layers (toner, essence, serum, eye, other) go everywhere
  const middle = leaveOn.filter(
    (p) => !strongIds.has(p.id) && ["toner", "essence", "serum", "eye", "other"].includes(p.category),
  );
  const oils = leaveOn.filter((p) => p.category === "oil" && !strongIds.has(p.id));
  const sleeping = leaveOn.filter((p) => p.category === "sleeping" && !strongIds.has(p.id));
  const treatments = leaveOn.filter((p) => p.category === "treatment" && !strongIds.has(p.id));
  const masks = products.filter((p) => p.category === "mask" && !has(p, "retinoid"));
  for (const p of products) if (p.category === "mask" && has(p, "retinoid")) skip(p, "มาสก์ที่มีเรตินอยด์ — ใส่เองในคืนเรตินอยด์ถ้าต้องการ");
  const exfoliantNightMask = masks.filter((p) => isAcid(p)); // AHA/BHA wash-off masks → exfoliating nights only
  const gentleMasks = masks.filter((p) => !isAcid(p));

  const am = byOrder([amClean, ...middle, ...vitc, amMoist, sun[0]].filter(Boolean));
  const base = (clean) => [clean, ...middle, pmMoist, ...oils].filter(Boolean);

  const nights = {};
  const hasR = !!retinoid, hasA = !!acid || exfoliantNightMask.length > 0;
  if (hasA) nights.A = { label: NIGHT_META.A.label, list: byOrder([...base(pmCleanOther), acid, ...exfoliantNightMask].filter(Boolean)) };
  if (hasR) nights.B = { label: NIGHT_META.B.label, list: byOrder(base(pmCleanB).concat(retinoid)) };
  nights.C = {
    label: hasA || hasR ? NIGHT_META.C.label : "ก่อนนอน",
    list: byOrder([...base(pmCleanOther === active && (hasA || hasR) ? pmCleanB : pmCleanOther), ...bpo, ...treatments, ...gentleMasks, ...sleeping]),
  };
  // a leave-on retinoid in cream form replaces neither the moisturizer nor the order; fine as is

  let pattern;
  if (hasA && hasR) pattern = level === "gentle" ? ["A", "C", "B", "C", "C", "C"] : ["A", "B", "C", "C"];
  else if (hasR) pattern = level === "gentle" ? ["B", "C", "C"] : ["B", "C"];
  else if (hasA) pattern = level === "gentle" ? ["A", "C", "C"] : ["A", "C"];
  else pattern = ["C"];

  // advice
  if (!sun.length)
    notes.push({ level: hasR || hasA ? "warn" : "tip", text: hasR || hasA ? "ยังไม่มีกันแดด — ใช้เรตินอยด์/กรดแล้วผิวไวแดดขึ้น ควรมีกันแดดทุกเช้า" : "ยังไม่มีกันแดด — แนะนำให้เพิ่ม เป็นขั้นสุดท้ายของตอนเช้า" });
  if (hasR && cleansers.length && !pmCleanB)
    notes.push({ level: "warn", text: "คลีนเซอร์ที่มีมีกรดทั้งหมด — คืนเรตินอยด์ให้ล้างหน้าด้วยน้ำเปล่า หรือเพิ่มคลีนเซอร์อ่อนโยน" });
  if (!cleansers.length) notes.push({ level: "tip", text: "ยังไม่มีคลีนเซอร์ — ใส่ไว้จะได้ครบขั้นตอน" });
  if (!moist.length) notes.push({ level: hasR || hasA ? "warn" : "tip", text: "ยังไม่มีมอยส์เจอร์ไรเซอร์ — ช่วยลดแสบแห้งจากตัวยาได้มาก" });
  if (hasR) notes.push({ level: "tip", text: "เรตินอยด์ใช้ปริมาณเท่าเม็ดถั่ว ทาหลังผิวแห้งสนิท เลี่ยงรอบตาและมุมปาก ถ้าแสบให้เว้นเพิ่มอีกคืน" });
  if (hasR && hasA) notes.push({ level: "info", text: "แยกคืนกรดกับคืนเรตินอยด์ไม่ให้ชนกัน แล้วมีคืนพักผิวคั่น" });
  if (vitc.length) notes.push({ level: "info", text: "วิตามินซีจัดไว้ตอนเช้า ใช้คู่กันแดดช่วยปกป้องผิวได้ดีขึ้น" });
  if (bpo.length && (hasR || hasA)) notes.push({ level: "info", text: "เบนโซอิลเปอร์ออกไซด์แยกไปคืนพักผิว ไม่ทาคู่กับเรตินอยด์หรือกรด" });
  if (level === "gentle" && (hasR || hasA)) notes.push({ level: "info", text: "โหมดเริ่มต้น: ใช้ตัวยาห่างขึ้น พอผิวชินใน 2-4 สัปดาห์ค่อยเปลี่ยนเป็นโหมดปกติ" });

  const out = {};
  for (const [k, n] of Object.entries(nights)) out[k] = { label: n.label, ids: uniq(n.list.map((p) => p.id)) };
  const placed = new Set([...am.map((p) => p.id), ...Object.values(out).flatMap((n) => n.ids), ...unused.map((u) => u.id)]);
  for (const p of products) if (!placed.has(p.id)) skip(p, "ระบบยังไม่แน่ใจว่าควรใช้ตอนไหน — เพิ่มเองได้");
  return { routine: { am: uniq(am.map((p) => p.id)), nights: out, pattern, level }, notes, unused };
}

/* ───────── live checks while the user edits ───────── */

const leave = (p) => p.category !== "cleanser" && p.category !== "mask";

/** @returns [{ level: "error"|"warn"|"tip", where: "am"|nightKey|"pattern", text }] */
export function checkRoutine(routine, productsById) {
  const issues = [];
  const get = (id) => productsById[id];
  const slot = (where, ids) => {
    const list = ids.map(get).filter(Boolean);
    const name = (p) => p.name;
    const ret = list.filter((p) => leave(p) && has(p, "retinoid"));
    const acid = list.filter((p) => leave(p) && isAcid(p));
    const vitc = list.filter((p) => leave(p) && has(p, "vitc"));
    const bpo = list.filter((p) => leave(p) && has(p, "bpo"));
    if (!list.length) issues.push({ level: "warn", where, text: "ยังไม่มีขั้นตอน" });
    if (ret.length > 1) issues.push({ level: "error", where, text: `เรตินอยด์ซ้ำ ${ret.length} ตัว (${ret.map(name).join(", ")}) — เลือกตัวเดียว` });
    const acidOnly = list.filter((p) => p.category !== "mask" && isAcid(p) && !has(p, "retinoid"));
    if (ret.length && acidOnly.length) issues.push({ level: "error", where, text: `${acidOnly.map(name).join(", ")} (กรด) ใช้คู่กับ ${ret.map(name).join(", ")} (เรตินอยด์) — เสี่ยงแสบ แยกคนละคืน` });
    if (acid.length > 1) issues.push({ level: "warn", where, text: `กรดผลัดเซลล์ ${acid.length} ตัวในรอบเดียว — เสี่ยงผิวบาง` });
    if (ret.length && bpo.length) issues.push({ level: "warn", where, text: `เบนโซอิลฯ (${bpo.map(name).join(", ")}) กับเรตินอยด์ — แยกคนละคืนดีกว่า` });
    if (vitc.length && acid.filter((p) => !has(p, "vitc")).length) issues.push({ level: "tip", where, text: "วิตามินซีกับกรดในรอบเดียวกันอาจแสบ — ย้ายวิตามินซีไปตอนเช้า" });
    if (where === "am") {
      if (ret.length) issues.push({ level: "error", where, text: "เรตินอยด์โดนแดดแล้วเสื่อม — ย้ายไปใช้กลางคืน" });
      if (acid.length) issues.push({ level: "warn", where, text: "กรดตอนเช้าทำให้ผิวไวแดด — ย้ายไปกลางคืนดีกว่า" });
      const sunIdx = list.findIndex((p) => p.category === "sunscreen");
      if (sunIdx < 0) issues.push({ level: list.length ? "warn" : "tip", where, text: "ตอนเช้ายังไม่มีกันแดด" });
      else if (sunIdx !== list.length - 1) issues.push({ level: "warn", where, text: "กันแดดควรเป็นขั้นสุดท้ายของตอนเช้า" });
    } else if (list.some((p) => p.category === "sunscreen")) issues.push({ level: "tip", where, text: "กันแดดไม่จำเป็นตอนกลางคืน" });
    const ci = list.findIndex((p) => p.category === "cleanser");
    if (ci > 0) issues.push({ level: "warn", where, text: "ล้างหน้าควรเป็นขั้นแรก" });
    // thin → thick
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (a.category === "cleanser" || b.category === "sunscreen") continue;
      if (ord(a) - ord(b) >= 15) {
        issues.push({ level: "tip", where, text: `ทา ${b.name} ก่อน ${a.name} (เนื้อบางไปหนา)` });
        break;
      }
    }
    if (list.length > 8) issues.push({ level: "tip", where, text: `${list.length} ขั้นตอน — เยอะไป ลดลงได้ผิวจะชอบกว่า` });
  };
  slot("am", routine.am || []);
  for (const [k, n] of Object.entries(routine.nights || {})) slot(k, n.ids || []);
  const p = routine.pattern || [];
  if (!p.length) issues.push({ level: "error", where: "pattern", text: "ยังไม่ได้เลือกว่าคืนไหนใช้อะไร" });
  for (const k of uniq(p)) if (!routine.nights?.[k]) issues.push({ level: "error", where: "pattern", text: `ไม่มีรูปแบบคืน ${k}` });
  const isR = (k) => (routine.nights?.[k]?.ids || []).some((id) => get(id) && leave(get(id)) && has(get(id), "retinoid"));
  const isA = (k) => (routine.nights?.[k]?.ids || []).some((id) => get(id) && leave(get(id)) && isAcid(get(id)));
  for (let i = 0; i < p.length && p.length > 1; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (isR(a) && isR(b)) { issues.push({ level: "warn", where: "pattern", text: "เรตินอยด์ 2 คืนติดกัน — คั่นด้วยคืนพักผิว" }); break; }
  }
  return issues;
}

/* ───────── routine → schedule (same shape as an imported Excel) ───────── */

function cycleLength(p) {
  for (const L of [30, 28, 24, 32, 35, 36, 42]) if (L % p === 0) return L;
  return p * Math.ceil(28 / p);
}

export function buildScheduleFromRoutine(routine, products, { title = "รูทีนจากชั้นวาง" } = {}) {
  const byId = Object.fromEntries(products.map((p) => [String(p.id), p]));
  // step names must be unique, because steps are matched back to products by name
  const seen = new Map();
  const nameOf = {};
  for (const p of products) {
    let n = p.name.trim();
    if (seen.has(n.toLowerCase()) && p.brand) n = `${n} (${p.brand})`;
    let k = 2;
    const base = n;
    while (seen.has(n.toLowerCase())) n = `${base} #${k++}`;
    seen.set(n.toLowerCase(), true);
    nameOf[String(p.id)] = n;
  }
  const names = (ids) => (ids || []).map(String).filter((id) => byId[id]).map((id) => nameOf[id]);
  const used = new Set([...(routine.am || []), ...Object.values(routine.nights || {}).flatMap((n) => n.ids || [])].map(String));
  const amSet = new Set((routine.am || []).map(String));

  const pattern = routine.pattern?.length ? routine.pattern : ["C"];
  const L = cycleLength(pattern.length);
  const days = [];
  for (let n = 1; n <= L; n++) {
    const t = pattern[(n - 1) % pattern.length];
    const night = routine.nights?.[t] || { label: "", ids: [] };
    days.push({ n, label: `วัน ${n}`, am: names(routine.am), pm: names(night.ids), type: t, typeLabel: night.label || "", note: "" });
  }
  const nightTypes = {};
  for (const [k, n] of Object.entries(routine.nights || {})) if (pattern.includes(k)) nightTypes[k] = { label: n.label, cells: names(n.ids) };
  const prods = products
    .filter((p) => used.has(String(p.id)))
    .map((p) => ({
      id: String(p.id),
      name: nameOf[String(p.id)],
      brand: p.brand || "",
      category: CATEGORIES[p.category]?.label || "",
      cat: p.category,
      howto: p.howto || defaultHowto(p.category),
      slot: amSet.has(String(p.id)) ? "am" : "pm",
      actives: p.actives || [],
      image: p.image_url || null,
      icon: p.icon || null,
      color: p.color || null,
    }));
  const tips = (routine.notes || []).map((n) => ({ topic: n.level === "warn" ? "ระวัง" : "คำแนะนำ", advice: n.text, reason: "" }));
  return {
    v: 1,
    source: "shelf",
    title,
    subtitle: `วนทุก ${pattern.length} คืน`,
    suggestedStart: null,
    days,
    products: prods,
    nightTypes,
    tips,
    routine: { am: (routine.am || []).map(String), nights: routine.nights, pattern, level: routine.level || "normal" },
  };
}

export const activeLabel = (k) => ACTIVES[k]?.label || k;
