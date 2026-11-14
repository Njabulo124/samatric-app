-- 006: per-course number of subjects in the APS, when it differs from the university rule.
-- CPUT Method 2 counts only Maths x2, Physical Sciences x2, English and one more subject (4 subjects).
-- NULL = the university rule applies. Safe to re-run.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS aps_subjects_counted SMALLINT CHECK (aps_subjects_counted BETWEEN 1 AND 9);
