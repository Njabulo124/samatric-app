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
function evaluateGroup(group, marks) {
  let best = null; // the option the learner is nearest to meeting
  for (const opt of group.options) {
    if (!(opt.subject in marks)) continue;
    const shortfall = Math.max(0, opt.minPercent - marks[opt.subject]);
    if (shortfall === 0) return { passed: true };
    if (!best || shortfall < best.shortfall) {
      best = { subject: opt.subject, need: opt.minPercent, has: marks[opt.subject], shortfall };
    }
  }
  return { passed: false, best }; // best === null: learner has none of the subjects
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
    if (!result.best) {
      blocked = true;
      gaps.missing.push(group.description);
      const opts = group.options.map((o) => `${o.subject} ${o.minPercent}%`).join(' or ');
      reasons.push(`Requires ${group.description}: ${opts}.`);
    } else {
      const { subject, need, has, shortfall } = result.best;
      gaps.subjects.push({ group: group.description, subject, need, has, shortfall });
      reasons.push(`${subject}: ${has}% is below the required ${need}% (need ${shortfall}% more).`);
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

const STATUS_ORDER = { qualifies: 0, check: 1, close: 2, not_eligible: 3 };

/**
 * Evaluate all courses. `rules` maps universityShortName -> APS rule (see aps.js).
 * Returns { apsByUniversity, results }, results sorted: qualifies, check, close, not eligible.
 */
export function evaluateAll(courses, rules, marks) {
  const apsByUniversity = {};
  for (const [uni, rule] of Object.entries(rules)) apsByUniversity[uni] = computeAps(marks, rule);

  const results = courses
    .filter((c) => apsByUniversity[c.universityShortName])
    .map((c) => evaluateCourse(c, marks, apsByUniversity[c.universityShortName].aps))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.university.localeCompare(b.university) ||
        a.name.localeCompare(b.name),
    );

  return { apsByUniversity, results };
}
