/**
 * Express app. Created by a factory so tests can inject a fake catalog (no database needed).
 *
 *   createApp({ getCatalog, ping, staticDir })
 *     getCatalog: async () => { intakeYear, subjects, universities, rules, courses }
 *     ping:       async () => void   (throws if the database is down)
 *     staticDir:  optional folder with the frontend, served at /
 */
import express from 'express';
import { evaluateAll, STATUS } from './eligibility.js';
import { validateMarks } from './validation.js';
import { searchCourses, searchFacets } from './search.js';
import { improvePlan } from './improve.js';

const MAX_PLAN_COURSES = 20;

/** A course as the API returns it, with its university's application details attached. */
function courseView(course, uni) {
  return {
    ...course,
    universityName: uni?.name ?? null,
    applicationUrl: uni?.applicationUrl ?? null,
    applicationsClose: uni?.applicationsClose ?? null,
  };
}

/** Rule summary for the course detail page ("best 6 subjects, LO not counted"). */
function ruleView(rule) {
  if (!rule) return null;
  return {
    subjectsCounted: rule.subjectsCounted,
    includeLo: rule.includeLo,
    mustCount: rule.mustCount ?? [],
    bands: rule.defaultBands,
  };
}

const list = (v) => (typeof v === 'string' && v.trim() ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);
const int = (v, def, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : def;
};

export function createApp({ getCatalog, ping = async () => {}, staticDir } = {}) {
  const app = express();
  app.use(express.json({ limit: '20kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await ping();
      const { intakeYear, courses } = await getCatalog();
      res.json({ status: 'ok', intakeYear, courses: courses.length });
    } catch (err) {
      res.status(503).json({ status: 'error', error: 'Database unavailable.' });
    }
  });

  app.get('/api/subjects', async (_req, res) => {
    const { subjects } = await getCatalog();
    res.json(subjects);
  });

  app.get('/api/universities', async (_req, res) => {
    const { universities } = await getCatalog();
    res.json(universities);
  });

  /**
   * GET /api/courses?q=nursing&uni=UJ,WSU&type=bachelor&faculty=...&limit=50&offset=0
   * Search every course, whether or not the learner qualifies.
   */
  app.get('/api/courses', async (req, res) => {
    const catalog = await getCatalog();
    const unis = new Map(catalog.universities.map((u) => [u.shortName, u]));
    const { total, results } = searchCourses(catalog.courses, {
      q: typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '',
      universities: list(req.query.uni),
      qualificationType: typeof req.query.type === 'string' ? req.query.type : undefined,
      faculty: typeof req.query.faculty === 'string' ? req.query.faculty : undefined,
      limit: int(req.query.limit, 50, 200),
      offset: int(req.query.offset, 0, 100000),
      universityNames: Object.fromEntries([...unis].map(([k, u]) => [k, u.name])),
    });
    res.json({ total, results: results.map((c) => courseView(c, unis.get(c.universityShortName))) });
  });

  app.get('/api/courses/facets', async (_req, res) => {
    const { courses } = await getCatalog();
    res.json(searchFacets(courses));
  });

  app.get('/api/courses/:id', async (req, res) => {
    const catalog = await getCatalog();
    const id = Number(req.params.id);
    const course = catalog.courses.find((c) => c.courseId === id);
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    const uni = catalog.universities.find((u) => u.shortName === course.universityShortName);
    res.json({ ...courseView(course, uni), apsRule: ruleView(catalog.rules[course.universityShortName]) });
  });

  /**
   * POST /api/improve
   * Body: { "marks": {...}, "courseIds": [12, 40] }
   * What the learner needs to change to get into each course.
   */
  app.post('/api/improve', async (req, res) => {
    const catalog = await getCatalog();
    const { marks, courseIds } = req.body ?? {};
    const errors = validateMarks(marks, new Set(catalog.subjects.map((s) => s.name)));
    if (!Array.isArray(courseIds) || courseIds.length === 0 || !courseIds.every(Number.isInteger)) {
      errors.push('"courseIds" must be a list of course ids, e.g. [12, 40].');
    } else if (courseIds.length > MAX_PLAN_COURSES) {
      errors.push(`At most ${MAX_PLAN_COURSES} courses at a time.`);
    }
    if (errors.length) return res.status(400).json({ errors });

    const byId = new Map(catalog.courses.map((c) => [c.courseId, c]));
    const plans = [];
    const notFound = [];
    for (const id of courseIds) {
      const course = byId.get(id);
      const rule = course && catalog.rules[course.universityShortName];
      if (!course || !rule) notFound.push(id);
      else plans.push(improvePlan(course, rule, marks));
    }
    res.json({ plans, notFound });
  });

  /**
   * POST /api/eligibility
   * Body: { "marks": { "Mathematics": 65, ... }, "universities": ["UJ"] (optional) }
   */
  app.post('/api/eligibility', async (req, res) => {
    const catalog = await getCatalog();
    const { marks, universities } = req.body ?? {};

    const known = new Set(catalog.subjects.map((s) => s.name));
    const errors = validateMarks(marks, known);
    if (universities !== undefined && !Array.isArray(universities)) {
      errors.push('"universities" must be a list of short names, e.g. ["UJ"].');
    }
    if (errors.length) return res.status(400).json({ errors });

    const wanted = universities?.length ? new Set(universities) : null;
    const courses = wanted ? catalog.courses.filter((c) => wanted.has(c.universityShortName)) : catalog.courses;
    const rules = wanted
      ? Object.fromEntries(Object.entries(catalog.rules).filter(([u]) => wanted.has(u)))
      : catalog.rules;

    const { apsByUniversity, results } = evaluateAll(courses, rules, marks);
    const summary = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
    for (const r of results) summary[r.status] += 1;

    res.json({ intakeYear: catalog.intakeYear, apsByUniversity, summary, results });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  if (staticDir) app.use(express.static(staticDir));

  // Malformed JSON and anything unexpected
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ errors: ['Request body is not valid JSON.'] });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}
