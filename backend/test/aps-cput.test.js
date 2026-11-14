import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';
import { courseRule } from '../src/eligibility.js';

// CPUT: each subject scores its percentage / 10, LO never counts. Worked examples from the 2027 prospectus.
const bands = Array.from({ length: 101 }, (_, m) => ({ min: m, max: m, points: m / 10 }));
const CPUT = { defaultBands: bands, subjectsCounted: 6, includeLo: false, mustCount: [] };
const ENG = ['English Home Language', 'English First Additional Language'];

test('CPUT Method 1: best 6 / 10 (304 / 10 = 30.4)', () => {
  const marks = { 'English First Additional Language': 57, Mathematics: 55, Geography: 50, History: 54,
    'Life Sciences': 43, Tourism: 45, 'Life Orientation': 95 };
  assert.equal(computeAps(marks, CPUT).aps, 30.4);
});

test('CPUT Method 2: Maths x2 + Physical Sciences x2 + English + next best (321 / 10 = 32.1)', () => {
  const course = {
    apsSubjectsCounted: 4,
    apsWeights: [{ subjects: ['Mathematics', 'Technical Mathematics'], weight: 2 },
      { subjects: ['Physical Sciences', 'Technical Sciences'], weight: 2 }],
  };
  const marks = { 'English First Additional Language': 57, Mathematics: 55, 'Physical Sciences': 50,
    History: 54, Geography: 43, Tourism: 45, 'Life Orientation': 95 };
  const slots = [ENG, ['Mathematics', 'Technical Mathematics'], ['Physical Sciences', 'Technical Sciences']];
  assert.equal(computeAps(marks, courseRule(CPUT, course), slots).aps, 32.1);
});

test('CPUT Method 3: Maths x2 + Accounting x2 + English + 3 next best (458 / 10 = 45.8)', () => {
  const course = { apsWeights: [{ subjects: ['Mathematics'], weight: 2 }, { subjects: ['Accounting'], weight: 2 }] };
  const marks = { 'English First Additional Language': 57, Mathematics: 55, Accounting: 62,
    'Business Studies': 54, Economics: 48, Geography: 65, History: 30, 'Life Orientation': 95 };
  const slots = [ENG, ['Mathematics'], ['Accounting']];
  assert.equal(computeAps(marks, courseRule(CPUT, course), slots).aps, 45.8);
});

test('course subject count is the override; null keeps the university rule', () => {
  assert.equal(courseRule(CPUT, { apsSubjectsCounted: 4 }).subjectsCounted, 4);
  assert.deepEqual(courseRule(CPUT, { apsSubjectsCounted: null }), CPUT);
});
