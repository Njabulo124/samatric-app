-- =====================================================================
-- Seed: NSC subjects
-- Safe to re-run (ON CONFLICT DO NOTHING).
-- is_designated = on the NSC "designated subjects" list used for a Bachelor pass.
-- VERIFY items marked (verify) against the current DBE / Umalusi list.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Languages: every official language at Home Language (HL)
--    and First Additional Language (FAL) level. All designated.
-- ---------------------------------------------------------------------
INSERT INTO subjects (name, subject_group, is_designated)
SELECT lang || ' ' || lvl, 'language', TRUE
FROM (VALUES ('Afrikaans'), ('English'), ('isiNdebele'), ('isiXhosa'), ('isiZulu'),
             ('Sepedi'), ('Sesotho'), ('Setswana'), ('Siswati'), ('Tshivenda'),
             ('Xitsonga')) AS l(lang)
CROSS JOIN (VALUES ('Home Language'), ('First Additional Language')) AS v(lvl)
ON CONFLICT (name) DO NOTHING;

INSERT INTO subjects (name, subject_group, is_designated) VALUES
    ('South African Sign Language Home Language', 'language', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Compulsory non-language subjects
-- ---------------------------------------------------------------------
INSERT INTO subjects (name, subject_group, is_designated, is_life_orientation) VALUES
    ('Life Orientation',          'life_orientation', FALSE, TRUE),
    ('Mathematics',               'mathematics',      TRUE,  FALSE),
    ('Mathematical Literacy',     'mathematics',      TRUE,  FALSE),
    ('Technical Mathematics',     'mathematics',      FALSE, FALSE)  -- (verify designated status)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Electives
-- ---------------------------------------------------------------------
INSERT INTO subjects (name, subject_group, is_designated) VALUES
    -- Sciences
    ('Physical Sciences',                    'science',    TRUE),
    ('Life Sciences',                        'science',    TRUE),
    ('Agricultural Sciences',                'science',    TRUE),
    ('Technical Sciences',                   'science',    FALSE),  -- (verify designated status)
    ('Marine Sciences',                      'science',    FALSE),
    -- Commerce
    ('Accounting',                           'commerce',   TRUE),
    ('Business Studies',                     'commerce',   TRUE),
    ('Economics',                            'commerce',   TRUE),
    -- Humanities
    ('Geography',                            'humanities', TRUE),
    ('History',                              'humanities', TRUE),
    ('Religion Studies',                     'humanities', TRUE),
    -- Technical / technology
    ('Information Technology',               'technical',  TRUE),
    ('Computer Applications Technology',     'technical',  FALSE),
    ('Engineering Graphics and Design',      'technical',  TRUE),
    ('Civil Technology',                     'technical',  FALSE),
    ('Electrical Technology',                'technical',  FALSE),
    ('Mechanical Technology',                'technical',  FALSE),
    ('Agricultural Technology',              'technical',  FALSE),
    ('Agricultural Management Practices',    'technical',  FALSE),
    -- Services
    ('Consumer Studies',                     'other',      TRUE),
    ('Hospitality Studies',                  'other',      FALSE),
    ('Tourism',                              'other',      FALSE),
    -- Arts
    ('Dramatic Arts',                        'arts',       TRUE),
    ('Music',                                'arts',       TRUE),
    ('Visual Arts',                          'arts',       TRUE),
    ('Dance Studies',                        'arts',       FALSE),
    ('Design',                               'arts',       FALSE)
ON CONFLICT (name) DO NOTHING;

COMMIT;
