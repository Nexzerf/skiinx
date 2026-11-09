// Liveness check before taking skin photos (like banking apps): look straight, then follow a few
// random head moves and blink. A printed photo or a still screen can't follow random moves or
// blink, so this proves a real face is in front of the camera. Pure logic, fed with readings from
// readFrame() (lib/skinAnalysis.ts), so it can be unit-tested.

/** @typedef {"left"|"right"|"up"|"down"|"blink"} Move */

export const MOVE_TEXT = {
  left: "หันหน้าไปทางซ้าย",
  right: "หันหน้าไปทางขวา",
  up: "เงยหน้าขึ้น",
  down: "ก้มหน้าลง",
  blink: "กะพริบตา",
};

const YAW_DEG = 18; // head turn needed
const PITCH_Z = 0.12; // change in forehead–chin depth (÷ face width) for up / down
const HOLD = 2; // consecutive readings that must pass (~0.25 s each)
const BASELINE_FRAMES = 3;
const LOST_LIMIT = 6; // readings without a face (~1.5 s) → start over (someone may have swapped in a photo)

/** Pick `n` different head moves in random order, then a blink. */
export function makePlan(n = 3, rand = Math.random) {
  const moves = ["left", "right", "up", "down"];
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  return [...moves.slice(0, n), "blink"];
}

export function initial(plan) {
  return { plan, step: -1, hold: 0, lost: 0, base: [], pitch0: null, eyesOpen: false, done: false, failed: null };
}

/** Did this face reading perform `move`, relative to the straight-ahead baseline? */
export function performed(move, face, pitch0, eyesOpen) {
  if (move === "left") return face.yaw > YAW_DEG;
  if (move === "right") return face.yaw < -YAW_DEG;
  if (move === "up") return pitch0 != null && face.pitchZ - pitch0 > PITCH_Z;
  if (move === "down") return pitch0 != null && pitch0 - face.pitchZ > PITCH_Z;
  if (move === "blink") return eyesOpen && face.blink != null && face.blink > 0.5;
  return false;
}

export const DARK = 85; // face brightness (0-255) below which nothing counts

/**
 * Advance the check with one reading from readFrame(). Progress pauses while the face is too dark.
 * Step -1 = collecting the straight-ahead baseline. Returns the new state (never mutates).
 */
export function advance(st, reading) {
  if (st.done) return st;
  const face = reading?.face;
  if (!face) {
    const lost = st.lost + 1;
    // lost the face mid-check → start over with a fresh order
    if (lost >= LOST_LIMIT && st.step >= 0) return { ...initial(st.plan), failed: "ไม่เห็นใบหน้า — เริ่มใหม่" };
    return { ...st, lost, hold: 0 };
  }
  const s = { ...st, lost: 0, failed: null };
  if (s.step === -1) {
    if (face.luma < DARK || Math.abs(face.yaw) > 10 || face.width < 0.3) return { ...s, base: [], hold: 0 };
    const base = [...s.base, face.pitchZ];
    if (base.length < BASELINE_FRAMES) return { ...s, base };
    return { ...s, base, pitch0: base.reduce((a, b) => a + b, 0) / base.length, step: 0, hold: 0, eyesOpen: false };
  }
  const move = s.plan[s.step];
  if (move === "blink" && face.blink != null && face.blink < 0.25) s.eyesOpen = true; // need open → closed
  if (face.luma < DARK) return { ...s, hold: 0 };
  if (performed(move, face, s.pitch0, s.eyesOpen)) {
    const hold = s.hold + 1;
    if (hold < (move === "blink" ? 1 : HOLD)) return { ...s, hold };
    const step = s.step + 1;
    if (step >= s.plan.length) return { ...s, step, hold: 0, done: true };
    return { ...s, step, hold: 0, eyesOpen: false };
  }
  return { ...s, hold: 0 };
}

/** What to tell the user right now. */
export function prompt(st) {
  if (st.done) return "ยืนยันใบหน้าแล้ว ✓";
  if (st.step === -1) return "มองตรงที่กล้อง";
  return MOVE_TEXT[st.plan[st.step]];
}
