import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAll, evaluateCourse, STATUS } from '../src/eligibility.js';
import {
  BCOM_INFO_MGMT, BED_FOUNDATION, BENG_CIVIL, BENGTECH_CIVIL, RULES, SCIENCE_LEARNER, WSU_BCOM,
} from './fixtures.js';

const withMaths = (marks, subject, pct) => {
  const m = { ...marks };
  delete m.Mathematics;
  m[subject] = pct;
  return m;
};

test('qualifies when APS and every requirement group are met', () => {
  const r = evaluateCourse(BENG_CIVIL, SCIENCE_LEARNER, 35);
  assert.equal(r.status, STATUS.QUALIFIES);
  assert.deepEqual(r.reasons, []);
});

test('close when APS is 1 short', () => {
  const r = evaluateCourse(BENG_CIVIL, SCIENCE_LEARNER, 31);
  assert.equal(r.status, STATUS.CLOSE);
  assert.equal(r.gaps.aps, 1);
});

test('close when a subject is a few percent short', () => {
  const marks = { ...SCIENCE_LEARNER, 'Physical Sciences': 57 };
  const r = evaluateCourse(BENG_CIVIL, marks, 35);
  assert.equal(r.status, STATUS.CLOSE);
  assert.equal(r.gaps.subjects[0].shortfall, 3);
});

test('not eligible when a subject is far below', () => {
  const marks = { ...SCIENCE_LEARNER, 'Physical Sciences': 45 };
  assert.equal(evaluateCourse(BENG_CIVIL, marks, 35).status, STATUS.NOT_ELIGIBLE);
});

test('not eligible when a required subject was not taken', () => {
  const marks = { ...SCIENCE_LEARNER };
  delete marks['Physical Sciences'];
  const r = evaluateCourse(BENG_CIVIL, marks, 35);
  assert.equal(r.status, STATUS.NOT_ELIGIBLE);
  assert.deepEqual(r.gaps.missing, ['Physical Sciences']);
});

test('Maths Lit learner is blocked where Maths Lit APS is null', () => {
  const marks = withMaths(SCIENCE_LEARNER, 'Mathematical Literacy', 90);
  const r = evaluateCourse(BENG_CIVIL, marks, 35);
  assert.equal(r.status, STATUS.NOT_ELIGIBLE);
  assert.match(r.reasons[0], /not accepted/);
});

test('Tech Maths + Technical Sciences learner qualifies for BEngTech Civil', () => {
  const marks = withMaths(SCIENCE_LEARNER, 'Technical Mathematics', 65);
  delete marks['Physical Sciences'];
  marks['Technical Sciences'] = 62;
  assert.equal(evaluateCourse(BENGTECH_CIVIL, marks, 30).status, STATUS.QUALIFIES);
});

test('missing APS in the prospectus gives CHECK, not a false yes', () => {
  assert.equal(evaluateCourse(BCOM_INFO_MGMT, SCIENCE_LEARNER, 35).status, STATUS.CHECK);
});

test('same course, Maths Lit learner is decided normally from min_aps_maths_lit', () => {
  const marks = withMaths(SCIENCE_LEARNER, 'Mathematical Literacy', 75);
  assert.equal(evaluateCourse(BCOM_INFO_MGMT, marks, 28).status, STATUS.QUALIFIES);
});

test('different % for English HL and FAL (BEd: HL 60 / FAL 70)', () => {
  const fal65 = { ...SCIENCE_LEARNER, 'English First Additional Language': 65 };
  delete fal65['English Home Language'];
  const r = evaluateCourse(BED_FOUNDATION, fal65, 30);
  assert.equal(r.status, STATUS.CLOSE);
  assert.equal(r.gaps.subjects[0].need, 70);
});

test('evaluateAll uses each university\'s own APS and sorts qualifies first', () => {
  const marks = { ...SCIENCE_LEARNER, 'Physical Sciences': 50 };
  const { apsByUniversity, results } = evaluateAll(
    [BENG_CIVIL, WSU_BCOM, BENGTECH_CIVIL], RULES, marks,
  );
  assert.equal(apsByUniversity.UJ.aps, 34);
  assert.equal(apsByUniversity.WSU.aps, 34);
  assert.deepEqual(results.map((r) => r.status), [STATUS.QUALIFIES, STATUS.NOT_ELIGIBLE, STATUS.NOT_ELIGIBLE]);
  assert.equal(results[0].university, 'WSU');
});
