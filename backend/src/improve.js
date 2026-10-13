/**
 * Improvement plans: what a learner would need to change to get into a course.
 * Pure functions, no database access.
 *
 *   improvePlan(course, rule, marks)
 *
 * The plan is the smallest set of mark increases we can find that meets every subject
 * minimum and the APS threshold:
 *   1. Raise each subject that is below a requirement up to that requirement
 *      (for "any 2 of" groups, the cheapest options).
 *   2. If the APS is still short, repeatedly raise the subject that gains the most APS
 *      for the fewest percent (each step moves one subject up to the next points band).
 *
 * Some gaps can't be fixed by better marks (a missing subject, or a maths type the course
 * doesn't accept). Those are returned as `blockers`.
 */
import { computeAps, LIFE_ORIENTATION } from './aps.js';
import {
  courseRule, evaluateCourse, evaluateGroup, mathsType, requiredAps, MATHEMATICS, MATHS_LIT, TECH_MATHS,
} from './eligibility.js';

const MAX_STEPS = 60;

function slotsFor(course) {
  return course.requirements.map((g) => ({ subjects: g.options.map((o) => o.subject), count: g.minCount ?? 1 }));
}

function apsFor(marks, rule, slots) {
  return computeAps(marks, rule, slots).aps;
}

/** The mark at the start of the next points band above `mark`, or null if already at the top. */
function nextBandStart(mark, bands, points) {
  const higher = bands.filter((b) => b.min > mark && Number(b.points) > points).map((b) => b.min);
  return higher.length ? Math.min(...higher) : null;
}

export function improvePlan(course, universityRule, marks) {
  const rule = courseRule(universityRule, course);
  const slots = slotsFor(course);
  const maths = mathsType(marks);
  const threshold = requiredAps(course, maths);

  const currentAps = apsFor(marks, rule, slots);
  const current = evaluateCourse(course, marks, currentAps);
  const blockers = [];

  // Maths type not accepted: better marks won't help.
  if (threshold == null && (maths === MATHS_LIT || maths === TECH_MATHS)) {
    const accepted = [MATHEMATICS, course.minApsMathsLit != null && MATHS_LIT, course.minApsTechMaths != null && TECH_MATHS]
      .filter(Boolean);
    blockers.push({
      type: 'maths_type',
      message: `This course does not accept ${maths}. It needs ${accepted.join(' or ')}.`,
    });
  }

  // 1. Subject minimums
  const target = { ...marks };
  const reasons = {}; // subject -> set of reasons
  const addReason = (subject, reason) => (reasons[subject] ??= new Set()).add(reason);

  for (const group of course.requirements) {
    const result = evaluateGroup(group, target);
    if (result.passed) continue;
    if (result.missing) {
      const n = group.minCount ?? 1;
      const opts = group.options.map((o) => o.subject);
      blockers.push({
        type: 'missing_subject',
        group: group.description,
        message: n > 1
          ? `You need at least ${n} of: ${opts.join(', ')}.`
          : `You need ${opts.length > 1 ? 'one of: ' + opts.join(', ') : opts[0]}.`,
      });
      continue;
    }
    for (const gap of result.gaps) {
      target[gap.subject] = gap.need;
      addReason(gap.subject, `${group.description} needs ${gap.need}%`);
    }
  }

  // 2. APS threshold
  let aps = apsFor(target, rule, slots);
  let apsReachable = true;
  if (threshold != null) {
    let steps = 0;
    while (aps < threshold && steps++ < MAX_STEPS) {
      let best = null;
      for (const [subject, mark] of Object.entries(target)) {
        if (subject === LIFE_ORIENTATION && !rule.includeLo) continue;
        const bands = rule.subjectBands?.[subject] ?? rule.defaultBands;
        const points = Number(bands.find((b) => mark >= b.min && mark <= b.max)?.points ?? 0);
        const next = nextBandStart(mark, bands, points);
        if (next == null) continue;
        const gain = apsFor({ ...target, [subject]: next }, rule, slots) - aps;
        if (gain <= 0) continue;
        const cost = next - mark;
        const better = !best || gain / cost > best.gain / best.cost ||
          (gain / cost === best.gain / best.cost && cost < best.cost);
        if (better) best = { subject, next, gain, cost };
      }
      if (!best) break;
      target[best.subject] = best.next;
      addReason(best.subject, 'raises your APS');
      aps += best.gain;
    }
    if (aps < threshold) apsReachable = false;
  }

  const changes = Object.keys(target)
    .filter((s) => target[s] !== marks[s])
    .map((subject) => ({
      subject,
      from: marks[subject],
      to: target[subject],
      increase: target[subject] - marks[subject],
      reasons: [...reasons[subject]],
    }))
    .sort((a, b) => b.increase - a.increase || a.subject.localeCompare(b.subject));

  const reachable = blockers.length === 0 && apsReachable;
  return {
    courseId: course.courseId,
    name: course.name,
    university: course.universityShortName,
    status: current.status,
    currentAps,
    requiredAps: threshold,
    targetAps: threshold == null ? null : aps,
    reachable,
    blockers,
    changes,
    totalIncrease: changes.reduce((sum, c) => sum + c.increase, 0),
    summary: summarize(current.status, reachable, blockers, changes, apsReachable),
  };
}

function summarize(status, reachable, blockers, changes, apsReachable) {
  if (status === 'qualifies') return 'You already meet the requirements for this course.';
  if (blockers.length) return blockers.map((b) => b.message).join(' ');
  if (!apsReachable) return 'Even with top marks in your current subjects, the APS for this course is out of reach.';
  if (!changes.length) return 'You meet everything we can check. Confirm the requirements with the university.';
  const parts = changes.map((c) => `${c.subject} by ${c.increase}% (to ${c.to}%)`);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return reachable ? `Raise ${list}.` : list;
}
