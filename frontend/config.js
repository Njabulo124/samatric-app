/**
 * How the page gets its data.
 *   'server' — calls the SAMATRIC API (npm start). Used for local development.
 *   'static' — runs the eligibility engine in the browser on an exported catalog file. Used for the
 *              hosted site (S3 + CloudFront). The build (npm run build:static) writes this file.
 */
export const MODE = 'server';
export const CATALOG_URL = null;
