/**
 * Build the static site into ../dist: the frontend, the engine, and the course data exported from
 * the database. Upload dist/ to S3 (served by CloudFront). No server or database needed there.
 *
 * Usage (from backend/):  npm run build:static
 * Env vars: DATABASE_URL, INTAKE_YEAR (default 2027), APPLYING_FOR (default INTAKE_YEAR)
 *
 * Output:
 *   dist/index.html, app.js, styles.css, static-api.js
 *   dist/config.js                 MODE = 'static', points at the data file
 *   dist/engine/*.js               copied from backend/src (same code the server runs)
 *   dist/data/catalog-<hash>.json  the data; the hash changes when the data does, so browsers
 *                                  and CloudFront never serve an old copy
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool, loadCatalog } from '../repository.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FRONTEND = `${ROOT}frontend/`;
const SRC = `${ROOT}backend/src/`;
const DIST = `${ROOT}dist/`;
// Engine files the browser needs: api-core.js and everything it imports (all free of Node-only APIs)
const ENGINE = ['api-core.js', 'aps.js', 'eligibility.js', 'improve.js', 'search.js', 'validation.js'];

const INTAKE_YEAR = Number(process.env.INTAKE_YEAR ?? 2027);
const APPLYING_FOR = Number(process.env.APPLYING_FOR ?? INTAKE_YEAR);

const pool = createPool();
try {
  const catalog = await loadCatalog(pool, INTAKE_YEAR);
  const json = JSON.stringify({ ...catalog, applyingFor: APPLYING_FOR });
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 10);
  const dataFile = `data/catalog-${hash}.json`;

  await rm(DIST, { recursive: true, force: true });
  await mkdir(`${DIST}engine`, { recursive: true });
  await mkdir(`${DIST}data`, { recursive: true });

  for (const f of await readdir(FRONTEND)) {
    if (f !== 'config.js') await cp(`${FRONTEND}${f}`, `${DIST}${f}`, { recursive: true });
  }
  for (const f of ENGINE) await cp(`${SRC}${f}`, `${DIST}engine/${f}`);
  await writeFile(`${DIST}${dataFile}`, json);
  await writeFile(`${DIST}config.js`,
    `// Written by npm run build:static. Data: intake ${INTAKE_YEAR}, applying for ${APPLYING_FOR}.\n`
    + `export const MODE = 'static';\nexport const CATALOG_URL = '${dataFile}';\n`);

  const unis = catalog.universities.length;
  console.log(`Built dist/: ${catalog.courses.length} courses, ${unis} universities, `
    + `data ${(json.length / 1024 / 1024).toFixed(1)} MB (${dataFile}).`);
  console.log('Preview: npm run preview:static, then open http://localhost:8080');
} finally {
  await pool.end();
}
