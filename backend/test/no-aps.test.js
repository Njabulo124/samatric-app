/**
 * Courses whose prospectus prints no APS at all (many DUT diplomas): Maths Lit learners must not be
 * told "Maths Lit not accepted" just because there is no Maths Lit APS. The subject groups decide.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateCourse } from '../src/eligibility.js';
import { improvePlan } from '../src/improve.js';
import { RULES } from './fixtures.js';

const ENG = { description: 'English', options: [
  { subject: 'English Home Language', minPercent: 40 }, { subject: 'English First Additional Language', minPercent: 50 }] };
const base = { courseId: 900, universityShortName: 'UJ', faculty: 'Test', notes: null,
  minAps: null, minApsMathsLit: null, minApsTechMaths: null };
const ML_OK = { ...base, name: 'Dip with ML', requirements: [ENG, { description: 'Mathematics', options: [
  { subject: 'Mathematics', minPercent: 40 }, { subject: 'Mathematical Literacy', minPercent: 50 }] }] };
const MATHS_ONLY = { ...base, name: 'Dip maths only', requirements: [ENG, { description: 'Mathematics', options: [
  { subject: 'Mathematics', minPercent: 50 }] }] };
const ML_LEARNER = { 'English First Additional Language': 60, 'Mathematical Literacy': 65, 'Life Orientation': 70 };

test('no APS at all + Maths Lit accepted in the subjects: CHECK, not blocked', () => {
  const r = evaluateCourse(ML_OK, ML_LEARNER, 25);
  assert.equal(r.status, 'check');
  assert.ok(!r.reasons.some((x) => /not accepted/.test(x)));
});

test('no APS at all + only Mathematics listed: Maths Lit learner still not eligible (missing subject)', () => {
  const r = evaluateCourse(MATHS_ONLY, ML_LEARNER, 25);
  assert.equal(r.status, 'not_eligible');
  assert.ok(r.reasons.some((x) => /Requires Mathematics/.test(x)));
});

test('a course that gives a Maths APS but none for Maths Lit still blocks Maths Lit', () => {
  const r = evaluateCourse({ ...ML_OK, minAps: 24 }, ML_LEARNER, 25);
  assert.equal(r.status, 'not_eligible');
  assert.ok(r.reasons.some((x) => /not accepted/.test(x)));
});

test('improve plan: no "maths type" blocker when the course has no APS at all', () => {
  const plan = improvePlan(ML_OK, RULES.UJ, ML_LEARNER);
  assert.ok(!plan.blockers.some((b) => b.type === 'maths_type'));
});
