CREATE TABLE contests (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL REFERENCES user_profiles(owner_id),
    title text NOT NULL,
    description text NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
    penalty_minutes integer NOT NULL DEFAULT 5 CHECK (penalty_minutes BETWEEN 0 AND 1440),
    version bigint NOT NULL DEFAULT 1,
    released boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX contests_schedule ON contests(starts_at DESC, id DESC);
CREATE INDEX contests_release ON contests(ends_at) WHERE NOT released;

CREATE TABLE contest_problems (
    contest_id uuid NOT NULL REFERENCES contests(id),
    problem_id uuid NOT NULL REFERENCES problem_drafts(id),
    position integer NOT NULL CHECK (position >= 0),
    points integer NOT NULL CHECK (points BETWEEN 1 AND 1000000),
    draft jsonb NOT NULL,
    problem_version bigint NOT NULL,
    PRIMARY KEY (contest_id, problem_id),
    UNIQUE (contest_id, position),
    UNIQUE (problem_id)
);

-- Membership is problem-scoped; invitation and bulk-registration UI will follow.
CREATE TABLE problem_testers (
    problem_id uuid NOT NULL REFERENCES problem_drafts(id) ON DELETE CASCADE,
    owner_id text NOT NULL REFERENCES user_profiles(owner_id),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (problem_id, owner_id)
);

ALTER TABLE submissions ADD COLUMN contest_id uuid REFERENCES contests(id);
CREATE INDEX submissions_contest_order ON submissions(contest_id, created_at, id) WHERE contest_id IS NOT NULL;
