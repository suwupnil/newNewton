/**
 * Attendance arithmetic powered by Zero-Overhead Codegen (`../generated-specs.js`).
 */

import { ATTENDANCE_SPEC } from '../generated-specs.js';

export const DEFAULT_TARGET = ATTENDANCE_SPEC.defaultTarget;
const EPS = ATTENDANCE_SPEC.epsilon;

function assertTarget(target) {
  if (typeof target !== 'number' || !(target > 0) || !(target < 1)) {
    throw new RangeError(`target must be a fraction in (0, 1), got ${target}`);
  }
}

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function combine(units) {
  let attended = 0;
  let held = 0;
  for (const unit of units ?? []) {
    const unitHeld = toCount(unit?.held);
    attended += Math.min(toCount(unit?.attended), unitHeld);
    held += unitHeld;
  }
  return { attended, held };
}

export function percentage(attended, held) {
  if (held <= 0) return null;
  return attended / held;
}

export function skipsAffordable(attended, held, target = DEFAULT_TARGET) {
  assertTarget(target);
  if (held <= 0) return 0;
  return Math.max(0, Math.floor(attended / target + EPS) - held);
}

export function classesToRecover(attended, held, target = DEFAULT_TARGET) {
  assertTarget(target);
  if (held <= 0) return 0;
  const deficit = target * held - attended;
  if (deficit <= EPS) return 0;
  return Math.ceil(deficit / (1 - target) - EPS);
}

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
    skipsAffordable: skipsAffordable(attended, held, target),
    classesToRecover: classesToRecover(attended, held, target),
    projection,
  };
}
