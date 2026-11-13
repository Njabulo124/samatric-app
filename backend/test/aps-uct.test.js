import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';
import { courseRule } from '../src/eligibility.js';

// UCT FPS: English + best 5 others, each scoring its percentage (below 40% = 0), LO excluded.
const pct = [...Array.from({ length: 61 }, (_, i) => ({ min: 100 - i, max: 100 - i, points: 100 - i })),
  { min: 0, max: 39, points: 0 }];
const UCT = {
  defaultBands: pct, subjectsCounted: 6, includeLo: false,
  mustCount: [['English Home Language', 'English First Additional Language']],
};
const marks = {
  'English Home Language': 70, 'isiXhosa First Additional Language': 80, Mathematics: 75,
  'Physical Sciences': 65, 'Life Sciences': 72, Geography: 68, Accounting: 35, 'Life Orientation': 90,
};
const req = (...subjects) => subjects.map((s) => [s]);

test('UCT: FPS = English + best 5, LO out, below 40% scores 0', () => {
  // 70 + 80 + 75 + 72 + 68 + 65 = 430 (Accounting 35 and LO not counted)
  assert.equal(computeAps(marks, UCT).aps, 430);
});

test('UCT Science: Maths and Physical Sciences counted twice (out of 800)', () => {
  const course = { apsWeights: [{ subjects: ['Mathematics'], weight: 2 }, { subjects: ['Physical Sciences'], weight: 2 }] };
  const { aps, counted } = computeAps(marks, courseRule(UCT, course), req('Mathematics', 'Physical Sciences'));
  assert.equal(aps, 430 + 75 + 65); // 570
  assert.equal(counted.find((c) => c.subject === 'Mathematics').weight, 2);
});

test('UCT Science: without Physical Sciences, Life Sciences is doubled instead (Archaeology / EGS)', () => {
  const { 'Physical Sciences': _, ...noPhys } = marks;
  const course = { apsWeights: [{ subjects: ['Mathematics'], weight: 2 },
    { subjects: ['Physical Sciences', 'Information Technology', 'Life Sciences'], weight: 2 }] };
  const rule = courseRule(UCT, course);
  // counted: English 70, isiXhosa 80, Maths 75 (x2), LS 72 (x2), Geography 68, Accounting 0 = 510 + 75 + 72
  const slots = [['Mathematics'], ['Physical Sciences', 'Information Technology', 'Life Sciences']];
  assert.equal(computeAps(noPhys, rule, slots).aps, 70 + 80 + 150 + 144 + 68 + 0);
});

test('a course without weights is unchanged', () => {
  assert.deepEqual(courseRule(UCT, { apsWeights: null }), UCT);
});
