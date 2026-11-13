import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';

// SPU: 8-point scale (0-29% = 1), Maths and Home Language get +2 from 60% / +1 from 40%,
// Life Orientation 1-4 points from 60%.
const eight = [
  { min: 90, max: 100, points: 8 }, { min: 80, max: 89, points: 7 }, { min: 70, max: 79, points: 6 },
  { min: 60, max: 69, points: 5 }, { min: 50, max: 59, points: 4 }, { min: 40, max: 49, points: 3 },
  { min: 30, max: 39, points: 2 }, { min: 0, max: 29, points: 1 },
];
const bonus = [
  { min: 90, max: 100, points: 10 }, { min: 80, max: 89, points: 9 }, { min: 70, max: 79, points: 8 },
  { min: 60, max: 69, points: 7 }, { min: 50, max: 59, points: 5 }, { min: 40, max: 49, points: 4 },
  { min: 30, max: 39, points: 2 }, { min: 0, max: 29, points: 1 },
];
const lo = [
  { min: 90, max: 100, points: 4 }, { min: 80, max: 89, points: 3 }, { min: 70, max: 79, points: 2 },
  { min: 60, max: 69, points: 1 }, { min: 0, max: 59, points: 0 },
];
const SPU = {
  defaultBands: eight, subjectsCounted: 7, includeLo: true, mustCount: [['Life Orientation']],
  subjectBands: { Mathematics: bonus, 'Setswana Home Language': bonus, 'English Home Language': bonus, 'Life Orientation': lo },
};

test('SPU: Maths and Home Language bonuses plus LO points', () => {
  const marks = {
    'English First Additional Language': 65, 'Setswana Home Language': 70, Mathematics: 55,
    'Physical Sciences': 50, 'Life Sciences': 60, Accounting: 45, 'Life Orientation': 75,
  };
  // HL 6+2, Maths 4+1, FAL 5, LS 5, PS 4, Acc 3, LO 2 = 32
  assert.equal(computeAps(marks, SPU).aps, 32);
});

test('SPU: First Additional Language gets no bonus; LO below 60% adds nothing', () => {
  const marks = {
    'English Home Language': 62, 'Afrikaans First Additional Language': 62, 'Mathematical Literacy': 62,
    History: 62, Geography: 62, Tourism: 62, 'Life Orientation': 59,
  };
  // HL 5+2, five others 5 each, LO 0 = 32
  assert.equal(computeAps(marks, SPU).aps, 32);
});
