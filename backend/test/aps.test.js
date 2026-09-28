import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps, pointsFor } from '../src/aps.js';
import { RULES, SCIENCE_LEARNER } from './fixtures.js';

test('band boundaries on the NSC 7-point scale', () => {
  const bands = RULES.UJ.defaultBands;
  assert.equal(pointsFor(80, bands), 7);
  assert.equal(pointsFor(79, bands), 6);
  assert.equal(pointsFor(100, bands), 7);
  assert.equal(pointsFor(0, bands), 1);
});

test('UJ: best 6 subjects, Life Orientation excluded', () => {
  const { aps, counted } = computeAps(SCIENCE_LEARNER, RULES.UJ);
  assert.equal(aps, 35);
  assert.equal(counted.length, 6);
  assert.ok(!counted.some((c) => c.subject === 'Life Orientation'));
});

test('WSU 8-point scale: 90%+ earns 8 points', () => {
  const marks = { ...SCIENCE_LEARNER, Mathematics: 92 };
  assert.equal(computeAps(marks, RULES.UJ).aps, 36); // 7 on the UJ scale
  assert.equal(computeAps(marks, RULES.WSU).aps, 37); // 8 on the WSU scale
});

test('only the best N count when a learner has extra subjects', () => {
  const marks = { ...SCIENCE_LEARNER, Accounting: 30 }; // 7 non-LO subjects
  assert.equal(computeAps(marks, RULES.UJ).aps, 35); // the weak extra subject is dropped
});

test('Life Orientation counts when the rule includes it', () => {
  const rule = { ...RULES.UJ, includeLo: true, subjectsCounted: 7 };
  assert.equal(computeAps(SCIENCE_LEARNER, rule).aps, 42); // + LO 90% = 7
});

test('per-subject scale overrides the default', () => {
  const loCapped = [{ min: 0, max: 100, points: 1 }];
  const rule = { ...RULES.UJ, includeLo: true, subjectsCounted: 7, subjectBands: { 'Life Orientation': loCapped } };
  assert.equal(computeAps(SCIENCE_LEARNER, rule).aps, 36);
});
