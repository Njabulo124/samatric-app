-- Migration 002: subjects a university always counts in the APS.
-- JSON list of slots; each slot is a list of alternative subjects, e.g.
--   [["English Home Language", "English First Additional Language"]]
-- The learner's best subject in each slot is counted first, then the best of the rest.
-- Safe to re-run.
ALTER TABLE aps_rules
    ADD COLUMN IF NOT EXISTS must_count JSONB NOT NULL DEFAULT '[]'::jsonb;
