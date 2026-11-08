-- 004: per-course application closing date (e.g. TUT gives every programme its own date).
-- NULL = use the faculty's or the university's general closing date. Safe to re-run.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS closes_on DATE;
