# SAMATRIC APP

Find out which South African university courses a matric learner qualifies for.

A learner enters their matric marks once. The app then:

1. Calculates their **APS for each university**, using that university's own rules (scale, number of subjects, whether Life Orientation counts, subjects that must be counted).
2. Sorts every course into **qualifies / within reach / confirm with the university / not yet**.
3. For courses within reach, shows the **exact gap**: "APS 2 short" or "Mathematics 55%, need 60%".
4. Links straight to each university's **online application form** and shows the closing date.

> Admission requirements come from each university's official prospectus. Always confirm with the university before applying.

---

## Data coverage (2027 intake)

| University | Courses | Source |
|---|---|---|
| University of Johannesburg (UJ) | 179 | UJ Undergraduate Prospectus 2027 |
| Walter Sisulu University (WSU) | 68 | WSU Undergraduate Prospectus 2027 |
| University of Pretoria (UP) | 120 | UP Undergraduate Prospectus 2027 |
| Tshwane University of Technology (TUT) | 124 | TUT First Year Course Information 2027 |
| University of KwaZulu-Natal (UKZN) | 70 | UKZN Undergraduate Prospectus 2027 |
| University of Fort Hare (UFH) | 52 | UFH Undergraduate Study Guide 2027 |
| Durban University of Technology (DUT) | 95 | DUT Study Opportunities 2027 |
| University of the Witwatersrand (Wits) | 60 | Wits Grade 12 presentation (2026 intake; confirm 2027 on wits.ac.za) |
| Mangosuthu University of Technology (MUT) | 40 | CAO Handbook 2027 |
| University of Zululand (UNIZULU) | 145 | CAO Handbook 2027 |
| Vaal University of Technology (VUT) | 49 | VUT 2027 Undergraduate Minimum Admission Requirements |
| North-West University (NWU) | 240 | NWU 2027 Grade 12 Prospectus |
| University of Limpopo (UL) | 54 | UL Undergraduate Prospectus 2027 |
| Sefako Makgatho Health Sciences University (SMU) | 17 | SMU Prospectus 2026/2027 |
| University of Venda (UNIVEN) | 77 | UNIVEN 2027 Undergraduate Programmes |
| University of Mpumalanga (UMP) | 20 | UMP Undergraduate Programmes brochure |
| **Total** | **1,410** | |

---

## Tech stack

| Part | Technology |
|---|---|
| Database | PostgreSQL 18 |
| Data pipeline | Python 3.13 (Pydantic, psycopg) |
| API | Node.js 22+ and Express 5 |
| Frontend | Plain HTML, CSS and JavaScript (no build step) |
| Tests | Node's built-in test runner |

---

## Quick start (Windows, PowerShell)

Full step-by-step guide: [docs/setup.md](docs/setup.md).

```powershell
# 1. Database
createdb -U postgres samatric
psql -U postgres -d samatric -f database/schema.sql
psql -U postgres -d samatric -f database/seeds/01_subjects.sql
psql -U postgres -d samatric -f database/seeds/02_aps_scales.sql

# 2. Config: copy and add your Postgres password (never commit .env)
Copy-Item .env.example .env

# 3. Load prospectus data
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r pipeline/requirements.txt
python -m pipeline.load data/extracted/2027/uj.json
python -m pipeline.load data/extracted/2027/wsu.json

# 4. Run
cd backend
npm install
npm test
npm start          # http://localhost:5000
```

---

## Project layout

```
backend/        Express API + eligibility engine
  src/aps.js          APS calculation
  src/eligibility.js  Qualifies / close / not eligible logic
  src/search.js       Course search (abbreviations like BCom, LLB, IT)
  src/improve.js      Improvement plans: smallest mark increases to qualify
  src/repository.js   Loads the catalog from Postgres
  src/app.js          API routes
  src/cli/check.js    Check a marks file from the terminal
  samples/            Example learner marks
  test/               Unit and API tests
frontend/       Marks sheet and results page (served by the API)
pipeline/       Validate and load prospectus JSON into Postgres
  models.py           The data contract for extracted prospectus JSON
  validate.py         Structure, database and sanity checks
  load.py             Idempotent loader with change detection
data/extracted/ One JSON file per university per intake year (+ part files)
database/       schema.sql, seeds/ and migrations/
docs/           Setup, data model and yearly update guides
scripts/        One-off data fixes
```

---

## How it works

| Topic | Doc |
|---|---|
| Install and run locally | [docs/setup.md](docs/setup.md) |
| Tables, requirement groups, APS rules, statuses | [docs/data-model.md](docs/data-model.md) |
| Adding a university or updating for a new year | [docs/yearly-update.md](docs/yearly-update.md) |

**Short version:**

- **Requirements** are "AND of ORs". A course has requirement groups, and every group must pass. A group passes when at least `min_count` of its options are met (usually 1, e.g. "Mathematics 60% **or** Technical Mathematics 60%").
- **APS per course**: the university's must-count subjects (e.g. English at WSU) and the course's required subjects are counted first. The learner's best remaining subjects fill the rest.
- **Maths type matters**: each course has separate minimum APS values for Mathematics, Maths Literacy and Technical Maths. An empty value means that maths type isn't accepted.
- **Within reach** means no more than 2 APS points short and no more than 5% short on each subject.

---

## API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | Database status and number of courses |
| GET | `/api/subjects` | All NSC subjects (for the marks form) |
| GET | `/api/universities` | Universities with application link, fee, closing date and number of courses |
| POST | `/api/eligibility` | APS per university and a result for each course |
| GET | `/api/courses?q=nursing&uni=UJ,WSU&type=bachelor` | Search every course, whether or not the learner qualifies |
| GET | `/api/courses/facets` | Faculties and qualification types for search filters |
| GET | `/api/courses/:id` | One course with its university's application link and APS rule |
| POST | `/api/improve` | What to improve to get into chosen courses: `{ marks, courseIds: [12, 40] }` |

```json
POST /api/eligibility
{ "marks": { "English Home Language": 72, "Mathematics": 75, "Physical Sciences": 68 },
  "universities": ["UJ"] }
```

From the terminal: `npm run check -- samples/strong-science.json --uni WSU --show qualifies,close`

> The API loads course data once at startup. **Restart the server after loading new data.**

---

## Roadmap

- [x] Eligibility engine with per-university APS rules
- [x] Prospectus pipeline with validation and change detection
- [x] UJ, TUT, UP, UKZN, WSU, UFH, DUT, Wits, MUT, UNIZULU, VUT, NWU, UL, SMU, UNIVEN and UMP 2027 data (1,410 courses)
- [ ] Clearer, learner-friendly UI that works well on phones
- [ ] More universities
- [ ] NSC pass-type check (Bachelor / Diploma / Higher Certificate)
- [ ] Course-level application links and alternative admission routes
- [ ] Deploy on AWS (S3 + CloudFront, Lambda, free-tier Postgres)
- [ ] Mobile app
- [ ] Learner accounts (Cognito) to save marks
