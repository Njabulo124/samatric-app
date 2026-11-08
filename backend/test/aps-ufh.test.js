/**
 * UFH APS: all seven subjects including Life Orientation, standard NSC scale, but LO capped at
 * level 4 (4 points). Source: UFH Undergraduate Study Guide 2027.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';

const b = (rows) => rows.map(([min, max, points]) => ({ min, max, points }));
const NSC = b([[80, 100, 7], [70, 79, 6], [60, 69, 5], [50, 59, 4], [40, 49, 3], [30, 39, 2], [0, 29, 1]]);
const UFH = {
  subjectsCounted: 7,
  includeLo: true,
  mustCount: [['English Home Language', 'English First Additional Language'], ['Life Orientation']],
  defaultBands: NSC,
  subjectBands: { 'Life Orientation': b([[50, 100, 4], [40, 49, 3], [30, 39, 2], [0, 29, 1]]) },
};

test('UFH: LO counts but never more than 4 points', () => {
  const marks = {
    'English First Additional Language': 62, Mathematics: 55, 'isiXhosa Home Language': 74,
    Accounting: 58, 'Business Studies': 66, Economics: 51, 'Life Orientation': 92,
  };
  // 5 + 4 + 6 + 4 + 5 + 4 + LO 4 (not 7) = 32, matching UFH BCom Accounting's minimum
  assert.equal(computeAps(marks, UFH).aps, 32);
});

test('UFH: LO below 50% scores normally', () => {
  const marks = {
    'English Home Language': 50, 'Mathematical Literacy': 50, 'Sesotho First Additional Language': 50,
    History: 50, Geography: 50, Tourism: 50, 'Life Orientation': 45,
  };
  assert.equal(computeAps(marks, UFH).aps, 6 * 4 + 3);
});
