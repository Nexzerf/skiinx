import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readXlsx } from "../lib/xlsx.js";
import * as C from "../lib/core.js";

const B = process.env.B_XLSX || new URL("./fixtures/schedule-b.xlsx", import.meta.url);
const OLD = process.env.OLD_XLSX; // optional: the original (pre-B) file
const load = async (f) => C.buildSchedule(await readXlsx(await readFile(f)));
const wrap = (data) => [{ id: 1, start_date: "2026-11-10", data, created_at: "1" }];
const at = (d, t) => new Date(C.zonedToUtc(d, t, "Asia/Bangkok"));

test("1 parse both files", async () => {
  for (const f of [OLD, B].filter(Boolean)) {
    const s = await load(f);
    assert.equal(s.days.length, 30);
    assert.deepEqual(Object.keys(s.nightTypes), ["A", "B", "C"]);
    assert.equal(s.products.length, 17);
    assert.equal(s.tips.length, 5);
  }
});
test("2 validation: no error/warn; old file flags unused [B]", async () => {
  const b = C.validateSchedule(await load(B));
  assert.equal(b.filter((i) => i.level !== "info").length, 0);
  assert.equal(b.length, 0);
  if (OLD) {
    const o = C.validateSchedule(await load(OLD));
    assert.equal(o.filter((i) => i.level !== "info").length, 0);
    assert.ok(o.some((i) => i.msg.includes("[B]")));
  }
});
test("3 day 4 of B", async () => {
  const i = C.dayInfo("2026-11-13", wrap(await load(B)), {});
  assert.equal(i.n, 4); assert.equal(i.type, "B"); assert.equal(i.pmHasTimer, true);
  const mask = i.pm.find((s) => s.flags.retinol);
  assert.deepEqual(mask.timer, { min: 10, max: 15, kind: "hold" });
});
test("4 sunscreen match", async () => {
  const i = C.dayInfo("2026-11-13", wrap(await load(B)), {});
  const s = i.am.find((x) => x.name === "กันแดด Mist");
  assert.equal(s.product, "SKINTIFIC Sunscreen Mist SPF50+");
  assert.deepEqual(s.timer, { min: 15, max: 30, kind: "before" });
});
test("5 cycle wraps", async () => {
  assert.equal(C.dayInfo("2026-12-10", wrap(await load(B)), {}).n, 1);
});
test("6 sensitive mode swaps cleanser", async () => {
  const i = C.dayInfo("2026-11-11", wrap(await load(B)), { sensitiveUntil: "2026-11-30" });
  assert.equal(i.am[0].name, "SKINTIFIC Rose Cleanser"); assert.equal(i.am[0].swapped, true);
});
test("8 01:00 belongs to previous night", () => {
  assert.equal(C.logicalDate(at("2026-11-14", "01:00"), {}), "2026-11-13");
  assert.equal(C.logicalDate(at("2026-11-14", "04:00"), {}), "2026-11-14");
});
test("9 streak with freeze", () => {
  const checks = new Set(["2026-11-10|am", "2026-11-10|pm", "2026-11-12|am", "2026-11-12|pm", "2026-11-13|am", "2026-11-13|pm"]);
  const s = C.computeStreak("2026-11-14", checks, "2026-11-10", {});
  assert.equal(s.status["2026-11-11"], "frozen"); assert.equal(s.current, 3);
});
test("10 ics utc time", async () => {
  const ics = C.buildIcs({ schedules: wrap(await load(B)), settings: {}, from: "2026-11-13", days: 1 });
  assert.match(ics, /DTSTART:20261113T003000Z/);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
});
test("11/12 safety rules", async () => {
  const s = structuredClone(await load(B));
  s.days[1].pm = ["CeraVe SA Cleanser", "Provamed Retinol Gel"];
  s.days[3].pm = ["SKINTIFIC Rose Cleanser", "SKINTIFIC Retinol Mask", "Provamed Retinol Gel"];
  const errs = C.validateSchedule(s).filter((i) => i.level === "error");
  assert.ok(errs.some((e) => e.day === 2 && e.msg.includes("กรด")));
  assert.ok(errs.some((e) => e.day === 4 && e.msg.includes("ซ้ำซ้อน")));
});
test("7 B night 21:12 reminds", async () => {
  const r = C.planReminders({ now: at("2026-11-13", "21:12"), settings: {}, schedules: wrap(await load(B)), checks: new Set(), states: {} });
  assert.deepEqual(r.map((x) => [x.slot, x.attempt]), [["pm", 1]]);
});
test("8b 01:00 nag belongs to previous night", async () => {
  const r = C.planReminders({ now: at("2026-11-14", "01:00"), settings: {}, schedules: wrap(await load(B)), checks: new Set(), states: {} });
  assert.deepEqual(r.map((x) => [x.date, x.slot]), [["2026-11-13", "pm"]]);
});
test("13 checked → no reminder", async () => {
  const r = C.planReminders({ now: at("2026-11-13", "21:40"), settings: {}, schedules: wrap(await load(B)), checks: new Set(["2026-11-13|pm"]), states: {} });
  assert.equal(r.length, 0);
});
test("14 snooze + repeat interval", async () => {
  const sch = wrap(await load(B));
  const now = at("2026-11-13", "21:40");
  const snoozed = { "2026-11-13|pm": { sent_count: 1, last_sent: at("2026-11-13", "21:10"), snooze_until: at("2026-11-13", "21:50") } };
  assert.equal(C.planReminders({ now, settings: {}, schedules: sch, checks: new Set(), states: snoozed }).length, 0);
  const recent = { "2026-11-13|pm": { sent_count: 2, last_sent: at("2026-11-13", "21:30") } };
  assert.equal(C.planReminders({ now, settings: {}, schedules: sch, checks: new Set(), states: recent }).length, 0);
  const due = { "2026-11-13|pm": { sent_count: 2, last_sent: at("2026-11-13", "21:25") } };
  assert.equal(C.planReminders({ now, settings: {}, schedules: sch, checks: new Set(), states: due })[0].attempt, 3);
});
test("15 AM window stops at cutoff; normal night starts 21:30", async () => {
  const base = { settings: {}, schedules: wrap(await load(B)), checks: new Set(), states: {} };
  assert.deepEqual(C.planReminders({ ...base, now: at("2026-11-12", "07:31") }).map((r) => r.slot), ["am"]);
  assert.equal(C.planReminders({ ...base, now: at("2026-11-12", "13:05") }).length, 0);
  assert.equal(C.planReminders({ ...base, now: at("2026-11-12", "21:15") }).length, 0); // day 3 = [C], no timer
  assert.deepEqual(C.planReminders({ ...base, now: at("2026-11-12", "21:31") }).map((r) => r.slot), ["pm"]);
});
