/**
 * The API, run in the browser for the static site. Loads the exported catalog once and answers
 * the same requests the server would, with the same code (engine/api-core.js is copied from
 * backend/src at build time).
 */
import { createApi } from './engine/api-core.js';
import { CATALOG_URL } from './config.js';

let core = null;

function getCore() {
  core ??= fetch(CATALOG_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load course data (${res.status}).`);
      return res.json();
    })
    .then((catalog) => createApi({ getCatalog: async () => catalog, applyingFor: catalog.applyingFor }))
    .catch((err) => { core = null; throw err; }); // retry on the next request
  return core;
}

/** Same contract as fetch-ing /api + path: resolves to { status, body }. */
export async function staticRequest(path, options = {}) {
  const url = new URL(path, 'https://samatric.local');
  const query = Object.fromEntries(url.searchParams);
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  const api = await getCore();
  return api.handle(options.method ?? 'GET', url.pathname, query, body);
}
