-- Migration 001: separate APS for learners taking Technical Mathematics.
-- NULL = Technical Mathematics not accepted for the course.
-- Safe to re-run.
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS min_aps_tech_maths SMALLINT
    CHECK (min_aps_tech_maths >= 0);
