/**
 * Express app: a thin HTTP wrapper around api-core.js (the same routes run in the browser on the
 * static site). Created by a factory so tests can inject a fake catalog (no database needed).
 *
 *   createApp({ getCatalog, ping, staticDir, applyingFor })
 *     getCatalog:  async () => { intakeYear, subjects, universities, rules, courses }
 *     ping:        async () => void   (throws if the database is down)
 *     staticDir:   optional folder with the frontend, served at /
 *     applyingFor: the intake learners are applying for (defaults to the data's intake year)
 */
import express from 'express';
import { createApi } from './api-core.js';

export { closesFor } from './api-core.js';

export function createApp({ getCatalog, ping = async () => {}, staticDir, applyingFor } = {}) {
  const api = createApi({ getCatalog, ping, applyingFor });
  const app = express();
  app.use(express.json({ limit: '20kb' }));

  app.use('/api', async (req, res, next) => {
    try {
      const { status, body } = await api.handle(req.method, req.path, req.query, req.body);
      res.status(status).json(body);
    } catch (err) {
      next(err);
    }
  });

  if (staticDir) app.use(express.static(staticDir));

  // Malformed JSON and anything unexpected
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ errors: ['Request body is not valid JSON.'] });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}
