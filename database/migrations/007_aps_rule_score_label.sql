-- 007: what the university calls its admission score, shown in the app instead of "APS"
-- (NMU "AS", UCT "FPS", SU "Aggregate"). NULL = "APS". Safe to re-run.
ALTER TABLE aps_rules ADD COLUMN IF NOT EXISTS score_label VARCHAR(20);
