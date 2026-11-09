import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, initial, makePlan, prompt } from "../lib/liveness.js";

const F = (o = {}) => ({ luma: 120, face: { width: 0.5, cx: 0.5, cy: 0.5, luma: 120, yaw: 0, pitchZ: 0.1, blink: 0.05, ...o } });
const run = (st, frames) => frames.reduce((s, f) => advance(s, f), st);

test("plan: 3 different moves then a blink", () => {
  const p = makePlan(3);
  assert.equal(p.length, 4);
  assert.equal(p[3], "blink");
  assert.equal(new Set(p.slice(0, 3)).size, 3);
});

test("passes when the moves are followed", () => {
  let s = initial(["left", "up", "down", "blink"]);
  s = run(s, [F(), F(), F()]);
  assert.equal(s.step, 0);
  assert.equal(prompt(s), "หันหน้าไปทางซ้าย");
  s = run(s, [F({ yaw: -25 }), F({ yaw: -25 })]); // wrong way does nothing
  assert.equal(s.step, 0);
  s = run(s, [F({ yaw: 25 }), F({ yaw: 25 })]);
  assert.equal(s.step, 1);
  s = run(s, [F({ pitchZ: 0.3 }), F({ pitchZ: 0.3 })]);
  assert.equal(s.step, 2);
  s = run(s, [F({ pitchZ: -0.1 }), F({ pitchZ: -0.1 })]);
  assert.equal(s.step, 3);
  s = run(s, [F({ blink: 0.9 })]); // closed eyes without seeing them open first doesn't count…
  s = run(s, [F({ blink: 0.05 }), F({ blink: 0.9 })]);
  assert.equal(s.done, true);
});

test("a still photo never gets past the first move", () => {
  let s = initial(makePlan(3));
  s = run(s, Array(40).fill(F()));
  assert.equal(s.step, 0);
  assert.equal(s.done, false);
});

test("darkness pauses, losing the face restarts", () => {
  let s = initial(["left", "right", "up", "blink"]);
  s = run(s, [F({ luma: 40 }), F({ luma: 40 }), F({ luma: 40 })]);
  assert.equal(s.step, -1);
  s = run(s, [F(), F(), F(), F({ yaw: 30 }), F({ yaw: 30 })]);
  assert.equal(s.step, 1);
  s = run(s, Array(6).fill({ luma: 100, face: null }));
  assert.equal(s.step, -1);
  assert.ok(s.failed);
});
