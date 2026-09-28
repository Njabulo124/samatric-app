-- =====================================================================
-- Seed: APS scales
-- Standard NSC 7-point achievement scale. University-specific scales
-- (e.g. Wits) get added with that university's seed file.
-- Safe to re-run.
-- =====================================================================

BEGIN;

INSERT INTO aps_scales (name) VALUES ('NSC standard 7-point')
ON CONFLICT (name) DO NOTHING;

INSERT INTO aps_scale_bands (scale_id, min_mark, max_mark, points)
SELECT s.scale_id, b.min_mark, b.max_mark, b.points
FROM aps_scales s
CROSS JOIN (VALUES
    (80, 100, 7),
    (70,  79, 6),
    (60,  69, 5),
    (50,  59, 4),
    (40,  49, 3),
    (30,  39, 2),
    ( 0,  29, 1)
) AS b(min_mark, max_mark, points)
WHERE s.name = 'NSC standard 7-point'
ON CONFLICT (scale_id, min_mark) DO NOTHING;

COMMIT;
