import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeProduct, detectActives, guessCategory } from "../lib/ingredients.js";
import { proposeRoutine, checkRoutine, buildScheduleFromRoutine } from "../lib/routineEngine.js";
import * as C from "../lib/core.js";

let id = 0;
const P = (name, extra = {}) => {
  const p = { id: String(++id), name, brand: "", ...extra };
  return { ...p, ...analyzeProduct(p) };
};

test("detect categories + actives (Thai/English)", () => {
  assert.equal(guessCategory("CeraVe Foaming Cleanser"), "cleanser");
  assert.equal(guessCategory("โฟมล้างหน้า สูตรอ่อนโยน"), "cleanser");
  assert.equal(guessCategory("Paula's Choice 2% BHA Liquid Exfoliant"), "exfoliant");
  assert.equal(guessCategory("COSRX AHA/BHA Clarifying Treatment Toner"), "exfoliant");
  assert.equal(guessCategory("Anessa Perfect UV Sunscreen Skincare Milk SPF50+"), "sunscreen");
  assert.equal(guessCategory("กันแดด Biore"), "sunscreen");
  assert.equal(guessCategory("Niacinamide 10% + Zinc 1%"), "other");
  assert.equal(guessCategory("The Ordinary Niacinamide Serum"), "serum");
  assert.equal(guessCategory("Hada Labo Gokujyun Lotion"), "moisturizer");
  assert.equal(guessCategory("Laneige Water Sleeping Mask"), "sleeping");
  assert.equal(guessCategory("Differin gel"), "treatment");
  assert.deepEqual(detectActives("Granactive Retinoid 2% Emulsion"), ["retinoid"]);
  assert.deepEqual(detectActives("Vitamin C 15% + Ferulic"), ["vitc"]);
  assert.ok(detectActives("เซรั่มไนอะซินาไมด์").includes("niacinamide"));
  assert.ok(detectActives("Ingredients: water, salicylic acid, glycerin").includes("bha"));
  // the generic word "Lotion" alone must not make an acid
  assert.deepEqual(detectActives("Hada Labo Lotion"), []);
  const d = P("Differin Adapalene Gel 0.1%");
  assert.ok(d.actives.includes("retinoid"));
});

const shelf = () => {
  id = 0;
  return {
    gentle: P("CeraVe Hydrating Cleanser"),
    sa: P("CeraVe SA Smoothing Cleanser", { ingredients: "salicylic acid" }),
    bha: P("Paula's Choice 2% BHA Liquid Exfoliant"),
    aha: P("The Ordinary Glycolic Acid 7% Toning Solution"),
    ret: P("The Ordinary Retinol 0.5% in Squalane"),
    ret2: P("Differin Adapalene Gel"),
    vitc: P("Vitamin C Serum 15%"),
    nia: P("Niacinamide Serum"),
    gel: P("Hydro Boost Water Gel"),
    cream: P("Barrier Repair Cream"),
    spf: P("Biore UV Aqua Rich SPF50"),
    mask: P("Clay Mask"),
  };
};

test("propose: one retinoid, one acid, never together; vit C in the morning; SPF last", () => {
  const s = shelf();
  const products = Object.values(s);
  const { routine, unused, notes } = proposeRoutine(products);
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const names = (ids) => ids.map((i) => byId[i].name);

  // AM
  const am = names(routine.am);
  assert.equal(am[0], s.gentle.name);
  assert.equal(am.at(-1), s.spf.name);
  assert.ok(am.includes(s.vitc.name));
  assert.ok(!am.includes(s.ret.name) && !am.includes(s.bha.name));
  assert.ok(am.includes(s.gel.name), "lighter moisturizer in the morning");

  // nights
  assert.deepEqual(Object.keys(routine.nights).sort(), ["A", "B", "C"]);
  assert.deepEqual(routine.pattern, ["A", "B", "C", "C"]);
  const A = names(routine.nights.A.ids), B = names(routine.nights.B.ids), Cn = names(routine.nights.C.ids);
  assert.ok(A.includes(s.bha.name) && !A.includes(s.ret.name));
  assert.ok(B.includes(s.ret.name) && !B.includes(s.bha.name));
  assert.equal(B[0], s.gentle.name, "gentle cleanser on retinoid nights");
  assert.equal(A[0], s.sa.name, "acid wash on exfoliating nights");
  assert.ok(!Cn.includes(s.ret.name) && !Cn.includes(s.bha.name));
  assert.ok(Cn.includes(s.mask.name));
  assert.ok(B.includes(s.cream.name), "richer cream at night");
  // ordering thin → thick
  assert.ok(B.indexOf(s.nia.name) < B.indexOf(s.cream.name));

  // duplicates set aside with a reason
  const un = Object.fromEntries(unused.map((u) => [byId[u.id].name, u.reason]));
  assert.ok(un[s.ret2.name].includes("เรตินอยด์"));
  assert.ok(un[s.aha.name].includes("กรด"));
  assert.ok(notes.some((n) => n.text.includes("เม็ดถั่ว")));

  // the proposal passes its own checks and the schedule validator
  assert.equal(checkRoutine(routine, byId).filter((i) => i.level === "error").length, 0);
  const sched = buildScheduleFromRoutine(routine, products);
  assert.equal(sched.days.length, 28);
  const issues = C.validateSchedule(sched).filter((i) => i.level !== "info");
  assert.deepEqual(issues, []);
});

