import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAps } from '../src/aps.js';
import { evaluateAll } from '../src/eligibility.js';
import { BENG_CIVIL, ENGLISH_SLOT, NINE_SUBJECT_LEARNER, RULES, SCIENCE_LEARNER } from './fixtures.js';

const UJ_WITH_ENGLISH = { ...RULES.UJ, mustCount: [ENGLISH_SLOT] };
const civilSlots = BENG_CIVIL.requirements.map((g) => g.options.map((o) => o.subject));

test('plain best 6 drops English for the 9-subject learner (the old behaviour)', () => {
  const { aps, counted } = computeAps(NINE_SUBJECT_LEARNER, RULES.UJ);
  assert.equal(aps, 38);
  assert.ok(!counted.some((c) => c.subject.startsWith('English')));
});

test('university must-count locks English in: 4 + best 5 of the rest = 36', () => {
  const { aps, counted } = computeAps(NINE_SUBJECT_LEARNER, UJ_WITH_ENGLISH);
  assert.equal(aps, 36);
  assert.deepEqual(counted.filter((c) => c.locked).map((c) => c.subject), ['English First Additional Language']);
});

test('BEng Civil locks English, Maths and Physical Sciences, then best 3 = 36', () => {
  const { aps, counted } = computeAps(NINE_SUBJECT_LEARNER, UJ_WITH_ENGLISH, civilSlots);
  assert.equal(aps, 36);
  assert.deepEqual(
    counted.filter((c) => c.locked).map((c) => c.subject),
    ['English First Additional Language', 'Mathematics', 'Physical Sciences'],
  );
  assert.equal(counted.length, 6);
});

test('a slot with alternatives locks the subject the learner actually took', () => {
  const marks = { ...NINE_SUBJECT_LEARNER };
  delete marks.Mathematics;
  marks['Technical Mathematics'] = 72;
  const { counted } = computeAps(marks, UJ_WITH_ENGLISH, civilSlots);
  assert.ok(counted.some((c) => c.subject === 'Technical Mathematics' && c.locked));
});

test('a 7-subject learner gets the same APS with or without locking', () => {
  const plain = computeAps(SCIENCE_LEARNER, RULES.UJ).aps;
  assert.equal(computeAps(SCIENCE_LEARNER, UJ_WITH_ENGLISH, civilSlots).aps, plain);
  assert.equal(plain, 35);
});

test('locking never exceeds the number of counted subjects', () => {
  const rule = { ...UJ_WITH_ENGLISH, subjectsCounted: 2 };
  const { counted } = computeAps(NINE_SUBJECT_LEARNER, rule, civilSlots);
  assert.equal(counted.length, 2);
});

test('evaluateAll uses the per-course APS and returns the working', () => {
  const { apsByUniversity, results } = evaluateAll([BENG_CIVIL], { UJ: UJ_WITH_ENGLISH }, NINE_SUBJECT_LEARNER);
  assert.equal(apsByUniversity.UJ.aps, 36);
  assert.equal(results[0].aps, 36);
  assert.equal(results[0].apsWorking.filter((c) => c.locked).length, 3);
});
