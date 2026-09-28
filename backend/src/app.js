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
