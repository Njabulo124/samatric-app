import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';

// UFS: six academic subjects (90-100% = 8, below 30% = 0) plus LO worth 1 point from 60%.
const eight = [
  { min: 90, max: 100, points: 8 }, { min: 80, max: 89, points: 7 }, { min: 70, max: 79, points: 6 },
  { min: 60, max: 69, points: 5 }, { min: 50, max: 59, points: 4 }, { min: 40, max: 49, points: 3 },
  { min: 30, max: 39, points: 2 }, { min: 0, max: 29, points: 0 },
];
const lo = [{ min: 60, max: 100, points: 1 }, { min: 0, max: 59, points: 0 }];
const UFS = { defaultBands: eight, subjectsCounted: 7, includeLo: true, mustCount: [['Life Orientation']], subjectBands: { 'Life Orientation': lo } };

test('UFS: printed example 5x5 + 1x4 + LO 1 = 30', () => {
  const marks = {
    'English First Additional Language': 65, Mathematics: 62, 'Physical Sciences': 60, 'Life Sciences': 68,
    Geography: 61, Accounting: 55, 'Life Orientation': 70,
  };
  assert.equal(computeAps(marks, UFS).aps, 30);
});

test('UFS: LO below 60% adds nothing; an extra subject cannot push LO out', () => {
  const marks = {
    'English First Additional Language': 65, Mathematics: 62, 'Physical Sciences': 60, 'Life Sciences': 68,
    Geography: 61, Accounting: 55, History: 52, 'Life Orientation': 55,
  };
  const { aps, counted } = computeAps(marks, UFS);
  assert.equal(aps, 29); // best six = 5+5+5+5+5+4, LO 0
  assert.ok(counted.some((c) => c.subject === 'Life Orientation'));
});
