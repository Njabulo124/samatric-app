# Data model

## Tables

| Table | What it holds |
|---|---|
| `subjects` | NSC subjects (seeded). Names must match exactly in the extracted data. |
| `universities` | Name, short name, province, website, **application form link**, fee |
| `application_periods` | Open and close dates per intake year (can be per faculty) |
| `faculties` | Faculties per university |
| `aps_scales` / `aps_scale_bands` | Mark → points tables (e.g. NSC 7-point, WSU 8-point) |
| `aps_rules` | How one university calculates APS for one intake year |
| `aps_rule_subject_scales` | A different scale for a specific subject (e.g. LO) |
| `courses` | One row per programme per prospectus year, with minimum APS values and an optional own closing date |
| `requirement_groups` | Subject requirements for a course, grouped |
| `requirement_options` | The subjects (and minimum %) inside a group |
| `users` / `user_marks` | Reserved for learner accounts later |

## APS rules

| Field | Meaning | UJ | WSU |
|---|---|---|---|
| `default_scale` | Mark → points table | NSC 7-point | WSU 8-point (90–100 = 8) |
| `subjects_counted` | How many subjects count | 6 | 6 |
| `include_lo` | Life Orientation counts? | No | No |
| `must_count` | Subjects always counted first | (none) | English HL or FAL |
| `subject_scales` | Per-subject scale overrides | (none) | (none) |

### How APS is calculated for a course

1. Drop Life Orientation, unless the rule (or the course) includes it.
2. **Lock in** the university's `must_count` subjects, picking the best option in each slot.
3. **Lock in** the course's required subjects: for each requirement group, the best `min_count` subjects.
4. **Fill** the remaining places with the learner's best other subjects.

A learner with exactly 6 subjects (plus LO) gets the same APS for every course. With 7 or more subjects, the APS can differ between courses, because each course locks in different required subjects.

The API also returns `apsWorking`, the counted subjects with their points and whether each was locked. The UI uses it to show the working.

### Maths type

| Learner takes | Threshold used | If it's empty (null) |
|---|---|---|
| Mathematics | `min_aps` | "Confirm with the university" |
| Mathematical Literacy | `min_aps_maths_lit` | Not accepted for this course |
| Technical Mathematics | `min_aps_tech_maths` | Not accepted for this course |

### Course-level Life Orientation

`courses.include_lo = true` means LO counts as an **extra** subject for that course only, e.g. WSU B.Ed Foundation Phase counts 7 subjects including LO. `false` removes LO for that course where the university counts it, e.g. SMU counts LO but its Emergency Medical Care totals do not. `null` means the university's rule applies.

`courses.aps_weights` subjects counted more than once in this course's score, e.g. UCT Science `[{"subjects": ["Mathematics"], "weight": 2}, {"subjects": ["Physical Sciences", "Information Technology", "Life Sciences"], "weight": 2}]`. `subjects` are alternatives in priority order; the first one the learner counts gets the weight. NULL = no weighting.

`courses.aps_subjects_counted` how many subjects make up this course's score when it differs from the university rule, e.g. CPUT Method 2 (Maths x2, Physical Sciences x2, English and one more) counts 4. NULL = the university rule.

## Requirement groups ("AND of ORs")

Every group must pass. A group passes when **at least `min_count`** of its options are met.

| Prospectus says | Encode as |
|---|---|
| English 50% | 1 group, 1 option |
| Mathematics 60% or Technical Maths 60% | 1 group, 2 options, `min_count: 1` |
| Any two of Accounting, Business Studies, Economics at 50% | **1 group**, 3 options, `min_count: 2` |
| English 50% and Mathematics 50% | 2 groups |

For "any two of" rules, never use pairs or leave-one-out groups. Use one group with `min_count`. Pairs over-lock subjects in the APS and give confusing reasons.

## Statuses

| Status | Meaning |
|---|---|
| `qualifies` | Meets the APS and every subject requirement |
| `check` | Meets everything we can check, but the prospectus gives no APS for this maths type. Confirm with the university. |
| `close` | No more than **2 APS points** short and no more than **5%** short on each subject. Shows the exact gaps. |
| `not_eligible` | Further off, a required subject is missing, or the maths type isn't accepted |

The limits are in `CLOSE_LIMITS` in `backend/src/eligibility.js`.

## Extracted JSON format

One main file per university per year (`data/extracted/<year>/<short>.json`). Large prospectuses are split into **part files** (`<short>.part2.json`, ...). Each part file is a JSON array of courses. The full contract is in `pipeline/models.py` (JSON Schema: `pipeline/schema.json`).

```json
{
  "intake_year": 2027,
  "source_document": "WSU Undergraduate Prospectus 2027",
  "university": {
    "name": "Walter Sisulu University", "short_name": "WSU",
    "institution_type": "comprehensive", "province": "Eastern Cape",
    "website_url": "https://www.wsu.ac.za",
    "application_url": "https://applications.wsu.ac.za/"
  },
  "application_periods": [{ "label": "General", "opens_on": null, "closes_on": null }],
  "aps_rule": {
    "default_scale": { "name": "WSU NSC 8-point", "bands": [ ... ] },
    "subjects_counted": 6, "include_lo": false,
    "must_count": [["English Home Language", "English First Additional Language"]]
  },
  "faculties": ["Faculty of Education"],
  "courses": [{
    "name": "Bachelor of Education in Senior Phase & FET Teaching (Economic & Management Science)",
    "faculty": "Faculty of Education",
    "qualification_type": "bachelor",
    "duration_years": 4,
    "nsc_pass_required": "bachelor",
    "min_aps": 24, "min_aps_maths_lit": 24, "min_aps_tech_maths": null,
    "source_ref": "Prospectus 2027 p.9",
    "requirements": [
      { "description": "Mathematics or Mathematical Literacy",
        "options": [
          { "subject": "Mathematics", "min_percent": 30 },
          { "subject": "Mathematical Literacy", "min_percent": 50 } ] },
      { "description": "Two of Accounting, Business Studies, Economics",
        "min_count": 2,
        "options": [
          { "subject": "Accounting", "min_percent": 50 },
          { "subject": "Business Studies", "min_percent": 50 },
          { "subject": "Economics", "min_percent": 50 } ] }
    ]
  }],
  "ambiguities": [{ "item": "...", "issue": "...", "choice": "..." }]
}
```

The course above is shortened (the real one also has English and African-language groups).

| Field | Allowed values |
|---|---|
| `qualification_type` | `higher_certificate`, `diploma`, `advanced_diploma`, `bachelor`, `other` |
| `closes_on` (course, optional) | `YYYY-MM-DD`: the programme's own closing date (e.g. every TUT programme). Leave out to use the faculty's or the general date. |
| `nsc_pass_required` | `bachelor`, `diploma`, `higher_certificate`, or null |
| `institution_type` | `traditional`, `comprehensive`, `university_of_technology`, `tvet`, `private` |

Unknown keys are rejected, so typos fail loudly.
