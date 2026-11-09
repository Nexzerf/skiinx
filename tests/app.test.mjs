// Extra checks for things added on top of the design's appendix tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readXlsx, unzip } from "../lib/xlsx.js";
import { makeZip } from "../lib/zip.ts";
import * as C from "../lib/core.js";

const B = new URL("./fixtures/schedule-b.xlsx", import.meta.url);
const load = async () => C.buildSchedule(await readXlsx(await readFile(B)));

test("suggestedStart comes from the date column", async () => {
  assert.equal((await load()).suggestedStart, "2026-11-10");
});

test("continue-at-same-day start date", () => {
  const start = C.startForCycleDay("2026-11-21", 12);
  assert.equal(C.cycleDay(start, "2026-11-21", 30), 12);
});

test("cycle round", () => {
  assert.equal(C.cycleRound("2026-11-10", "2026-11-10", 30), 1);
  assert.equal(C.cycleRound("2026-11-10", "2026-12-10", 30), 2);
});

test("backup zip round-trips through unzip()", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const blob = await makeZip([
    { name: "data.json", data: JSON.stringify({ hello: "สวัสดี" }) },
    { name: "photos/a.jpg", data: jpeg },
  ]);
  const files = await unzip(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(files["data.json"])), { hello: "สวัสดี" });
  assert.deepEqual([...files["photos/a.jpg"]], [...jpeg]);
});

test("newer schedule takes over from its start date; history keeps the old one", async () => {
  const data = await load();
  const rows = [
    { id: 1, start_date: "2026-11-10", data, created_at: "1" },
    { id: 2, start_date: "2026-11-20", data, created_at: "2" },
  ];
  assert.equal(C.scheduleFor("2026-11-19", rows).id, 1);
  assert.equal(C.scheduleFor("2026-11-20", rows).id, 2);
  assert.equal(C.dayInfo("2026-11-20", rows, {}).n, 1);
});

