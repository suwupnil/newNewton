/**
 * Pairing a subject with its practical component.
 *
 * The portal lists theory and lab as separate courses — "ADA - B" alongside
 * "ADA Lab 2 - B" — so a combined attendance figure only exists once those are
 * recognised as one subject. This module does that purely from the course
 * names, with a user-supplied override map as the escape hatch.
 *
 * Different batches name the practical component differently ("Lab",
 * "Practical", "Tutorial", …), so the marker list is broad. Breadth alone would
 * be dangerous — a genuine standalone subject called "AI Studio" must not be
 * swallowed into a subject called "AI" — so stripping a marker is only allowed
 * when the resulting base actually matches another course in the same
 * semester. See `groupUnits`.
 *
 * Pure and dependency-free, so it runs under `node --test`.
 */

// "…  - B", "… – B2", "… - 1". The section token is alphanumeric, which is what
// stops a subject like "Data Structures - Advanced - B" from splitting on the
// first hyphen instead of the last.
const SECTION_RE = /^(.*?)\s*[-–—]\s*([A-Za-z0-9]+)\s*$/;

// Names for a subject's practical component, anchored to the end of the name so
// a subject that merely contains the word (e.g. "Lab Techniques") is not
// mistaken for one. An optional trailing number covers "Lab 2".
const PRACTICAL_RE =
  /^(.*?)\s*[-–—:]?\s*\b(Labs?|Practicals?|Pracs?|Tutorials?|Tuts?|Workshops?|Recitations?|Seminars?|Studios?|Discussions?)\b\s*(\d*)\s*$/i;

/**
 * @typedef {object} ParsedName
 * @property {string} base        subject with marker and section removed, e.g. "ADA"
 * @property {string} key         join key for `base`
 * @property {string} plainBase   subject with only the section removed, e.g. "ADA Lab 2"
 * @property {string} plainKey    join key for `plainBase`
 * @property {string|null} section
 * @property {boolean} isPractical whether a practical marker was found at the end
 * @property {string|null} marker  the marker word as written, e.g. "Lab"
 * @property {number|null} index   the marker's number, e.g. 2
 */

/**
 * Split a portal course name into subject, section and practical parts.
 *
 * "ADA Lab 2 - B" -> base "ADA",       plainBase "ADA Lab 2", isPractical true
 * "Maths III - B" -> base "Maths III", plainBase "Maths III", isPractical false
 *
 * Note this reports only what the *name* looks like. Whether the marker is
 * actually stripped is decided by `groupUnits`, which can see the other courses.
 *
 * @param {string} name
 * @returns {ParsedName}
 */
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
  // A name that is *only* a marker ("Lab 2 - B") has no subject to key on, so
  // leave it alone rather than collapsing it to an empty key.
  if (practicalMatch && practicalMatch[1].trim()) {
    base = practicalMatch[1].trim();
    isPractical = true;
    marker = practicalMatch[2];
    index = practicalMatch[3] ? Number(practicalMatch[3]) : null;
  }

  return {
    base,
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

/**
 * Group portal courses into subjects.
 *
 * A practical marker is stripped only when doing so lands on something that
 * exists elsewhere in the same semester — either a course with that exact name
 * ("ADA - B" for "ADA Lab 2 - B"), or another practical that reduces to the
 * same base ("ADA Lab 1" and "ADA Lab 2" with no plain "ADA"). Anything else
 * keeps its full name and stands as its own subject, so a course that merely
 * ends in a marker-like word is never absorbed into an unrelated one.
 *
 * A subject with no practical component is simply a group of one.
 *
 * Overrides win over all of it, so a naming scheme this cannot infer can be
 * corrected by hand rather than silently producing a misleading percentage.
 *
 * @param {Array<{ name: string, courseHash?: string, held: number, attended: number }>} units
 * @param {Record<string, string>} [overrides] course name -> group key
 * @returns {Array<{ key: string, label: string, units: object[] }>} stable order: first appearance
 */
export function groupUnits(units, overrides = {}) {
  const list = (units ?? []).filter((unit) => normalizeKey(unit?.name));
  const parsed = list.map((unit) => parseCourseName(unit.name));

  const normalizedOverrides = new Map(
    Object.entries(overrides ?? {}).map(([name, key]) => [
      normalizeKey(name),
      normalizeKey(key),
    ])
  );

  // What a stripped marker could legitimately attach to.
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

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: stripIsSafe ? p.base : p.plainBase,
        units: [],
      });
    }
    const group = groups.get(key);
    // Prefer a non-practical course's name as the subject label — it is the one
    // without the "Lab 2" noise.
    if (!p.isPractical && p.plainBase) group.label = p.plainBase;
    group.units.push({ ...unit, parsed: p });
  });

  return [...groups.values()];
}

/**
 * Which component of a subject a unit is: "Lecture" for the theory course, or
 * the practical marker as the portal wrote it ("Lab", "Tutorial", …).
 * @param {{ parsed?: ParsedName }} unit
 */
export function componentLabel(unit) {
  const parsed = unit?.parsed;
  if (!parsed) return 'Class';
  if (!parsed.isPractical) return 'Lecture';
  const word = parsed.marker || 'Lab';
  // Title-case the marker so "lab" and "LAB" both read as "Lab".
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
