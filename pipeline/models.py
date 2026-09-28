"""
Data contract for prospectus extraction.

The AI extractor must output JSON matching `ProspectusExtract`.
Everything here is structural validation only (no database needed).
Reference checks (e.g. subject names exist) live in validate.py.

Export the JSON Schema:  python -m pipeline.models > pipeline/schema.json
"""
from __future__ import annotations

import json
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

STANDARD_SCALE = "NSC standard 7-point"


class StrictModel(BaseModel):
    # Reject unknown keys so typos like "min_percentage" fail loudly.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---------------------------------------------------------------------------
# University + application periods
# ---------------------------------------------------------------------------
class University(StrictModel):
    name: str = Field(min_length=3)
    short_name: str = Field(min_length=2, max_length=20)
    institution_type: Literal[
        "traditional", "comprehensive", "university_of_technology", "tvet", "private"
    ]
    province: Optional[str] = None
    website_url: Optional[str] = None
    application_url: Optional[str] = None
    application_fee: Optional[float] = Field(default=None, ge=0)


class ApplicationPeriod(StrictModel):
    label: str = "General"
    opens_on: Optional[date] = None
    closes_on: Optional[date] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _dates_in_order(self):
        if self.opens_on and self.closes_on and self.closes_on < self.opens_on:
            raise ValueError(f"'{self.label}': closes_on is before opens_on")
        return self


# ---------------------------------------------------------------------------
# APS scales and rules
# ---------------------------------------------------------------------------
class ScaleBand(StrictModel):
    min_mark: int = Field(ge=0, le=100)
    max_mark: int = Field(ge=0, le=100)
    points: float = Field(ge=0)

    @model_validator(mode="after")
    def _min_le_max(self):
        if self.min_mark > self.max_mark:
            raise ValueError(f"band {self.min_mark}-{self.max_mark}: min_mark > max_mark")
        return self


class ApsScale(StrictModel):
    """Either a reference to an existing scale (bands omitted) or a new scale (bands given)."""
    name: str
    bands: Optional[list[ScaleBand]] = None

    @model_validator(mode="after")
    def _bands_cover_0_to_100(self):
        if self.bands is None:
            return self
        bands = sorted(self.bands, key=lambda b: b.min_mark)
        if bands[0].min_mark != 0 or bands[-1].max_mark != 100:
            raise ValueError(f"scale '{self.name}': bands must cover 0 to 100")
        for a, b in zip(bands, bands[1:]):
            if b.min_mark != a.max_mark + 1:
                raise ValueError(
                    f"scale '{self.name}': gap/overlap between {a.min_mark}-{a.max_mark} "
                    f"and {b.min_mark}-{b.max_mark}"
                )
        return self


class SubjectScale(StrictModel):
    subject: str
    scale: ApsScale


class ApsRule(StrictModel):
    default_scale: ApsScale
    subjects_counted: int = Field(default=6, ge=1, le=9)
    include_lo: bool = False
    subject_scales: list[SubjectScale] = []
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Courses and requirements ("AND of ORs")
# ---------------------------------------------------------------------------
class RequirementOption(StrictModel):
    subject: str
    min_percent: int = Field(ge=0, le=100)


class RequirementGroup(StrictModel):
    description: str
    options: list[RequirementOption] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_subjects(self):
        names = [o.subject for o in self.options]
        if len(names) != len(set(names)):
            raise ValueError(f"group '{self.description}': duplicate subject in options")
        return self


class Course(StrictModel):
    name: str = Field(min_length=3)
    faculty: Optional[str] = None
    qualification_type: Literal[
        "higher_certificate", "diploma", "advanced_diploma", "bachelor", "other"
    ]
    is_extended: bool = False
    duration_years: Optional[float] = Field(default=None, gt=0, le=10)
    nsc_pass_required: Optional[Literal["bachelor", "diploma", "higher_certificate"]] = None
    min_aps: Optional[int] = Field(default=None, ge=0, le=60)
    min_aps_maths_lit: Optional[int] = Field(default=None, ge=0, le=60)   # None = not accepted
    min_aps_tech_maths: Optional[int] = Field(default=None, ge=0, le=60)  # None = not accepted
    source_ref: Optional[str] = None
    notes: Optional[str] = None
    requirements: list[RequirementGroup] = []


class Ambiguity(StrictModel):
    item: str
    issue: str
    choice: str


# ---------------------------------------------------------------------------
# Top-level document: one university, one intake year
# ---------------------------------------------------------------------------
class ProspectusExtract(StrictModel):
    intake_year: int = Field(ge=2020, le=2100)
    source_document: str
    university: University
    application_periods: list[ApplicationPeriod] = []
    aps_rule: ApsRule
    faculties: list[str] = []
    courses: list[Course] = Field(min_length=1)
    ambiguities: list[Ambiguity] = []

    @model_validator(mode="after")
    def _cross_checks(self):
        errors = []
        names = [c.name for c in self.courses]
        dupes = {n for n in names if names.count(n) > 1}
        if dupes:
            errors.append(f"duplicate course names: {sorted(dupes)}")
        faculties = set(self.faculties)
        for c in self.courses:
            if c.faculty and c.faculty not in faculties:
                errors.append(f"course '{c.name}': faculty '{c.faculty}' not in faculties list")
        if errors:
            raise ValueError("; ".join(errors))
        return self


if __name__ == "__main__":
    print(json.dumps(ProspectusExtract.model_json_schema(), indent=2))
