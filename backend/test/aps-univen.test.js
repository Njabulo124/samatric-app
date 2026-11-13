import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';

// UNIVEN: each subject scores its percentage / 10; below 40% scores 0; best 7, LO excluded.
const bands = [{ min: 0, max: 39, points: 0 }];
for (let m = 40; m <= 100; m += 1) bands.push({ min: m, max: m, points: m / 10 });
const UNIVEN = { defaultBands: bands, subjectsCounted: 7, includeLo: false, mustCount: [], subjectBands: {} };

test('UNIVEN: percentage / 10, best 7, LO out, under 40% scores 0', () => {
  const marks = {
    'English First Additional Language': 72, Mathematics: 61, 'Physical Sciences': 55, 'Life Sciences': 68,
    Geography: 49, 'Tshivenda Home Language': 80, History: 38, 'Life Orientation': 90,
  };
  const { aps, counted } = computeAps(marks, UNIVEN);
  // 7.2 + 6.1 + 5.5 + 6.8 + 4.9 + 8.0 + 0 (History 38%) = 38.5
  assert.equal(aps, 38.5);
  assert.ok(!counted.some((c) => c.subject === 'Life Orientation'));
});
