/**
 * Course search: find courses by name across all universities, whether or not the learner
 * qualifies. Pure functions, no database access.
 *
 *   searchCourses(courses, { q, universities, qualificationType, faculty, limit, offset })
 *
 * Matching: every word in the query must match the start of a word in the course name,
 * faculty or university. Common abbreviations work both ways ("bcom" finds
 * "Bachelor of Commerce", "commerce" finds "BCom Accounting").
 */

/** Abbreviation -> words it stands for. Matched both ways. */
export const ALIASES = {
  ba: ['arts'],
  bcom: ['commerce'],
  bsc: ['science'],
  bed: ['education'],
  beng: ['engineering'],
  bengtech: ['engineering', 'technology'],
  llb: ['law'],
  bpharm: ['pharmacy'],
  it: ['information', 'technology'],
  ict: ['information', 'communication', 'technology'],
  hr: ['human', 'resource'],
  ems: ['economic', 'management', 'sciences'],
  fet: ['further', 'education', 'training'],
  dip: ['diploma'],
  cert: ['certificate'],
  ecp: ['extended'],
};

const STOP_WORDS = new Set(['of', 'in', 'and', 'the', 'for', 'with', 'to', 'a']);

/** Lowercase, drop accents and punctuation, split into words. */
export function tokenize(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w));
}

/** Words for one field, plus what any abbreviations in it stand for. */
function expand(words) {
  const out = new Set(words);
  for (const w of words) for (const a of ALIASES[w] ?? []) out.add(a);
  return [...out];
}

/** Per-course search index, cached per course (rebuilt if the university name changes). */
const indexCache = new WeakMap();
function indexFor(course, universityNames) {
  const uniName = universityNames[course.universityShortName] ?? '';
  let idx = indexCache.get(course);
  if (!idx || idx.uniName !== uniName) {
    idx = {
      uniName,
      name: expand(tokenize(course.name)),
      other: expand(tokenize([course.faculty, course.universityShortName, uniName].join(' '))),
    };
    indexCache.set(course, idx);
  }
  return idx;
}

/** Score one query word against one course. 0 = no match. */
function scoreWord(word, idx) {
  const inName = (w) => idx.name.some((t) => t.startsWith(w));
  const inOther = (w) => idx.other.some((t) => t.startsWith(w));
  let best = 0;
  if (idx.name.includes(word)) best = 3;
  else if (inName(word)) best = 2;
  else if (inOther(word)) best = 1;
  // An abbreviation also matches when ALL the words it stands for are there ("it" = information + technology).
  const alias = ALIASES[word];
  if (alias) {
    if (alias.every(inName)) best = Math.max(best, 3);
    else if (alias.every((w) => inName(w) || inOther(w))) best = Math.max(best, 1);
  }
  return best;
}

/**
 * Search courses. Returns { total, results } where results are the course objects (sorted by
 * relevance, then university, then normal before extended, then name). An empty query lists everything that passes the filters.
 */
export function searchCourses(courses, {
  q = '', universities, qualificationType, faculty, limit = 50, offset = 0, universityNames = {},
} = {}) {
  const words = tokenize(q);
  const unis = universities?.length ? new Set(universities) : null;

  const scored = [];
  for (const c of courses) {
    if (unis && !unis.has(c.universityShortName)) continue;
    if (qualificationType && c.qualificationType !== qualificationType) continue;
    if (faculty && c.faculty !== faculty) continue;

    let score = 0;
    if (words.length) {
      const idx = indexFor(c, universityNames);
      for (const w of words) {
        const s = scoreWord(w, idx);
        if (s === 0) { score = -1; break; }
        score += s;
      }
      if (score < 0) continue;
    }
    scored.push({ c, score });
  }

  scored.sort((a, b) =>
    b.score - a.score ||
    a.c.universityShortName.localeCompare(b.c.universityShortName) ||
    Number(Boolean(a.c.isExtended)) - Number(Boolean(b.c.isExtended)) ||
    a.c.name.localeCompare(b.c.name));

  return {
    total: scored.length,
    results: scored.slice(offset, offset + limit).map((s) => s.c),
  };
}

/** The list of faculties and qualification types, for search filters. */
export function searchFacets(courses) {
  const faculties = new Map();
  const types = new Set();
  for (const c of courses) {
    types.add(c.qualificationType);
    if (!c.faculty) continue;
    const key = `${c.universityShortName}|${c.faculty}`;
    if (!faculties.has(key)) faculties.set(key, { university: c.universityShortName, faculty: c.faculty });
  }
  return {
    qualificationTypes: [...types].filter(Boolean).sort(),
    faculties: [...faculties.values()].sort((a, b) =>
      a.university.localeCompare(b.university) || a.faculty.localeCompare(b.faculty)),
  };
}
