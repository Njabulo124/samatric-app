# Setup guide (Windows)

Run all commands from the **repo root** (`C:\dev\samatric-app`) unless a step says `cd backend`.

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| PostgreSQL | 18 | `psql --version` |
| Python | 3.12+ | `python --version` |
| Node.js | 22+ | `node --version` |
| Git | any | `git --version` |

If `psql` is not found, add Postgres to your PATH for this session:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
```

If PowerShell blocks `npm` or `Activate.ps1` ("running scripts is disabled"):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 2. Database

### Fresh database

`schema.sql` already includes every migration, so **don't** run the migrations on a fresh database.

```powershell
createdb -U postgres samatric
psql -U postgres -d samatric -f database/schema.sql
psql -U postgres -d samatric -f database/seeds/01_subjects.sql
psql -U postgres -d samatric -f database/seeds/02_aps_scales.sql
```

### Existing database (after pulling new changes)

Run any migrations you don't have yet, in number order. They're all safe to re-run.

```powershell
psql -U postgres -d samatric -f database/migrations/001_add_min_aps_tech_maths.sql
psql -U postgres -d samatric -f database/migrations/002_add_aps_must_count.sql
psql -U postgres -d samatric -f database/migrations/003_min_count_and_course_lo.sql
psql -U postgres -d samatric -f database/migrations/004_course_closes_on.sql
psql -U postgres -d samatric -f database/migrations/005_course_aps_weights.sql
psql -U postgres -d samatric -f database/migrations/006_course_aps_subjects_counted.sql
psql -U postgres -d samatric -f database/migrations/007_aps_rule_score_label.sql
```

### Start over

```powershell
dropdb -U postgres samatric
# then the "Fresh database" steps
```

## 3. Config

```powershell
Copy-Item .env.example .env
notepad .env      # replace YOUR_PASSWORD
```

`.env` is in `.gitignore`. **Never commit it.**

## 4. Python pipeline

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r pipeline/requirements.txt
```

Load each university. Part files (`uj.part2.json`, ...) are merged automatically.

```powershell
python -m pipeline.validate data/extracted/2027/uj.json
python -m pipeline.load data/extracted/2027/uj.json
python -m pipeline.load data/extracted/2027/wsu.json
```

## 5. Backend and frontend

```powershell
cd backend
npm install
npm test           # all tests should pass; no database needed
npm start          # http://localhost:5000
```

The frontend is served by the API at http://localhost:5000.

## Troubleshooting

| Problem | Fix |
|---|---|
| Results don't show newly loaded courses | Restart the server. It caches the data at startup. |
| Old data is still showing after a restart | An old server is still on port 5000. Run `Get-NetTCPConnection -LocalPort 5000 \| Select OwningProcess`, then `Stop-Process -Id <id>`. |
| Folders like `backend\backend` appear | You ran a command from inside `backend/`. Pipeline and git commands run from the repo root. |
| `DATABASE_URL not set` | `.env` is missing or not in the repo root. |
| `unknown subject 'X'` when validating | Use the exact subject name from `database/seeds/01_subjects.sql`. |
| A tracked file suddenly shows hundreds of deletions | An unsaved editor tab overwrote it. Run `git restore <file>`. |
