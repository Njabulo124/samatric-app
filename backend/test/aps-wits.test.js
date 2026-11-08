/**
 * Wits APS: best 7 subjects INCLUDING Life Orientation, English and Mathematics on a bonus scale
 * (+2 from 60%), LO on its own small scale, and 0 points below 40%.
 * Source: wits.ac.za/undergraduate/entry-requirements (2027).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';

const b = (rows) => rows.map(([min, max, points]) => ({ min, max, points }));
const OTHER = b([[90, 100, 8], [80, 89, 7], [70, 79, 6], [60, 69, 5], [50, 59, 4], [40, 49, 3], [0, 39, 0]]);
const BONUS = b([[90, 100, 10], [80, 89, 9], [70, 79, 8], [60, 69, 7], [50, 59, 4], [40, 49, 3], [0, 39, 0]]);
const LO = b([[90, 100, 4], [80, 89, 3], [70, 79, 2], [60, 69, 1], [0, 59, 0]]);
const ENG = ['English Home Language', 'English First Additional Language'];

const WITS = {
  subjectsCounted: 7,
  includeLo: true,
  mustCount: [ENG, ['Life Orientation']],
  defaultBands: OTHER,
  subjectBands: {
    'English Home Language': BONUS, 'English First Additional Language': BONUS,
    Mathematics: BONUS, 'Life Orientation': LO,
  },
};

test('Wits: English and Maths get +2 from 60%, LO capped, all 7 subjects count', () => {
  const marks = {
    'English Home Language': 72, Mathematics: 65, 'isiZulu First Additional Language': 80,
    'Physical Sciences': 58, 'Life Sciences': 91, Geography: 45, 'Life Orientation': 85,
  };
  // 8 + 7 + 7 + 4 + 8 + 3 + 3 = 40
  assert.equal(computeAps(marks, WITS).aps, 40);
});

test('Wits: below 60% English/Maths get no bonus, below 40% is 0', () => {
  const marks = {
    'English First Additional Language': 55, Mathematics: 35, 'Sepedi Home Language': 62,
    History: 50, Geography: 41, Tourism: 70, 'Life Orientation': 68,
  };
  // 4 + 0 + 5 + 4 + 3 + 6 + 1 = 23
  assert.equal(computeAps(marks, WITS).aps, 23);
});

test('Wits: an 8th subject replaces the weakest, but LO and English always stay', () => {
  const marks = {
    'English First Additional Language': 50, Mathematics: 80, 'isiXhosa Home Language': 75,
    'Physical Sciences': 70, 'Life Sciences': 70, Geography: 70, 'Information Technology': 90,
    'Life Orientation': 50,
  };
  const { aps, counted } = computeAps(marks, WITS);
  const names = counted.map((c) => c.subject);
  assert.ok(names.includes('Life Orientation') && names.includes('English First Additional Language'));
  assert.equal(counted.length, 7);
  // English 4 + LO 0 + best five of the rest: IT 8, Maths 9, Xhosa 6, PS 6, LS 6 (Geography 6 dropped) = 39
  assert.equal(aps, 39);
});

test('Wits: Maths Literacy gets no bonus (other-subjects scale)', () => {
  const marks = {
    'English Home Language': 60, 'Mathematical Literacy': 85, 'Setswana First Additional Language': 60,
    History: 60, Geography: 60, 'Business Studies': 60, 'Life Orientation': 90,
  };
  // English 7 + Maths Lit 7 + 5*4 others... = 7 + 7 + 5 + 5 + 5 + 5 + 4 = 38
  assert.equal(computeAps(marks, WITS).aps, 38);
});
