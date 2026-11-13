-- =====================================================================
-- SAMATRIC APP - Database schema (PostgreSQL 18)
-- Run:  psql -U postgres -d samatric -f database/schema.sql
-- Reset during dev: dropdb -U postgres samatric && createdb -U postgres samatric
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. REFERENCE DATA: subjects
-- ---------------------------------------------------------------------
CREATE TABLE subjects (
    subject_id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                VARCHAR(100) NOT NULL UNIQUE,
    subject_group       VARCHAR(20)  NOT NULL
                        CHECK (subject_group IN ('language', 'mathematics', 'science',
                                                 'commerce', 'humanities', 'technical',
                                                 'arts', 'life_orientation', 'other')),
    is_designated       BOOLEAN NOT NULL DEFAULT FALSE,  -- NSC designated subject list
    is_life_orientation BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------
-- 2. INSTITUTIONS
-- ---------------------------------------------------------------------
CREATE TABLE universities (
    university_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name             VARCHAR(150) NOT NULL UNIQUE,
    short_name       VARCHAR(20)  NOT NULL UNIQUE,          -- e.g. UJ, WSU, UNISA
    institution_type VARCHAR(30)  NOT NULL
                     CHECK (institution_type IN ('traditional', 'comprehensive',
                                                 'university_of_technology', 'tvet', 'private')),
    province         VARCHAR(30),
    website_url      TEXT,
    application_url  TEXT,
    application_fee  NUMERIC(8,2) CHECK (application_fee >= 0),
    is_active        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE application_periods (
    period_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    university_id INT NOT NULL REFERENCES universities(university_id) ON DELETE CASCADE,
    intake_year   SMALLINT NOT NULL,
    label         VARCHAR(100) NOT NULL DEFAULT 'General',  -- e.g. 'General', 'Health Sciences'
    opens_on      DATE,
    closes_on     DATE,
    notes         TEXT,
    UNIQUE (university_id, intake_year, label),
    CHECK (closes_on IS NULL OR opens_on IS NULL OR closes_on >= opens_on)
);

CREATE TABLE faculties (
    faculty_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    university_id INT NOT NULL REFERENCES universities(university_id) ON DELETE CASCADE,
    name          VARCHAR(150) NOT NULL,
    UNIQUE (university_id, name)
);

-- ---------------------------------------------------------------------
-- 3. APS RULES (each university calculates APS differently)
-- ---------------------------------------------------------------------
-- A scale converts a percentage into points, e.g. 80-100% = 7 points.
CREATE TABLE aps_scales (
    scale_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     VARCHAR(100) NOT NULL UNIQUE                -- e.g. 'NSC standard 7-point', 'Wits 8-point'
);

CREATE TABLE aps_scale_bands (
    scale_id INT NOT NULL REFERENCES aps_scales(scale_id) ON DELETE CASCADE,
    min_mark SMALLINT NOT NULL CHECK (min_mark BETWEEN 0 AND 100),
    max_mark SMALLINT NOT NULL CHECK (max_mark BETWEEN 0 AND 100),
    points   NUMERIC(4,1) NOT NULL CHECK (points >= 0),
    PRIMARY KEY (scale_id, min_mark),
    CHECK (max_mark >= min_mark)
);

-- One rule per university per intake year.
CREATE TABLE aps_rules (
    rule_id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    university_id    INT NOT NULL REFERENCES universities(university_id) ON DELETE CASCADE,
    intake_year      SMALLINT NOT NULL,
    default_scale_id INT NOT NULL REFERENCES aps_scales(scale_id),
    subjects_counted SMALLINT NOT NULL DEFAULT 6 CHECK (subjects_counted BETWEEN 1 AND 9), -- best N subjects
    include_lo       BOOLEAN  NOT NULL DEFAULT FALSE,   -- is Life Orientation counted at all?
    must_count       JSONB    NOT NULL DEFAULT '[]'::jsonb, -- slots always counted, e.g. [["English Home Language","English First Additional Language"]]
    notes            TEXT,
    UNIQUE (university_id, intake_year)
);

-- Some subjects use a different scale (e.g. LO capped, bonus points for Maths/English).
CREATE TABLE aps_rule_subject_scales (
    rule_id    INT NOT NULL REFERENCES aps_rules(rule_id) ON DELETE CASCADE,
    subject_id INT NOT NULL REFERENCES subjects(subject_id),
    scale_id   INT NOT NULL REFERENCES aps_scales(scale_id),
    PRIMARY KEY (rule_id, subject_id)
);

-- ---------------------------------------------------------------------
-- 4. COURSES AND REQUIREMENTS
-- ---------------------------------------------------------------------
CREATE TABLE courses (
    course_id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    university_id      INT NOT NULL REFERENCES universities(university_id) ON DELETE CASCADE,
    faculty_id         INT REFERENCES faculties(faculty_id) ON DELETE SET NULL,
    name               VARCHAR(200) NOT NULL,
    qualification_type VARCHAR(30)  NOT NULL
                       CHECK (qualification_type IN ('higher_certificate', 'diploma',
                                                     'advanced_diploma', 'bachelor', 'other')),
    is_extended        BOOLEAN  NOT NULL DEFAULT FALSE,  -- extended / foundation programme
    duration_years     NUMERIC(3,1) CHECK (duration_years > 0),
    nsc_pass_required  VARCHAR(20)
                       CHECK (nsc_pass_required IN ('bachelor', 'diploma', 'higher_certificate')),
    min_aps            SMALLINT CHECK (min_aps >= 0),    -- APS when learner takes Mathematics
    min_aps_maths_lit  SMALLINT CHECK (min_aps_maths_lit >= 0), -- NULL = Maths Lit not accepted
    min_aps_tech_maths SMALLINT CHECK (min_aps_tech_maths >= 0), -- NULL = Technical Maths not accepted
    include_lo         BOOLEAN,                          -- NULL = university rule; TRUE = LO counted as an extra subject
    closes_on          DATE,                             -- NULL = faculty or general closing date applies
    aps_weights        JSONB,                            -- e.g. [{"subjects": ["Mathematics"], "weight": 2}]; NULL = none
    prospectus_year    SMALLINT NOT NULL,                -- intake year the data applies to
    source_ref         TEXT,                             -- prospectus page / URL for traceability
    notes              TEXT,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (university_id, name, prospectus_year)
);

-- Requirements are "AND of ORs":
--   a course has several groups; the learner must pass EVERY group;
--   a group passes if ANY one of its options is met.
-- Example: group "Mathematics" = Mathematics >= 60 OR Technical Mathematics >= 70
CREATE TABLE requirement_groups (
    group_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id   INT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    description VARCHAR(150) NOT NULL,
    min_count   SMALLINT NOT NULL DEFAULT 1 CHECK (min_count >= 1)  -- "at least N of these options"
);

CREATE TABLE requirement_options (
    option_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id    INT NOT NULL REFERENCES requirement_groups(group_id) ON DELETE CASCADE,
    subject_id  INT NOT NULL REFERENCES subjects(subject_id),
    min_percent SMALLINT NOT NULL CHECK (min_percent BETWEEN 0 AND 100),
    UNIQUE (group_id, subject_id)
);

-- ---------------------------------------------------------------------
-- 5. USERS AND MARKS
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name    VARCHAR(100) NOT NULL,
    surname       VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    password_hash TEXT,                                   -- local dev only; Cognito replaces this on AWS
    grade         SMALLINT CHECK (grade BETWEEN 10 AND 12),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_users_email_lower ON users (LOWER(email));

CREATE TABLE user_marks (
    user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    subject_id INT NOT NULL REFERENCES subjects(subject_id),
    mark       SMALLINT NOT NULL CHECK (mark BETWEEN 0 AND 100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, subject_id)
);

-- ---------------------------------------------------------------------
-- 6. INDEXES ON FOREIGN KEYS (Postgres doesn't create these automatically)
-- ---------------------------------------------------------------------
CREATE INDEX ix_faculties_university     ON faculties (university_id);
CREATE INDEX ix_courses_university       ON courses (university_id);
CREATE INDEX ix_courses_faculty          ON courses (faculty_id);
CREATE INDEX ix_req_groups_course        ON requirement_groups (course_id);
CREATE INDEX ix_req_options_group        ON requirement_options (group_id);
CREATE INDEX ix_req_options_subject      ON requirement_options (subject_id);
CREATE INDEX ix_app_periods_university   ON application_periods (university_id);
CREATE INDEX ix_user_marks_subject       ON user_marks (subject_id);

COMMIT;
