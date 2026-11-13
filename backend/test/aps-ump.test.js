import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';

// UMP: seven subjects on the NSC 7-point scale, Life Orientation counted at half its rating.
const seven = [
  { min: 80, max: 100, points: 7 }, { min: 70, max: 79, points: 6 }, { min: 60, max: 69, points: 5 },
  { min: 50, max: 59, points: 4 }, { min: 40, max: 49, points: 3 }, { min: 30, max: 39, points: 2 }, { min: 0, max: 29, points: 1 },
];
const half = seven.map((b) => ({ ...b, points: b.points / 2 }));
const UMP = { defaultBands: seven, subjectsCounted: 7, includeLo: true, mustCount: [], subjectBands: { 'Life Orientation': half } };

test('UMP: seven subjects, Life Orientation at half', () => {
  const marks = {
    'English First Additional Language': 65, Mathematics: 55, 'Physical Sciences': 52, 'Life Sciences': 70,
    Geography: 61, 'Siswati Home Language': 78, 'Life Orientation': 85,
  };
  // 5 + 4 + 4 + 6 + 5 + 6 + 3.5 (LO 85% = 7 / 2) = 33.5
  assert.equal(computeAps(marks, UMP).aps, 33.5);
});
