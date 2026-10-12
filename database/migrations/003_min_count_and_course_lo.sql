-- Migration 003
-- 1. "At least N of these" requirements, e.g. 2 of Accounting / Business Studies / Economics.
--    A group passes when min_count of its options are met (default 1 = any one option).
-- 2. Course-level Life Orientation override. NULL = follow the university's APS rule;
--    TRUE = LO is counted as an extra subject for this course (e.g. WSU B.Ed Foundation Phase).
-- Safe to re-run.
ALTER TABLE requirement_groups
    ADD COLUMN IF NOT EXISTS min_count SMALLINT NOT NULL DEFAULT 1 CHECK (min_count >= 1);
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS include_lo BOOLEAN;
