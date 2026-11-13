-- 005: per-course subject weights in the APS/FPS, e.g. UCT Science counts Mathematics and
-- Physical Sciences twice. JSON list of {"subjects": [...alternatives in priority order], "weight": 2}.
-- The first listed subject the learner counts gets the weight. NULL = no weighting. Safe to re-run.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS aps_weights JSONB;
