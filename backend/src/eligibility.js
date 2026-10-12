/**
 * Eligibility engine: which courses does a learner qualify for?
 *
 * Pure functions, no database access, so everything is unit-testable.
 *
 * Course shape (as returned by repository.js):
 *   { courseId, name, universityShortName, faculty, minAps, minApsMathsLit, minApsTechMaths,
 *     notes, requirements: [{ description, options: [{ subject, minPercent }] }] }
 *
 * Requirement groups are "AND of ORs": every group must pass; a group passes
 * if ANY one of its options is met.
 */
import { computeAps } from './aps.js';

export const MATHEMATICS = 'Mathematics';
export const MATHS_LIT = 'Mathematical Literacy';
export const TECH_MATHS = 'Technical Mathematics';

/** How near a learner must be to count as "close". Tunable. */
export const CLOSE_LIMITS = { apsPoints: 2, subjectPercent: 5 };

export const STATUS = {
  QUALIFIES: 'qualifies',
  CHECK: 'check', // meets everything we can check, but the prospectus leaves a gap
  CLOSE: 'close',
  NOT_ELIGIBLE: 'not_eligible',
};

/** Which maths subject the learner took (learners normally take exactly one). */
export function mathsType(marks) {
  return [MATHEMATICS, TECH_MATHS, MATHS_LIT].find((s) => s in marks) ?? null;
}

/** The APS threshold that applies to this learner's maths subject. */
function requiredAps(course, maths) {
  if (maths === MATHS_LIT) return course.minApsMathsLit;
  if (maths === TECH_MATHS) return course.minApsTechMaths;
  return course.minAps;
}

/** Evaluate one requirement group against the learner's marks. */
/**
 * Evaluate one requirement group. The group passes when at least `minCount` options are met
 * (default 1 = any one option). If it fails, `gaps` lists the cheapest way to pass: the
 * nearest unmet options the learner has, one per option still needed. `missing` means the
 * learner doesn't even take enough of the listed subjects.
 */
function evaluateGroup(group, marks) {
  const needed = group.minCount ?? 1;
  let met = 0;
  const near = [];
  for (const opt of group.options) {
    if (!(opt.subject in marks)) continue;
    const shortfall = Math.max(0, opt.minPercent - marks[opt.subject]);
    if (shortfall === 0) met += 1;
    else near.push({ subject: opt.subject, need: opt.minPercent, has: marks[opt.subject], shortfall });
  }
  if (met >= needed) return { passed: true };
  const stillNeeded = needed - met;
  near.sort((a, b) => a.shortfall - b.shortfall);
  if (near.length < stillNeeded) return { passed: false, missing: true, gaps: [] };
  return { passed: false, missing: false, gaps: near.slice(0, stillNeeded) };
}

/** Evaluate a single course for a learner whose APS (for that university) is known. */
export function evaluateCourse(course, marks, aps) {
  const maths = mathsType(marks);
  const reasons = [];
  const gaps = { aps: 0, subjects: [], missing: [] };
  let blocked = false; // can't be fixed by a few more marks (wrong or missing subject)
  let check = false;

  // 1. APS threshold for this maths subject
  const threshold = requiredAps(course, maths);
  if (threshold == null) {
    if (maths === MATHEMATICS || maths === null) {
      check = true;
      reasons.push('The prospectus does not state a minimum APS for this course; confirm with the university.');
    } else {
      blocked = true;
      reasons.push(`${maths} is not accepted for this course.`);
    }
  } else if (aps < threshold) {
    gaps.aps = threshold - aps;
    reasons.push(`APS ${aps} is below the required ${threshold} (need ${gaps.aps} more).`);
  }

  // 2. Subject requirements
  for (const group of course.requirements) {
    const result = evaluateGroup(group, marks);
    if (result.passed) continue;
    if (result.missing) {
      blocked = true;
      gaps.missing.push(group.description);
      const opts = group.options.map((o) => `${o.subject} ${o.minPercent}%`);
      const n = group.minCount ?? 1;
      reasons.push(n > 1
        ? `Requires ${group.description}: at least ${n} of ${opts.join(', ')}.`
        : `Requires ${group.description}: ${opts.join(' or ')}.`);
    } else {
      for (const { subject, need, has, shortfall } of result.gaps) {
        gaps.subjects.push({ group: group.description, subject, need, has, shortfall });
        reasons.push(`${subject}: ${has}% is below the required ${need}% (need ${shortfall}% more).`);
      }
    }
  }

  // 3. Status
  const meetsAll = !blocked && gaps.aps === 0 && gaps.subjects.length === 0;
  let status;
  if (meetsAll) {
    status = check ? STATUS.CHECK : STATUS.QUALIFIES;
  } else if (
    !blocked &&
    gaps.aps <= CLOSE_LIMITS.apsPoints &&
    gaps.subjects.every((g) => g.shortfall <= CLOSE_LIMITS.subjectPercent)
  ) {
    status = STATUS.CLOSE;
  } else {
    status = STATUS.NOT_ELIGIBLE;
  }

  return {
    courseId: course.courseId,
    name: course.name,
    university: course.universityShortName,
    faculty: course.faculty,
    qualificationType: course.qualificationType,
    isExtended: course.isExtended,
    status,
    aps,
    requiredAps: threshold,
    reasons,
    gaps,
    notes: course.notes,
  };
}

/**
 * The APS rule for one course. A course can override Life Orientation: includeLo === true means
 * LO is counted as an extra subject on top of the university's normal count (e.g. WSU B.Ed
 * Foundation Phase counts LO as a 7th subject). null/undefined = the university's rule as is.
 */
export function courseRule(rule, course) {
  if (course.includeLo !== true || rule.includeLo) return rule;
  return { ...rule, includeLo: true, subjectsCounted: rule.subjectsCounted + 1 };
}

const STATUS_ORDER = { qualifies: 0, check: 1, close: 2, not_eligible: 3 };

/**
 * Evaluate all courses. `rules` maps universityShortName -> APS rule (see aps.js).
 * apsByUniversity uses only the university's must-count subjects; each course's APS also
 * locks in that course's required subjects, so it can differ for learners with extra subjects.
 * Returns { apsByUniversity, results }, results sorted: qualifies, check, close, not eligible.
 */
export function evaluateAll(courses, rules, marks) {
  const apsByUniversity = {};
  for (const [uni, rule] of Object.entries(rules)) apsByUniversity[uni] = computeAps(marks, rule);

  const results = courses
    .filter((c) => rules[c.universityShortName])
    .map((c) => {
      const slots = c.requirements.map((g) => ({ subjects: g.options.map((o) => o.subject), count: g.minCount ?? 1 }));
      const { aps, counted } = computeAps(marks, courseRule(rules[c.universityShortName], c), slots);
      return { ...evaluateCourse(c, marks, aps), apsWorking: counted };
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.university.localeCompare(b.university) ||
        a.name.localeCompare(b.name),
    );

  return { apsByUniversity, results };
}
