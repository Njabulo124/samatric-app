import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';
import { courseRule, evaluateAll, evaluateCourse, STATUS } from '../src/eligibility.js';
import { RULES } from './fixtures.js';

const english = { description: 'English', options: [
  { subject: 'English Home Language', minPercent: 50 },
  { subject: 'English First Additional Language', minPercent: 50 }] };
const twoOfCommerce = { description: 'Two of Accounting, Business Studies, Economics', minCount: 2, options: [
  { subject: 'Accounting', minPercent: 50 },
  { subject: 'Business Studies', minPercent: 50 },
  { subject: 'Economics', minPercent: 50 }] };

const EMS = {
  courseId: 301, name: 'B.Ed (Economic & Management Science)', universityShortName: 'WSU', faculty: 'Education',
  minAps: 24, minApsMathsLit: 24, minApsTechMaths: null, notes: null, requirements: [english, twoOfCommerce],
};
const base = {
  'English First Additional Language': 60, 'isiXhosa Home Language': 70, 'Mathematical Literacy': 65,
  Geography: 60, History: 60, 'Life Orientation': 75,
};

test('2-of-3: passes with exactly two of the three subjects met', () => {
  const marks = { ...base, Accounting: 55, 'Business Studies': 60 };
  assert.equal(evaluateCourse(EMS, marks, 30).status, STATUS.QUALIFIES);
});

test('2-of-3: one met, one a little short is close, with one gap only', () => {
  const marks = { ...base, Accounting: 55, 'Business Studies': 47, Economics: 30 };
  const r = evaluateCourse(EMS, marks, 30);
  assert.equal(r.status, STATUS.CLOSE);
  assert.deepEqual(r.gaps.subjects.map((g) => g.subject), ['Business Studies']);
});

test('2-of-3: only one of the subjects taken is not eligible, with a clear reason', () => {
  const r = evaluateCourse(EMS, { ...base, Accounting: 80 }, 30);
  assert.equal(r.status, STATUS.NOT_ELIGIBLE);
  assert.match(r.reasons[0], /at least 2 of/);
});

test('APS locks only the best 2 of a 2-of-N group, not every listed subject', () => {
  const marks = { 'English Home Language': 50, Accounting: 52, 'Business Studies': 51, Economics: 50,
    'Physical Sciences': 90, 'Life Sciences': 90, Mathematics: 90 };
  const { counted } = computeAps(marks, RULES.UJ, [
    ['English Home Language'],
    { subjects: ['Accounting', 'Business Studies', 'Economics'], count: 2 }]);
  const locked = counted.filter((c) => c.locked).map((c) => c.subject);
  assert.deepEqual(locked, ['English Home Language', 'Accounting', 'Business Studies']);
  assert.ok(!counted.some((c) => c.subject === 'Economics'));
});

test('course-level LO: counted as a 7th subject only for that course', () => {
  const rule = RULES.WSU;
  const fp = { includeLo: true };
  const marks = { ...base, 'Life Orientation': 80 };
  const normal = computeAps(marks, rule).aps;
  const withLo = computeAps(marks, courseRule(rule, fp)).aps;
  assert.equal(withLo - normal, 7); // LO 80% = 7 on the WSU scale
  assert.equal(courseRule(rule, { includeLo: null }), rule);
});

test('evaluateAll applies the LO override per course', () => {
  const lo = { description: 'Life Orientation', options: [{ subject: 'Life Orientation', minPercent: 60 }] };
  const fp = { ...EMS, courseId: 302, name: 'Foundation Phase', includeLo: true, minAps: 30, minApsMathsLit: 30,
    requirements: [english, lo] };
  const marks = { ...base, 'Life Orientation': 80 };
  const { results } = evaluateAll([fp, { ...EMS, requirements: [english] }], RULES, marks);
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));
  assert.ok(byName['Foundation Phase'].aps > byName[EMS.name].aps);
  assert.ok(byName['Foundation Phase'].apsWorking.some((c) => c.subject === 'Life Orientation'));
});

test('course-level LO: false drops LO where the university counts it (SMU EMC)', () => {
  const rule = { ...RULES.WSU, includeLo: true, subjectsCounted: 7 };
  const marks = { ...base, 'Life Orientation': 80 };
  const withLo = computeAps(marks, rule).aps;
  const without = computeAps(marks, courseRule(rule, { includeLo: false })).aps;
  assert.equal(withLo - without, 7);
  assert.equal(courseRule(rule, { includeLo: false }).subjectsCounted, 6);
  assert.equal(courseRule(rule, { includeLo: null }), rule);
});
