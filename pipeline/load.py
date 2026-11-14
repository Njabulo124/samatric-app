"""
Load a validated prospectus extract into Postgres.

Usage:
    python -m pipeline.load data/extracted/2027/uj.json
    python -m pipeline.load data/extracted/2027/uj.json --dry-run
    python -m pipeline.load data/extracted/2027/uj.json --prune

Behaviour:
    - Part files (uj.part2.json, ...) are merged automatically, same as the validator.
    - Refuses to load anything that fails validation (warnings are fine).
    - One transaction: any error = nothing changes.
    - Idempotent: running twice gives the same database; unchanged courses are left alone.
    - Courses in the DB for this uni + year that are missing from the file are reported
      as "stale". They are only deleted with --prune.
    - --dry-run does everything, prints the summary, then rolls back.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.types.json import Jsonb

from pipeline.models import ApsScale, Course, ProspectusExtract
from pipeline.validate import db_reference_errors, load_extract, part_files


class DryRun(Exception):
    """Raised at the end of a dry run to force a rollback."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def upsert_scale(cur, scale: ApsScale) -> int:
    """Return scale_id. A scale with bands is created/replaced; without bands it must exist."""
    if scale.bands is None:
        row = cur.execute("SELECT scale_id FROM aps_scales WHERE name = %s", (scale.name,)).fetchone()
        return row[0]
    cur.execute("INSERT INTO aps_scales (name) VALUES (%s) ON CONFLICT (name) DO NOTHING", (scale.name,))
    scale_id = cur.execute("SELECT scale_id FROM aps_scales WHERE name = %s", (scale.name,)).fetchone()[0]
    cur.execute("DELETE FROM aps_scale_bands WHERE scale_id = %s", (scale_id,))
    cur.executemany(
        "INSERT INTO aps_scale_bands (scale_id, min_mark, max_mark, points) VALUES (%s, %s, %s, %s)",
        [(scale_id, b.min_mark, b.max_mark, b.points) for b in scale.bands],
    )
    return scale_id


def requirement_signature(groups) -> tuple:
    """Order-independent fingerprint of a course's requirements, for change detection."""
    return tuple(sorted(
        (desc, n, tuple(sorted(opts))) for desc, n, opts in groups
    ))


def existing_requirements(cur, course_id: int) -> tuple:
    rows = cur.execute(
        """
        SELECT g.group_id, g.description, g.min_count, s.name, o.min_percent
        FROM requirement_groups g
        JOIN requirement_options o ON o.group_id = g.group_id
        JOIN subjects s ON s.subject_id = o.subject_id
        WHERE g.course_id = %s
        """,
        (course_id,),
    ).fetchall()
    groups: dict[int, tuple[str, int, list]] = {}
    for gid, desc, n, subj, pct in rows:
        groups.setdefault(gid, (desc, n, []))[2].append((subj, pct))
    return requirement_signature(groups.values())


def new_requirements(course: Course) -> tuple:
    return requirement_signature(
        (g.description, g.min_count, [(o.subject, o.min_percent) for o in g.options]) for g in course.requirements
    )


def write_requirements(cur, course_id: int, course: Course, subject_ids: dict[str, int]) -> int:
    cur.execute("DELETE FROM requirement_groups WHERE course_id = %s", (course_id,))
    for g in course.requirements:
        gid = cur.execute(
            "INSERT INTO requirement_groups (course_id, description, min_count) VALUES (%s, %s, %s) RETURNING group_id",
            (course_id, g.description, g.min_count),
        ).fetchone()[0]
        cur.executemany(
            "INSERT INTO requirement_options (group_id, subject_id, min_percent) VALUES (%s, %s, %s)",
            [(gid, subject_ids[o.subject], o.min_percent) for o in g.options],
        )
    return len(course.requirements)


