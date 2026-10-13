# Adding a university or updating for a new year

Prospectuses change every year. The pipeline makes updates repeatable: extract → validate → dry run → load → check → commit.

## 1. Get the prospectus

Download the official undergraduate prospectus PDF from the university's website. Note the exact title and year. It goes in `source_document`.

## 2. Extract to JSON

Extraction is done with an AI chat, **one faculty at a time** (large PDFs lose accuracy). Give it `pipeline/schema.json` and the prompt below.

<details>
<summary>Extraction prompt</summary>

```
Extract undergraduate admission requirements from the attached prospectus pages into JSON
matching the attached schema (pipeline/schema.json). Rules:

- Output only JSON. One object for the first faculty (with university, aps_rule,
  application_periods, faculties). For later faculties, output only a JSON array of courses.
- Subject names must match the NSC subject list exactly
  (e.g. "English Home Language", "Mathematical Literacy", "Technical Mathematics").
- qualification_type: bachelor | diploma | advanced_diploma | higher_certificate | other.
  Never "Bachelor's Degree" or "Diploma".
- min_aps = APS with Mathematics. min_aps_maths_lit / min_aps_tech_maths = APS with that maths
  type, or null if it is not accepted.
- Requirement groups are AND of ORs. Alternatives ("Maths or Tech Maths") are options in ONE
  group. For "any two of these subjects", use ONE group with all the options and
  "min_count": 2. Never use pairs or leave-one-out groups.
- "include_lo": true only when the prospectus says Life Orientation counts in the APS for
  that programme only.
- source_ref = page number, e.g. "p.17".
- Anything unclear: make the most reasonable choice and record it in "ambiguities"
  (item, issue, choice). Never guess silently.
```
</details>

Save it as `data/extracted/<year>/<short>.json`, then later faculties as `<short>.part2.json`, `<short>.part3.json` and so on.

### Common extractor mistakes to fix

| Mistake | Fix |
|---|---|
| `"Bachelor's Degree"`, `"Diploma"` | `bachelor`, `diploma` |
| "Any two of" written as pairs | One group with `min_count` |
| Maths Lit in a requirement but `min_aps_maths_lit` is null | Check the prospectus. Either it's not accepted (remove the option) or it needs an APS. |
| Subject name not in the seed list | Use the exact seed name |
| Faculty not in the `faculties` list | Add it to the main file |

## 3. Validate

```powershell
python -m pipeline.validate data/extracted/2027/wsu.json
```

- **Errors** must be fixed. Nothing loads until they are.
- **Warnings** need a human look (e.g. "Maths Lit in requirements but min_aps_maths_lit is NULL").
- **Ambiguities** are the extractor's own doubts. Check each one against the PDF.

## 4. Dry run, then load

```powershell
python -m pipeline.load data/extracted/2027/wsu.json --dry-run
python -m pipeline.load data/extracted/2027/wsu.json
```

The loader prints what changed:

| Line | Meaning |
|---|---|
| `courses inserted` | New courses |
| `courses updated` | APS, requirements or details changed. This is the year-on-year diff. |
| `courses unchanged` | Same as in the database |
| `stale` | In the database but not in the file (renamed or discontinued). Removed only with `--prune`. |

Loading is one transaction (an error changes nothing) and is idempotent (loading twice does nothing the second time).

For a renamed course, load, check the stale list, then run with `--prune` once you're sure.

## 5. Check

1. **Restart the server** (`npm start`). It caches data at startup.
2. Run a few learners through it:
   ```powershell
   cd backend
   npm run check -- samples/strong-science.json --uni WSU
   npm run check -- samples/maths-lit-commerce.json --uni WSU --show qualifies,close
   ```
3. Spot-check 3–5 courses against the PDF (APS, subjects, percentages).
4. **Application link check:** open `application_url` in an **incognito window**. It must open the real application form without being signed in. A link that only works while signed in is the wrong link.
5. Confirm the closing date is in `application_periods`.

## 6. Commit

One commit per university or faculty keeps the history readable:

```powershell
git add data/extracted/2027/wsu.part7.json
git commit -m "data(wsu): 2027 Natural Sciences, 11 courses"
```

| Prefix | Use for |
|---|---|
| `data(<uni>):` | Extracted prospectus data |
| `feat:` | New app features |
| `fix:` | Bug fixes (code or data) |
| `docs:` | Documentation |
| `db:` | Schema or migration changes |

## New intake year checklist

- [ ] Create `data/extracted/<new year>/`
- [ ] Re-extract each university from the new prospectus (start from last year's file and correct it, which is faster than starting from scratch)
- [ ] Validate, dry run and load each university
- [ ] Review the `updated` list: these are the year-on-year changes
- [ ] Review `stale` and `--prune`
- [ ] Set `INTAKE_YEAR` for the server (default 2027)
- [ ] Incognito check on every `application_url`
- [ ] Commit
