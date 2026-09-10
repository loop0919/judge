CREATE TABLE submissions (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL REFERENCES user_profiles(owner_id),
    problem_id uuid NOT NULL,
    problem_version bigint NOT NULL,
    problem_title text NOT NULL,
    runtime text NOT NULL,
    source text NOT NULL,
    job jsonb NOT NULL,
    status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'DONE')),
    result jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    started_at timestamptz,
    finished_at timestamptz
);
CREATE INDEX submissions_owner_order ON submissions(owner_id, created_at DESC);
CREATE INDEX submissions_queue ON submissions(created_at) WHERE status = 'QUEUED';
