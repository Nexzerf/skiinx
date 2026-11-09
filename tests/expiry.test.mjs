import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, durationTh, expiryOf, expiryState, parseExpiry, parsePao } from "../lib/expiry.js";

test("addMonths clamps month ends", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-09", 12), "2027-11-09");
});

test("expiry = earlier of printed date and opened + PAO", () => {
  assert.deepEqual(expiryOf({ status: "opened", opened_at: "2026-01-10", pao_months: 6, expires_on: "2028-01-01" }), { date: "2026-07-10", by: "pao" });
  assert.deepEqual(expiryOf({ status: "opened", opened_at: "2026-01-10", pao_months: 12, expires_on: "2026-05-31" }), { date: "2026-05-31", by: "printed" });
  assert.deepEqual(expiryOf({ status: "unopened", opened_at: null, pao_months: 12, expires_on: "2027-01-31" }), { date: "2027-01-31", by: "printed" });
  assert.equal(expiryOf({ status: "unopened", pao_months: 12 }), null);
});

test("states", () => {
  const p = { status: "opened", opened_at: "2026-05-01", pao_months: 6 };
  assert.equal(expiryState(p, "2026-10-25").state, "soon");
  assert.equal(expiryState(p, "2026-11-02").state, "expired");
  assert.equal(expiryState(p, "2026-06-01").state, "ok");
  assert.equal(expiryState({ status: "empty" }, "2026-06-01").state, "empty");
});

test("durationTh", () => {
  assert.equal(durationTh("2026-06-27", "2026-11-09"), "4 เดือน 13 วัน");
  assert.equal(durationTh("2025-11-09", "2026-11-09"), "1 ปี");
  assert.equal(durationTh("2026-11-09", "2026-11-09"), "0 วัน");
});

test("parseExpiry", () => {
  assert.equal(parseExpiry("Batch 2311A EXP 05/2027"), "2027-05-31");
  assert.equal(parseExpiry("EXP: 2027.05.12"), "2027-05-12");
  assert.equal(parseExpiry("วันหมดอายุ 12/05/2570"), "2027-05-12");
  assert.equal(parseExpiry("EXP MAY 2028"), "2028-05-31");
  assert.equal(parseExpiry("Best before: 11-2027"), "2027-11-30");
  assert.equal(parseExpiry("EXP 2O27/O8"), "2027-08-31");
  assert.equal(parseExpiry("Made in Korea 50ml"), null);
});

test("parsePao", () => {
  assert.equal(parsePao("12M  Made in France"), 12);
  assert.equal(parsePao("open jar 6 M"), 6);
  assert.equal(parsePao("50ml 1.69 fl oz"), null);
  assert.equal(parsePao("SPF50 PA++++"), null);
});
