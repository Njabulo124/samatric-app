import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';
import { closeApsLimit, evaluateCourse, STATUS } from '../src/eligibility.js';

// NMU Applicant Score: sum of the percentages of six subjects (LO excluded), out of 600.
const pct = Array.from({ length: 101 }, (_, m) => ({ min: m, max: m, points: m }));
const NMU = { defaultBands: pct, subjectsCounted: 6, includeLo: false, mustCount: [] };

test('NMU: AS is the sum of the six best percentages, LO excluded', () => {
  const marks = {
    'English Home Language': 68, 'isiXhosa First Additional Language': 72, Mathematics: 61,
    'Physical Sciences': 58, 'Life Sciences': 66, Geography: 70, 'Life Orientation': 90,
  };
  assert.equal(computeAps(marks, NMU).aps, 395);
});

test('NMU: close margin scales to 25 AS points; usual scales stay at 2', () => {
  assert.equal(closeApsLimit(NMU), 25);
  assert.equal(closeApsLimit({ defaultBands: [{ min: 80, max: 100, points: 7 }] }), 2);
  const course = { minAps: 410, minApsMathsLit: null, minApsTechMaths: null, requirements: [] };
  const marks = { Mathematics: 60, 'English Home Language': 60 };
  assert.equal(evaluateCourse(course, marks, 395, 25).status, STATUS.CLOSE);
  assert.equal(evaluateCourse(course, marks, 380, 25).status, STATUS.NOT_ELIGIBLE);
});
