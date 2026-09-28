import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { BENG_CIVIL, RULES, SCIENCE_LEARNER, WSU_BCOM } from './fixtures.js';

const SUBJECTS = [
  'English Home Language', 'English First Additional Language', 'isiZulu Home Language',
  'isiZulu First Additional Language', 'Mathematics', 'Mathematical Literacy', 'Technical Mathematics',
  'Physical Sciences', 'Life Sciences', 'Geography', 'Life Orientation',
].map((name) => ({ name, group: 'other', isDesignated: true }));

const CATALOG = {
  intakeYear: 2027,
  subjects: SUBJECTS,
  universities: [{ shortName: 'UJ', name: 'University of Johannesburg', courseCount: 1 },
    { shortName: 'WSU', name: 'Walter Sisulu University', courseCount: 1 }],
  rules: RULES,
  courses: [BENG_CIVIL, WSU_BCOM],
};

let server;
let base;

before(async () => {
  const app = createApp({ getCatalog: async () => CATALOG });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const post = (body, raw = false) => fetch(`${base}/api/eligibility`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: raw ? body : JSON.stringify(body),
});

test('GET /api/health', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok', intakeYear: 2027, courses: 2 });
});

test('GET /api/subjects and /api/universities', async () => {
  assert.equal((await (await fetch(`${base}/api/subjects`)).json()).length, SUBJECTS.length);
  assert.equal((await (await fetch(`${base}/api/universities`)).json())[0].shortName, 'UJ');
});

test('POST /api/eligibility returns APS, summary and results', async () => {
  const res = await post({ marks: SCIENCE_LEARNER });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.apsByUniversity.UJ.aps, 35);
  assert.equal(body.summary.qualifies, 2);
  assert.equal(body.results.length, 2);
});

test('universities filter limits the results', async () => {
  const body = await (await post({ marks: SCIENCE_LEARNER, universities: ['WSU'] })).json();
  assert.deepEqual(body.results.map((r) => r.university), ['WSU']);
  assert.deepEqual(Object.keys(body.apsByUniversity), ['WSU']);
});

test('400 for unknown subject and out-of-range mark', async () => {
  const res = await post({ marks: { Maths: 70, 'Life Sciences': 120 } });
  assert.equal(res.status, 400);
  const { errors } = await res.json();
  assert.equal(errors.length, 2);
});

test('400 for two maths subjects', async () => {
  const res = await post({ marks: { Mathematics: 60, 'Mathematical Literacy': 70 } });
  assert.equal(res.status, 400);
  assert.match((await res.json()).errors[0], /only one maths subject/);
});

test('400 for the same language at HL and FAL', async () => {
  const res = await post({ marks: { 'isiZulu Home Language': 70, 'isiZulu First Additional Language': 70 } });
  assert.equal(res.status, 400);
});

test('400 for missing marks and for invalid JSON', async () => {
  assert.equal((await post({})).status, 400);
  assert.equal((await post('{not json', true)).status, 400);
});

test('unknown API route is a JSON 404', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'Not found.');
});
