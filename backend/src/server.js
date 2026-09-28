/**
 * Start the API server.
 *
 *   npm start        (reads ../.env for DATABASE_URL)
 *
 * Env vars: DATABASE_URL (required), PORT (default 5000), INTAKE_YEAR (default 2027)
 *
 * Course data is loaded once at startup. After loading new prospectus data
 * with the pipeline, restart the server.
 */
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createPool, loadCatalog } from './repository.js';

const PORT = Number(process.env.PORT ?? 5000);
const INTAKE_YEAR = Number(process.env.INTAKE_YEAR ?? 2027);
const FRONTEND_DIR = fileURLToPath(new URL('../../frontend', import.meta.url));

const pool = createPool();
let catalogPromise = null;

function getCatalog() {
  catalogPromise ??= loadCatalog(pool, INTAKE_YEAR).catch((err) => {
    catalogPromise = null; // retry on the next request instead of caching the failure
    throw err;
  });
  return catalogPromise;
}

const app = createApp({ getCatalog, ping: () => pool.query('SELECT 1'), staticDir: FRONTEND_DIR });

const catalog = await getCatalog();
app.listen(PORT, () => {
  const unis = catalog.universities.map((u) => `${u.shortName} (${u.courseCount})`).join(', ');
  console.log(`SAMATRIC API on http://localhost:${PORT}  |  intake ${INTAKE_YEAR}  |  ${unis}`);
});
