/**
 * Database access: loads APS rules and courses in the shapes the eligibility engine expects.
 */
import pg from 'pg';

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is not set (see .env.example at the repo root).');
  return new pg.Pool({ connectionString });
}

const BANDS_SQL = `
  SELECT min_mark AS min, max_mark AS max, points::float AS points
  FROM aps_scale_bands WHERE scale_id = $1 ORDER BY min_mark`;

/** APS rules for an intake year, keyed by university short name. */
export async function loadRules(db, intakeYear, { universities } = {}) {
  const { rows } = await db.query(
    `SELECT r.rule_id, r.default_scale_id, r.subjects_counted, r.include_lo, r.must_count, u.short_name
     FROM aps_rules r JOIN universities u USING (university_id)
     WHERE r.intake_year = $1 AND u.is_active
       AND ($2::text[] IS NULL OR u.short_name = ANY($2))`,
    [intakeYear, universities?.length ? universities : null],
  );
  const rules = {};
  for (const r of rows) {
    const defaultBands = (await db.query(BANDS_SQL, [r.default_scale_id])).rows;
    const subjectBands = {};
    const special = await db.query(
      `SELECT s.name, rs.scale_id FROM aps_rule_subject_scales rs
       JOIN subjects s USING (subject_id) WHERE rs.rule_id = $1`,
      [r.rule_id],
    );
    for (const sp of special.rows) subjectBands[sp.name] = (await db.query(BANDS_SQL, [sp.scale_id])).rows;
    rules[r.short_name] = {
      subjectsCounted: r.subjects_counted,
      includeLo: r.include_lo,
      mustCount: r.must_count ?? [],
      defaultBands,
      subjectBands,
    };
  }
  return rules;
}

/** Active courses for an intake year, with requirements attached. */
export async function loadCourses(db, intakeYear, { universities } = {}) {
  const uniParam = universities?.length ? universities : null;
  const { rows: courses } = await db.query(
    `SELECT c.course_id, c.name, u.short_name, f.name AS faculty, c.min_aps, c.min_aps_maths_lit,
            c.min_aps_tech_maths, c.notes, c.qualification_type, c.is_extended, c.include_lo,
            c.duration_years::float AS duration_years, c.nsc_pass_required, c.source_ref
     FROM courses c
     JOIN universities u USING (university_id)
     LEFT JOIN faculties f USING (faculty_id)
     WHERE c.prospectus_year = $1 AND c.is_active
       AND ($2::text[] IS NULL OR u.short_name = ANY($2))`,
    [intakeYear, uniParam],
  );
  const { rows: opts } = await db.query(
    `SELECT g.course_id, g.group_id, g.description, g.min_count, s.name AS subject, o.min_percent
     FROM requirement_groups g
     JOIN requirement_options o USING (group_id)
     JOIN subjects s USING (subject_id)
     JOIN courses c ON c.course_id = g.course_id
     WHERE c.prospectus_year = $1
     ORDER BY g.group_id`,
    [intakeYear],
  );

  const groupsByCourse = new Map();
  for (const o of opts) {
    if (!groupsByCourse.has(o.course_id)) groupsByCourse.set(o.course_id, new Map());
    const groups = groupsByCourse.get(o.course_id);
    if (!groups.has(o.group_id)) groups.set(o.group_id, { description: o.description, minCount: o.min_count, options: [] });
    groups.get(o.group_id).options.push({ subject: o.subject, minPercent: o.min_percent });
  }

  return courses.map((c) => ({
    courseId: c.course_id,
    name: c.name,
    universityShortName: c.short_name,
    faculty: c.faculty,
    qualificationType: c.qualification_type,
    isExtended: c.is_extended,
    minAps: c.min_aps,
    minApsMathsLit: c.min_aps_maths_lit,
    minApsTechMaths: c.min_aps_tech_maths,
    includeLo: c.include_lo,
    durationYears: c.duration_years,
    nscPassRequired: c.nsc_pass_required,
    sourceRef: c.source_ref,
    notes: c.notes,
    requirements: [...(groupsByCourse.get(c.course_id)?.values() ?? [])],
  }));
}

/** All subjects, for the marks-entry dropdown. */
export async function loadSubjects(db) {
  const { rows } = await db.query(
    `SELECT name, subject_group AS "group", is_designated AS "isDesignated"
     FROM subjects ORDER BY subject_group, name`,
  );
  return rows;
}

/** Universities that have data for the intake year, with application info. */
export async function loadUniversities(db, intakeYear) {
  const { rows } = await db.query(
    `SELECT u.short_name AS "shortName", u.name, u.province, u.website_url AS "websiteUrl",
            u.application_url AS "applicationUrl", u.application_fee::float AS "applicationFee",
            -- The general closing date; faculty-specific dates (e.g. Vet Science) only if there is no general one
            (SELECT p.closes_on::text FROM application_periods p
              WHERE p.university_id = u.university_id AND p.intake_year = $1 AND p.closes_on IS NOT NULL
              ORDER BY (p.label = 'General') DESC, p.closes_on
              LIMIT 1) AS "applicationsClose",
            COUNT(c.course_id)::int AS "courseCount"
     FROM universities u
     JOIN courses c ON c.university_id = u.university_id AND c.prospectus_year = $1 AND c.is_active
     WHERE u.is_active
     GROUP BY u.university_id
     ORDER BY u.name`,
    [intakeYear],
  );
  return rows;
}

/** Everything the API needs, loaded once and cached by the caller. */
export async function loadCatalog(db, intakeYear) {
  const [subjects, universities, rules, courses] = await Promise.all([
    loadSubjects(db),
    loadUniversities(db, intakeYear),
    loadRules(db, intakeYear),
    loadCourses(db, intakeYear),
  ]);
  return { intakeYear, subjects, universities, rules, courses };
}