test("schedule from routine: steps keep product info and flags", () => {
  const s = shelf();
  const products = Object.values(s).map((p) => (p === s.spf ? { ...p, image_url: "https://x/y.jpg", color: "#f00" } : p));
  const { routine } = proposeRoutine(products);
  const sched = buildScheduleFromRoutine(routine, products);
  const bDay = sched.days.find((d) => d.type === "B").n;
  const steps = C.routineFor(sched, bDay, "pm");
  assert.ok(steps.some((x) => x.flags.retinol));
  const am = C.routineFor(sched, 1, "am");
  const spf = am.at(-1);
  assert.equal(spf.flags.sunscreen, true);
  assert.equal(spf.image, "https://x/y.jpg");
  assert.equal(spf.cat, "sunscreen");
  // retinoid nights never next to each other across the wrap
  const types = sched.days.map((d) => d.type);
  for (let i = 0; i < types.length; i++) assert.ok(!(types[i] === "B" && types[(i + 1) % types.length] === "B"));
});

test("gentle level spaces actives out; plain shelf → one night type", () => {
  const s = shelf();
  const g = proposeRoutine([s.gentle, s.ret, s.cream, s.spf], { level: "gentle" });
  assert.deepEqual(g.routine.pattern, ["B", "C", "C"]);
  const sched = buildScheduleFromRoutine(g.routine, [s.gentle, s.ret, s.cream, s.spf]);
  assert.equal(sched.days.length, 30);
  const plain = proposeRoutine([s.gentle, s.cream]);
  assert.deepEqual(plain.routine.pattern, ["C"]);
  assert.equal(plain.routine.nights.C.label, "ก่อนนอน");
  assert.ok(plain.notes.some((n) => n.text.includes("กันแดด")));
});

test("checkRoutine flags user mistakes", () => {
  const s = shelf();
  const byId = Object.fromEntries(Object.values(s).map((p) => [p.id, p]));
  const r = {
    am: [s.spf.id, s.ret.id, s.gentle.id],
    nights: { A: { label: "x", ids: [s.gentle.id, s.bha.id, s.ret.id, s.ret2.id] }, B: { label: "y", ids: [s.gentle.id, s.ret.id] } },
    pattern: ["A", "B", "B", "Z"],
  };
  const t = checkRoutine(r, byId).map((i) => `${i.level}:${i.where}:${i.text}`);
  const hit = (re) => assert.ok(t.some((x) => re.test(x)), `${re} not in\n${t.join("\n")}`);
  hit(/^error:am:.*กลางคืน/);
  hit(/^warn:am:.*ขั้นสุดท้าย/);
  hit(/^warn:am:ล้างหน้าควรเป็นขั้นแรก/);
  hit(/^error:A:เรตินอยด์ซ้ำ/);
  hit(/^error:A:.*กรด.*เรตินอยด์/);
  hit(/^error:pattern:ไม่มีรูปแบบคืน Z/);
  hit(/^warn:pattern:เรตินอยด์ 2 คืนติดกัน/);
});

test("only an acid cleanser: none on retinoid nights, with a note", () => {
  const s = shelf();
  const list = [s.sa, s.ret, s.cream, s.spf];
  const { routine, notes } = proposeRoutine(list);
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  assert.ok(!routine.nights.B.ids.includes(s.sa.id));
  assert.ok(notes.some((n) => n.text.includes("น้ำเปล่า")));
  assert.equal(C.validateSchedule(buildScheduleFromRoutine(routine, list)).filter((i) => i.level === "error").length, 0);
  assert.equal(checkRoutine(routine, byId).filter((i) => i.level === "error").length, 0);
});

test("duplicate product names stay distinct steps", () => {
  id = 0;
  const a = P("Serum", { brand: "A" }), b = P("Serum", { brand: "B" });
  const sched = buildScheduleFromRoutine({ am: [a.id, b.id], nights: { C: { label: "x", ids: [a.id] } }, pattern: ["C"] }, [a, b]);
  assert.deepEqual(sched.days[0].am, ["Serum", "Serum (B)"]);
  assert.equal(C.findProduct("Serum (B)", sched).brand, "B");
});

test("Excel template round-trips through the importer", async () => {
  const { templateSheets, xlsxParts } = await import("../lib/template.js");
  const { makeZip } = await import("../lib/zip.ts");
  const { readXlsx } = await import("../lib/xlsx.js");
  const blob = await makeZip(xlsxParts(templateSheets()));
  const sheets = await readXlsx(new Uint8Array(await blob.arrayBuffer()));
  const s = C.buildSchedule(sheets);
  assert.equal(s.days.length, 30);
  assert.equal(s.days[0].type, "A");
  assert.deepEqual(s.days[0].am, ["คลีนเซอร์", "เซรั่ม", "มอยส์เจอร์ไรเซอร์", "กันแดด"]);
  assert.equal(s.products.length, 6);
  assert.equal(s.title, "ตารางสกินแคร์ของฉัน");
  assert.equal(C.validateSchedule(s).filter((i) => i.level === "error").length, 0);
});

test("buffer acids in an ingredient list don't make an exfoliant", () => {
  const a = analyzeProduct({ name: "Moisturizing Cream", ingredients: "Aqua, Glycerin, Ceramide NP, Lactic Acid, Citric Acid, Sodium Lactate" });
  assert.equal(a.category, "moisturizer");
  assert.ok(!a.actives.includes("aha"));
  const b = analyzeProduct({ name: "Blemish Control Cleanser", ingredients: "Aqua, Salicylic Acid, Niacinamide, Lactic Acid" });
  assert.equal(b.category, "cleanser");
  assert.ok(b.actives.includes("bha") && !b.actives.includes("aha"));
  assert.ok(analyzeProduct({ name: "Lactic Acid 10% + HA" }).actives.includes("aha"));
});
