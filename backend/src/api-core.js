/**
 * The API without a web server: one function per route, taking plain values and returning
 * { status, body }. Express (app.js) wraps it for the server, and the static site
 * (frontend/static-api.js) calls it in the browser with the exported catalog. Same logic, one place.
 *
 *   const api = createApi({ getCatalog, ping, applyingFor });
 *   await api.handle('GET', '/courses', { q: 'nursing' });
 *   await api.handle('POST', '/eligibility', {}, { marks });
 *
 * This file and the engine modules it imports must stay free of Node-only APIs.
 */
import { evaluateAll, STATUS } from './eligibility.js';
import { validateMarks } from './validation.js';
import { searchCourses, searchFacets } from './search.js';
import { improvePlan } from './improve.js';

const MAX_PLAN_COURSES = 20;

/**
 * The closing date that applies to a course: its own date (e.g. every TUT programme), else its
 * faculty's date (e.g. UP Vet Science), else the university's general date.
 */
export function closesFor(uni, faculty, courseCloses = null) {
  return courseCloses ?? uni?.periods?.find((p) => p.label === faculty)?.closesOn ?? uni?.applicationsClose ?? null;
}

/** A course as the API returns it, with its university's application details attached. */
function courseView(course, uni) {
  return {
    ...course,
    universityName: uni?.name ?? null,
    applicationUrl: uni?.applicationUrl ?? null,
    applicationsClose: closesFor(uni, course.faculty, course.closesOn),
  };
}

/** Rule summary for the course detail page ("best 6 subjects, LO not counted"). */
function ruleView(rule) {
  if (!rule) return null;
  return {
    subjectsCounted: rule.subjectsCounted,
    includeLo: rule.includeLo,
    mustCount: rule.mustCount ?? [],
    scoreLabel: rule.scoreLabel ?? 'APS',
    bands: rule.defaultBands,
  };
}

const list = (v) => (typeof v === 'string' && v.trim() ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);
const int = (v, def, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : def;
};
const ok = (body) => ({ status: 200, body });

export function createApi({ getCatalog, ping = async () => {}, applyingFor } = {}) {
  const routes = {
    async 'GET /health'() {
      try {
        await ping();
        const { intakeYear, courses } = await getCatalog();
        return ok({ status: 'ok', intakeYear, applyingFor: applyingFor ?? intakeYear, courses: courses.length });
      } catch {
        return { status: 503, body: { status: 'error', error: 'Database unavailable.' } };
      }
    },

    async 'GET /subjects'() { return ok((await getCatalog()).subjects); },

    async 'GET /universities'() { return ok((await getCatalog()).universities); },

    /** ?q=nursing&uni=UJ,WSU&type=bachelor&faculty=...&limit=50&offset=0 — every course, qualify or not. */
    async 'GET /courses'(query) {
      const catalog = await getCatalog();
      const unis = new Map(catalog.universities.map((u) => [u.shortName, u]));
      const { total, results } = searchCourses(catalog.courses, {
        q: typeof query.q === 'string' ? query.q.slice(0, 100) : '',
        universities: list(query.uni),
        qualificationType: typeof query.type === 'string' ? query.type : undefined,
        faculty: typeof query.faculty === 'string' ? query.faculty : undefined,
        limit: int(query.limit, 50, 200),
        offset: int(query.offset, 0, 100000),
        universityNames: Object.fromEntries([...unis].map(([k, u]) => [k, u.name])),
      });
      return ok({ total, results: results.map((c) => courseView(c, unis.get(c.universityShortName))) });
    },

    async 'GET /courses/facets'() { return ok(searchFacets((await getCatalog()).courses)); },

    async 'GET /courses/:id'(_query, _body, id) {
      const catalog = await getCatalog();
      const course = catalog.courses.find((c) => c.courseId === Number(id));
      if (!course) return { status: 404, body: { error: 'Course not found.' } };
      const uni = catalog.universities.find((u) => u.shortName === course.universityShortName);
      return ok({ ...courseView(course, uni), apsRule: ruleView(catalog.rules[course.universityShortName]) });
    },

    /** Body: { marks, courseIds: [12, 40] } — what to change to get into each course. */
    async 'POST /improve'(_query, body) {
      const catalog = await getCatalog();
      const { marks, courseIds } = body ?? {};
      const errors = validateMarks(marks, new Set(catalog.subjects.map((s) => s.name)));
      if (!Array.isArray(courseIds) || courseIds.length === 0 || !courseIds.every(Number.isInteger)) {
        errors.push('"courseIds" must be a list of course ids, e.g. [12, 40].');
      } else if (courseIds.length > MAX_PLAN_COURSES) {
        errors.push(`At most ${MAX_PLAN_COURSES} courses at a time.`);
      }
      if (errors.length) return { status: 400, body: { errors } };

      const byId = new Map(catalog.courses.map((c) => [c.courseId, c]));
      const plans = [];
      const notFound = [];
      for (const id of courseIds) {
        const course = byId.get(id);
        const rule = course && catalog.rules[course.universityShortName];
        if (!course || !rule) notFound.push(id);
        else plans.push(improvePlan(course, rule, marks));
      }
      return ok({ plans, notFound });
    },

    /** Body: { marks: { Mathematics: 65, ... }, universities: ["UJ"] (optional) } */
    async 'POST /eligibility'(_query, body) {
      const catalog = await getCatalog();
      const { marks, universities } = body ?? {};
      const errors = validateMarks(marks, new Set(catalog.subjects.map((s) => s.name)));
      if (universities !== undefined && !Array.isArray(universities)) {
        errors.push('"universities" must be a list of short names, e.g. ["UJ"].');
      }
      if (errors.length) return { status: 400, body: { errors } };

      const wanted = universities?.length ? new Set(universities) : null;
      const courses = wanted ? catalog.courses.filter((c) => wanted.has(c.universityShortName)) : catalog.courses;
      const rules = wanted
        ? Object.fromEntries(Object.entries(catalog.rules).filter(([u]) => wanted.has(u)))
        : catalog.rules;

      const { apsByUniversity, results } = evaluateAll(courses, rules, marks);
      const summary = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
      for (const r of results) summary[r.status] += 1;
      return ok({ intakeYear: catalog.intakeYear, apsByUniversity, summary, results });
    },
  };

  /** Route a request. `path` is relative to /api, e.g. "/courses/12". */
  async function handle(method, path, query = {}, body = undefined) {
    const exact = routes[`${method} ${path}`];
    if (exact) return exact(query, body);
    const m = path.match(/^\/courses\/(\d+)$/);
    if (method === 'GET' && m) return routes['GET /courses/:id'](query, body, m[1]);
    return { status: 404, body: { error: 'Not found.' } };
  }

  return { handle };
}