# ---------------------------------------------------------------------------
# Main load
# ---------------------------------------------------------------------------
def load(doc: ProspectusExtract, conn, prune: bool) -> dict:
    stats = {"inserted": 0, "updated": 0, "unchanged": 0, "stale": [], "pruned": 0, "groups": 0}
    year = doc.intake_year
    u = doc.university

    with conn.cursor() as cur:
        subject_ids = {n: i for i, n in cur.execute("SELECT subject_id, name FROM subjects")}

        # University
        uni_id = cur.execute(
            """
            INSERT INTO universities (name, short_name, institution_type, province,
                                      website_url, application_url, application_fee)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (short_name) DO UPDATE SET
                name = EXCLUDED.name, institution_type = EXCLUDED.institution_type,
                province = EXCLUDED.province, website_url = EXCLUDED.website_url,
                application_url = EXCLUDED.application_url, application_fee = EXCLUDED.application_fee
            RETURNING university_id
            """,
            (u.name, u.short_name, u.institution_type, u.province,
             u.website_url, u.application_url, u.application_fee),
        ).fetchone()[0]

        # Application periods: replace this year's set
        cur.execute("DELETE FROM application_periods WHERE university_id = %s AND intake_year = %s", (uni_id, year))
        cur.executemany(
            """INSERT INTO application_periods (university_id, intake_year, label, opens_on, closes_on, notes)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            [(uni_id, year, p.label, p.opens_on, p.closes_on, p.notes) for p in doc.application_periods],
        )

        # APS rule (+ subject-specific scales)
        rule = doc.aps_rule
        default_scale_id = upsert_scale(cur, rule.default_scale)
        rule_id = cur.execute(
            """
            INSERT INTO aps_rules (university_id, intake_year, default_scale_id, subjects_counted, include_lo,
                                   must_count, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (university_id, intake_year) DO UPDATE SET
                default_scale_id = EXCLUDED.default_scale_id, subjects_counted = EXCLUDED.subjects_counted,
                include_lo = EXCLUDED.include_lo, must_count = EXCLUDED.must_count, notes = EXCLUDED.notes
            RETURNING rule_id
            """,
            (uni_id, year, default_scale_id, rule.subjects_counted, rule.include_lo,
             Jsonb(rule.must_count), rule.notes),
        ).fetchone()[0]
        cur.execute("DELETE FROM aps_rule_subject_scales WHERE rule_id = %s", (rule_id,))
        for ss in rule.subject_scales:
            cur.execute(
                "INSERT INTO aps_rule_subject_scales (rule_id, subject_id, scale_id) VALUES (%s, %s, %s)",
                (rule_id, subject_ids[ss.subject], upsert_scale(cur, ss.scale)),
            )

        # Faculties
        cur.executemany(
            "INSERT INTO faculties (university_id, name) VALUES (%s, %s) ON CONFLICT (university_id, name) DO NOTHING",
            [(uni_id, f) for f in doc.faculties],
        )
        faculty_ids = {n: i for i, n in cur.execute(
            "SELECT faculty_id, name FROM faculties WHERE university_id = %s", (uni_id,))}

        # Courses
        for c in doc.courses:
            values = (uni_id, faculty_ids.get(c.faculty), c.name, c.qualification_type, c.is_extended,
                      c.duration_years, c.nsc_pass_required, c.min_aps, c.min_aps_maths_lit,
                      c.min_aps_tech_maths, year, c.source_ref, c.notes, c.include_lo, c.closes_on,
                      json.dumps([w.model_dump() for w in c.aps_weights]) if c.aps_weights else None,
                      c.aps_subjects_counted)
            existing = cur.execute(
                "SELECT course_id FROM courses WHERE university_id = %s AND name = %s AND prospectus_year = %s",
                (uni_id, c.name, year),
            ).fetchone()

            if existing is None:
                course_id = cur.execute(
                    """
                    INSERT INTO courses (university_id, faculty_id, name, qualification_type, is_extended,
                        duration_years, nsc_pass_required, min_aps, min_aps_maths_lit, min_aps_tech_maths,
                        prospectus_year, source_ref, notes, include_lo, closes_on, aps_weights, aps_subjects_counted)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    RETURNING course_id
                    """,
                    values,
                ).fetchone()[0]
                stats["groups"] += write_requirements(cur, course_id, c, subject_ids)
                stats["inserted"] += 1
                continue

            course_id = existing[0]
            # Update only if a column actually changed
            row_changed = cur.execute(
                """
                UPDATE courses SET faculty_id = %s, qualification_type = %s, is_extended = %s,
                    duration_years = %s, nsc_pass_required = %s, min_aps = %s, min_aps_maths_lit = %s,
                    min_aps_tech_maths = %s, source_ref = %s, notes = %s, include_lo = %s, closes_on = %s,
                    aps_weights = %s::jsonb, aps_subjects_counted = %s, is_active = TRUE
                WHERE course_id = %s
                  AND (faculty_id, qualification_type, is_extended, duration_years, nsc_pass_required,
                       min_aps, min_aps_maths_lit, min_aps_tech_maths, source_ref, notes, include_lo, closes_on,
                       aps_weights, aps_subjects_counted, is_active)
                      IS DISTINCT FROM
                      (%s::int, %s::varchar, %s::bool, %s::numeric, %s::varchar,
                       %s::smallint, %s::smallint, %s::smallint, %s::text, %s::text, %s::bool, %s::date, %s::jsonb, %s::smallint, TRUE)
                RETURNING course_id
                """,
                values[1:2] + values[3:10] + values[11:] + (course_id,) + values[1:2] + values[3:10] + values[11:],
            ).fetchone() is not None
            reqs_changed = existing_requirements(cur, course_id) != new_requirements(c)
            if reqs_changed:
                write_requirements(cur, course_id, c, subject_ids)
            stats["groups"] += len(c.requirements)
            stats["updated" if (row_changed or reqs_changed) else "unchanged"] += 1

        # Stale courses: in DB for this uni/year but not in the file
        names = [c.name for c in doc.courses]
        stale = cur.execute(
            """SELECT course_id, name FROM courses
               WHERE university_id = %s AND prospectus_year = %s AND NOT (name = ANY(%s))""",
            (uni_id, year, names),
        ).fetchall()
        stats["stale"] = [n for _, n in stale]
        if prune and stale:
            cur.execute("DELETE FROM courses WHERE course_id = ANY(%s)", ([i for i, _ in stale],))
            stats["pruned"] = len(stale)

    return stats


def main() -> int:
    ap = argparse.ArgumentParser(description="Load a prospectus extract into Postgres.")
    ap.add_argument("path", type=Path)
    ap.add_argument("--dry-run", action="store_true", help="run everything, then roll back")
    ap.add_argument("--prune", action="store_true", help="delete stale courses for this uni + year")
    args = ap.parse_args()

    print(f"\n== {args.path} ==")
    parts = part_files(args.path)
    if parts:
        print("merged parts:", ", ".join(p.name for p in parts))

    doc, errors = load_extract(args.path)
    if doc is not None:
        errors += db_reference_errors(doc)
    if errors:
        print(f"\nNOT LOADED: {len(errors)} validation error(s). Run pipeline.validate for details.")
        for e in errors[:10]:
            print(f"  x {e}")
        return 1

    load_dotenv()
    try:
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            try:
                with conn.transaction():
                    stats = load(doc, conn, args.prune)
                    if args.dry_run:
                        raise DryRun
            except DryRun:
                pass
    except psycopg.Error as e:
        print(f"\nNOT LOADED: database error, nothing was changed.\n  {e}")
        return 1

    tag = " (DRY RUN - rolled back)" if args.dry_run else ""
    print(f"\n{doc.university.short_name} {doc.intake_year}{tag}")
    print(f"  courses inserted : {stats['inserted']}")
    print(f"  courses updated  : {stats['updated']}")
    print(f"  courses unchanged: {stats['unchanged']}")
    print(f"  requirement groups: {stats['groups']}")
    if stats["stale"]:
        verb = "pruned" if args.prune else "stale (in DB, not in file; use --prune to delete)"
        print(f"  {len(stats['stale'])} {verb}:")
        for n in stats["stale"][:20]:
            print(f"    - {n}")
    print("\nRESULT:", "DRY RUN OK" if args.dry_run else "LOADED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
