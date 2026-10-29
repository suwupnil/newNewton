/**
 * Pairing a subject with its practical component.
 * Powered by Zero-Overhead Codegen (`../generated-specs.js`).
 */

import { ATTENDANCE_SPEC, shortenCourseName } from '../generated-specs.js';

const SECTION_STRIP_PATTERN =
  ATTENDANCE_SPEC?.grouping?.sectionStripRegex ||
  ATTENDANCE_SPEC?.sectionStripRegex ||
  '^(.*?)\\s*[-–—]\\s*([A-Za-z0-9]+)$';

const PRACTICAL_MARKERS_LIST =
  ATTENDANCE_SPEC?.grouping?.practicalMarkers ||
  ATTENDANCE_SPEC?.practicalMarkers ||
  ['Lab', 'Labs', 'Practical', 'Practicals', 'Tutorial', 'Tutorials', 'Workshop', 'Workshops'];

const SECTION_RE = new RegExp(SECTION_STRIP_PATTERN);
const PRACTICAL_RE = new RegExp(
  `^(.*?)\\s*[-–—:]?\\s*\\b(${PRACTICAL_MARKERS_LIST.join('|')})\\b\\s*(\\d*)\\s*$`,
  'i'
);

export function parseCourseName(name) {
  const raw = String(name ?? '').trim();

  let plainBase = raw;
  let section = null;
  const sectionMatch = raw.match(SECTION_RE);
  if (sectionMatch) {
    plainBase = sectionMatch[1].trim();
    section = sectionMatch[2];
  }

  let base = plainBase;
  let isPractical = false;
  let marker = null;
  let index = null;
  const practicalMatch = plainBase.match(PRACTICAL_RE);
  if (practicalMatch && practicalMatch[1].trim()) {
    base = practicalMatch[1].trim();
    isPractical = true;
    marker = practicalMatch[2];
    index = practicalMatch[3] ? Number(practicalMatch[3]) : null;
  }

  return {
    base,
    shortLabel: shortenCourseName(base),
    key: normalizeKey(base),
    plainBase,
    plainKey: normalizeKey(plainBase),
    section,
    isPractical,
    marker,
    index,
  };
}

/** Case- and whitespace-insensitive join key. */
export function normalizeKey(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function groupUnits(units, overrides = {}) {
  const list = (units ?? []).filter((unit) => normalizeKey(unit?.name));
  const parsed = list.map((unit) => parseCourseName(unit.name));

  const normalizedOverrides = new Map(
    Object.entries(overrides ?? {}).map(([name, key]) => [
      normalizeKey(name),
      normalizeKey(key),
    ])
  );

  const plainKeys = new Set(parsed.map((p) => p.plainKey));
  const strippedCounts = new Map();
  for (const p of parsed) {
    if (!p.isPractical) continue;
    strippedCounts.set(p.key, (strippedCounts.get(p.key) ?? 0) + 1);
  }

  const groups = new Map();

  list.forEach((unit, i) => {
    const p = parsed[i];
    const stripIsSafe =
      p.isPractical &&
      (plainKeys.has(p.key) || (strippedCounts.get(p.key) ?? 0) > 1);

    const override = normalizedOverrides.get(normalizeKey(unit.name));
    const key = override || (stripIsSafe ? p.key : p.plainKey);
    if (!key) return;

    const fullLabel = stripIsSafe ? p.base : p.plainBase;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: fullLabel,
        shortLabel: shortenCourseName(fullLabel),
        units: [],
      });
    }
    const group = groups.get(key);
    if (!p.isPractical && p.plainBase) {
      group.label = p.plainBase;
      group.shortLabel = shortenCourseName(p.plainBase);
    }
    group.units.push({ ...unit, parsed: p });
  });

  return [...groups.values()];
}

export function componentLabel(unit) {
  const parsed = unit?.parsed;
  if (!parsed) return 'Class';
  if (!parsed.isPractical) return 'Lecture';
  const word = parsed.marker || 'Lab';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
