/**
 * Attendance arithmetic.
 *
 * Every function here is pure and dependency-free so it can be unit-tested under
 * `node --test` without a browser. Nothing in this file touches the DOM, the
 * network, or chrome.* APIs.
 *
 * Targets are expressed as a fraction in (0, 1) — 0.75 for the usual 75% rule.
 */

export const DEFAULT_TARGET = 0.75;

// Percentages coming off a portal are rationals like 15/0.75 that can land a
// hair below an integer in binary floating point. Nudging by an epsilon before
// flooring/ceiling keeps "exactly at target" from reading as "just under".
const EPS = 1e-9;

/** @typedef {{ courseHash?: string, name?: string, held: number, attended: number }} Unit */

function assertTarget(target) {
  if (typeof target !== 'number' || !(target > 0) || !(target < 1)) {
    throw new RangeError(`target must be a fraction in (0, 1), got ${target}`);
  }
}

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Roll a subject's units (theory + lab + …) into a single attended/held pair.
 *
 * This sums raw class counts rather than averaging the units' percentages. The
 * two only agree when every unit has held the same number of classes, and a
 * subject with 30 lectures and 8 labs is the normal case, not the exception.
 *
 * @param {Unit[]} units
 * @returns {{ attended: number, held: number }}
 */
export function combine(units) {
  let attended = 0;
  let held = 0;
  for (const unit of units ?? []) {
    const unitHeld = toCount(unit?.held);
    // Attendance can never exceed the classes actually held; a portal glitch
    // that reported otherwise would silently inflate the roll-up.
    attended += Math.min(toCount(unit?.attended), unitHeld);
    held += unitHeld;
  }
  return { attended, held };
}

/**
 * Attendance as a fraction, or null when no classes have been held yet.
 * Null rather than 0 — "no data" and "attended nothing" are different states
 * and the UI must not show 0% for a subject that hasn't started.
 *
 * @returns {number | null}
 */
export function percentage(attended, held) {
  if (held <= 0) return null;
  return attended / held;
}

/**
 * How many classes can be missed from here and still finish at or above target.
 *
 *   attended / (held + k) >= target  <=>  held + k <= attended / target
 *
 * @returns {number} a non-negative integer
 */
export function skipsAffordable(attended, held, target = DEFAULT_TARGET) {
  assertTarget(target);
  if (held <= 0) return 0;
  return Math.max(0, Math.floor(attended / target + EPS) - held);
}

/**
 * How many classes must be attended consecutively to climb back to target.
 *
 *   (attended + k) / (held + k) >= target  <=>  k * (1 - target) >= target * held - attended
 *
 * Returns 0 when already at or above target.
 *
 * @returns {number} a non-negative integer
 */
export function classesToRecover(attended, held, target = DEFAULT_TARGET) {
  assertTarget(target);
  if (held <= 0) return 0;
  const deficit = target * held - attended;
  if (deficit <= EPS) return 0;
  return Math.ceil(deficit / (1 - target) - EPS);
}

/**
 * Fold the classes still on the timetable into the picture.
 *
 * `bestReachable` assumes perfect attendance from here. When that still falls
 * short of target, the target is arithmetically out of reach for the term and
 * the UI should say so instead of printing an encouraging recovery number the
 * student cannot actually act on.
 *
 * `skipsLeft` is the number that matters day to day: of the `remaining` classes
 * still scheduled, how many can be skipped and still land at target.
 *
 *   (attended + remaining - m) / (held + remaining) >= target
 *
 * @param {number} remaining classes still scheduled this term
 */
export function projectTerm(attended, held, remaining, target = DEFAULT_TARGET) {
  assertTarget(target);
  const r = toCount(remaining);
  const finalHeld = held + r;
  if (finalHeld <= 0) {
    return { remaining: r, bestReachable: null, reachable: true, skipsLeft: 0 };
  }
  const bestReachable = (attended + r) / finalHeld;
  const skipsLeft = Math.min(
    r,
    Math.max(0, Math.floor(attended + r - target * finalHeld + EPS))
  );
  return {
    remaining: r,
    bestReachable,
    reachable: bestReachable >= target - EPS,
    skipsLeft,
  };
}

/**
 * The complete per-subject verdict the UI renders.
 *
 * `headline` names which number to lead with, so the panel does not have to
 * re-derive the subject's situation from the raw fields:
 *   'no-data'     — nothing held yet
 *   'unreachable' — target cannot be met even with perfect attendance
 *   'recover'     — below target, but still recoverable
 *   'skips'       — at or above target
 *
 * @param {Unit[]} units
 * @param {{ target?: number, remaining?: number|null }} [options]
 */
export function summarize(units, { target = DEFAULT_TARGET, remaining = null } = {}) {
  assertTarget(target);
  const { attended, held } = combine(units);
  const pct = percentage(attended, held);
  const hasSchedule = remaining !== null && remaining !== undefined;
  const projection = hasSchedule
    ? projectTerm(attended, held, remaining, target)
    : null;

  const meetsTarget = pct !== null && pct >= target - EPS;
  let headline;
  if (pct === null) headline = 'no-data';
  else if (projection && !projection.reachable) headline = 'unreachable';
  else if (meetsTarget) headline = 'skips';
  else headline = 'recover';

  return {
    attended,
    held,
    percentage: pct,
    target,
    meetsTarget,
    headline,
    // Consecutive-miss budget, valid with or without schedule data.
    skipsAffordable: skipsAffordable(attended, held, target),
    classesToRecover: classesToRecover(attended, held, target),
    projection,
  };
}
