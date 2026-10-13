import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchCourses, searchFacets, tokenize } from '../src/search.js';
import { improvePlan } from '../src/improve.js';
import {
  BCOM_INFO_MGMT, BED_FOUNDATION, BENG_CIVIL, BENGTECH_CIVIL, RULES, SCIENCE_LEARNER, WSU_BCOM,
} from './fixtures.js';

const COURSES = [BENG_CIVIL, BENGTECH_CIVIL, BCOM_INFO_MGMT, BED_FOUNDATION, WSU_BCOM];
const names = (r) => r.results.map((c) => c.name);

// ---------------------------------------------------------------- search
test('tokenize drops punctuation, accents and stop words', () => {
  assert.deepEqual(tokenize('B.Ed (Senior & FET) – Économie'), ['b', 'ed', 'senior', 'fet', 'economie']);
});

test('search matches word starts in the course name', () => {
  assert.deepEqual(names(searchCourses(COURSES, { q: 'civ' })), ['BEng Civil Engineering', 'BEngTech Civil Engineering']);
});

test('abbreviations work both ways', () => {
  const both = ['BCom Information Management', 'Bachelor of Commerce'];
  assert.deepEqual(names(searchCourses(COURSES, { q: 'bcom' })).sort(), both);
  assert.deepEqual(names(searchCourses(COURSES, { q: 'commerce' })).sort(), both);
});

test('every query word must match', () => {
  assert.deepEqual(names(searchCourses(COURSES, { q: 'civil management' })), []);
});

test('filters: university and qualification type, empty query lists all', () => {
  assert.deepEqual(names(searchCourses(COURSES, { universities: ['WSU'] })), ['Bachelor of Commerce']);
  assert.equal(searchCourses(COURSES, {}).total, 5);
  assert.equal(searchCourses(COURSES, { qualificationType: 'diploma' }).total, 0);
});

test('university name matches when passed in', () => {
  const r = searchCourses(COURSES, { q: 'walter commerce', universityNames: { WSU: 'Walter Sisulu University' } });
  assert.deepEqual(names(r), ['Bachelor of Commerce']);
});

test('limit and offset page the results', () => {
  const r = searchCourses(COURSES, { limit: 2, offset: 2 });
  assert.equal(r.total, 5);
  assert.equal(r.results.length, 2);
});

test('facets list faculties per university', () => {
  const f = searchFacets(COURSES);
  assert.deepEqual(f.faculties, [{ university: 'UJ', faculty: 'Test' }, { university: 'WSU', faculty: 'Test' }]);
});

// ---------------------------------------------------------------- improve
test('a learner who qualifies gets no changes', () => {
  const plan = improvePlan(BENG_CIVIL, RULES.UJ, SCIENCE_LEARNER);
  assert.equal(plan.status, 'qualifies');
  assert.deepEqual(plan.changes, []);
  assert.match(plan.summary, /already meet/);
});

test('raises subject minimums first, then the cheapest APS points', () => {
  // UJ APS: Eng 5, Zulu 6, Maths 4, PS 5, LS 5, Geo 5 = 30. Needs 32 and Maths 60%.
  const marks = {
    'English Home Language': 65, 'isiZulu First Additional Language': 70, Mathematics: 55,
    'Physical Sciences': 62, 'Life Sciences': 60, Geography: 60, 'Life Orientation': 80,
  };
  const plan = improvePlan(BENG_CIVIL, RULES.UJ, marks);
  assert.equal(plan.currentAps, 30);
  assert.equal(plan.targetAps, 32);
  assert.equal(plan.reachable, true);
  assert.deepEqual(plan.changes.map((c) => [c.subject, c.from, c.to]), [
    ['English Home Language', 65, 70],
    ['Mathematics', 55, 60],
  ]);
  assert.equal(plan.totalIncrease, 10);
  assert.match(plan.summary, /^Raise English Home Language by 5% \(to 70%\) and Mathematics by 5% \(to 60%\)\.$/);
});

test('maths type not accepted is a blocker', () => {
  const marks = { 'English Home Language': 80, 'Mathematical Literacy': 90, 'Physical Sciences': 80 };
  const plan = improvePlan(BENG_CIVIL, RULES.UJ, marks);
  assert.equal(plan.reachable, false);
  assert.ok(plan.blockers.some((b) => b.type === 'maths_type' && /Mathematics or Technical Mathematics/.test(b.message)));
});

test('APS that six subjects cannot reach is reported', () => {
  const impossible = { ...BENG_CIVIL, minAps: 45 };
  const plan = improvePlan(impossible, RULES.UJ, SCIENCE_LEARNER);
  assert.equal(plan.reachable, false);
  assert.match(plan.summary, /out of reach/);
});

test('"2 of" groups raise only the two cheapest subjects', () => {
  const course = {
    courseId: 300, name: 'BEd EMS', universityShortName: 'WSU', faculty: 'Education', minAps: 20,
    minApsMathsLit: 20, minApsTechMaths: null, notes: null,
    requirements: [{
      description: 'Two of Accounting, Business Studies, Economics', minCount: 2,
      options: [
        { subject: 'Accounting', minPercent: 50 }, { subject: 'Business Studies', minPercent: 50 },
        { subject: 'Economics', minPercent: 50 },
      ],
    }],
  };
  const marks = {
    'English First Additional Language': 70, 'isiXhosa Home Language': 75, 'Mathematical Literacy': 65,
    Accounting: 45, 'Business Studies': 48, Economics: 30, 'Life Orientation': 70,
  };
  const plan = improvePlan(course, RULES.WSU, marks);
  assert.deepEqual(plan.changes.map((c) => [c.subject, c.to]), [['Accounting', 50], ['Business Studies', 50]]);
  assert.equal(plan.reachable, true);
});

test('multi-word abbreviations need all their words ("it" is not every "technology")', () => {
  const courses = [
    { ...WSU_BCOM, courseId: 1, name: 'Diploma in Information Technology' },
    { ...WSU_BCOM, courseId: 2, name: 'BEngTech Civil Engineering' },
  ];
  assert.deepEqual(names(searchCourses(courses, { q: 'it' })), ['Diploma in Information Technology']);
});
