"""
Validate an extracted prospectus JSON file.

Usage:
    python -m pipeline.validate data/extracted/2027/wsu.json
    python -m pipeline.validate data/extracted/2027/wsu.json --no-db

Part files next to the main file (wsu.part2.json, wsu.part3.json, ...) are
JSON arrays of courses and get merged into the main file automatically.

Layers:
    1. Structure  - pydantic model (types, ranges, duplicates, faculties)
    2. Reference  - subjects and existing scales must exist in Postgres
    3. Warnings   - suspicious but legal data, for human review

Exit code 0 = valid (warnings allowed), 1 = errors.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from pydantic import ValidationError

from pipeline.models import ProspectusExtract

MATHS_LIT = "Mathematical Literacy"
TECH_MATHS = "Technical Mathematics"
MATHS_TYPES = {"Mathematics", MATHS_LIT, TECH_MATHS}


# ---------------------------------------------------------------------------
# Layer 1: structure
# ---------------------------------------------------------------------------
def part_files(path: Path) -> list[Path]:
    """Sibling part files for a main file, e.g. uj.json -> uj.part2.json, uj.part3.json (numeric order)."""
    def num(p: Path) -> int:
        m = re.search(r"\.part(\d+)$", p.stem)
        return int(m.group(1)) if m else 0
    return sorted(path.parent.glob(f"{path.stem}.part*.json"), key=num)


def load_raw(path: Path) -> tuple[dict | None, list[str], list[Path]]:
    """Load a main file and merge its part files' course arrays into it."""
    parts = part_files(path)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return None, [f"{path.name}: invalid JSON: {e}"], parts
    errors = []
    for p in parts:
        try:
            extra = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{p.name}: invalid JSON: {e}")
            continue
        if not isinstance(extra, list):
            errors.append(f"{p.name}: part files must be a JSON array of courses")
            continue
        raw.setdefault("courses", []).extend(extra)
    return raw, errors, parts


def load_extract(path: Path) -> tuple[ProspectusExtract | None, list[str]]:
    raw, errors, _ = load_raw(path)
    if raw is None or errors:
        return None, errors
    try:
        return ProspectusExtract.model_validate(raw), []
    except ValidationError as e:
        errors = []
        for err in e.errors():
            loc = ".".join(str(p) for p in err["loc"])
            errors.append(f"{loc}: {err['msg']}")
        return None, errors


# ---------------------------------------------------------------------------
# Layer 2: reference checks against the database
# ---------------------------------------------------------------------------
def db_reference_errors(doc: ProspectusExtract) -> list[str]:
    import psycopg
    from dotenv import load_dotenv

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        return ["DATABASE_URL not set (add it to .env or use --no-db)"]

    try:
        with psycopg.connect(url) as conn:
            subjects = {r[0] for r in conn.execute("SELECT name FROM subjects")}
            scales = {r[0] for r in conn.execute("SELECT name FROM aps_scales")}
    except psycopg.OperationalError as e:
        return [f"can't connect to database: {str(e).strip().splitlines()[0]}"]

    errors = []
    used: list[tuple[str, str]] = []  # (where, subject)
    for c in doc.courses:
        for g in c.requirements:
            for o in g.options:
                used.append((f"course '{c.name}' / group '{g.description}'", o.subject))
        for w in c.aps_weights or []:
            for subj in w.subjects:
                used.append((f"course '{c.name}' / aps_weights", subj))
    for ss in doc.aps_rule.subject_scales:
        used.append(("aps_rule.subject_scales", ss.subject))
    for slot in doc.aps_rule.must_count:
        for subj in slot:
            used.append(("aps_rule.must_count", subj))

    for where, subj in used:
        if subj not in subjects:
            errors.append(f"{where}: unknown subject '{subj}'")

    # A scale without bands must already exist in the DB.
    all_scales = [doc.aps_rule.default_scale] + [s.scale for s in doc.aps_rule.subject_scales]
    for sc in all_scales:
        if sc.bands is None and sc.name not in scales:
            errors.append(f"scale '{sc.name}' has no bands and doesn't exist in the database")
    return errors


# ---------------------------------------------------------------------------
# Layer 3: warnings (legal but worth a human look)
# ---------------------------------------------------------------------------
def warnings_for(doc: ProspectusExtract) -> list[str]:
    warns = []
    for c in doc.courses:
        subjects = {o.subject for g in c.requirements for o in g.options}
        if not c.requirements:
            warns.append(f"'{c.name}': no subject requirements")
        if c.min_aps is None:
            warns.append(f"'{c.name}': min_aps is missing")
        no_aps = c.min_aps is None and c.min_aps_maths_lit is None and c.min_aps_tech_maths is None
        if MATHS_LIT in subjects and c.min_aps_maths_lit is None and not no_aps:
            warns.append(f"'{c.name}': Maths Lit is in requirements but min_aps_maths_lit is NULL")
        # A "maths group" is a single-choice group whose options are ALL maths types.
        # Groups that also allow non-maths subjects (e.g. "Maths or Life Sciences") can be
        # met without Maths, so they don't exclude Maths Lit / Tech Maths learners.
        maths_groups = [{o.subject for o in g.options} for g in c.requirements
                        if g.min_count == 1 and {o.subject for o in g.options} <= MATHS_TYPES]
        if c.min_aps_maths_lit is not None and any(MATHS_LIT not in g for g in maths_groups):
            warns.append(f"'{c.name}': min_aps_maths_lit is set but a maths requirement excludes Maths Lit")
        if TECH_MATHS in subjects and c.min_aps_tech_maths is None and not no_aps:
            warns.append(f"'{c.name}': Tech Maths is in requirements but min_aps_tech_maths is NULL")
        if c.min_aps_tech_maths is not None and any(TECH_MATHS not in g for g in maths_groups):
            warns.append(f"'{c.name}': min_aps_tech_maths is set but a maths requirement excludes Tech Maths")
        if c.qualification_type == "bachelor" and c.nsc_pass_required not in (None, "bachelor"):
            warns.append(f"'{c.name}': bachelor degree but nsc_pass_required = '{c.nsc_pass_required}'")
        if c.faculty is None:
            warns.append(f"'{c.name}': no faculty")
    if not doc.application_periods:
        warns.append("no application periods (open/close dates)")
    return warns


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Validate a prospectus extract JSON file.")
    ap.add_argument("path", type=Path)
    ap.add_argument("--no-db", action="store_true", help="skip database reference checks")
    args = ap.parse_args()

    doc, errors = load_extract(args.path)
    if doc is not None and not args.no_db:
        errors += db_reference_errors(doc)

    print(f"\n== {args.path} ==")
    parts = part_files(args.path)
    if parts:
        print("merged parts:", ", ".join(p.name for p in parts))
    if doc is not None:
        groups = sum(len(c.requirements) for c in doc.courses)
        print(f"{doc.university.short_name} {doc.intake_year}: "
              f"{len(doc.faculties)} faculties, {len(doc.courses)} courses, {groups} requirement groups")

    if errors:
        print(f"\nERRORS ({len(errors)}):")
        for e in errors:
            print(f"  x {e}")
    if doc is not None:
        warns = warnings_for(doc)
        if warns:
            print(f"\nWARNINGS ({len(warns)}):")
            for w in warns:
                print(f"  ! {w}")
        if doc.ambiguities:
            print(f"\nAMBIGUITIES FROM EXTRACTOR ({len(doc.ambiguities)}):")
            for a in doc.ambiguities:
                print(f"  ? {a.item}: {a.issue} -> {a.choice}")

    print("\nRESULT:", "FAILED" if errors else "OK")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
