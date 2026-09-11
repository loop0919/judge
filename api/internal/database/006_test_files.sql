CREATE TABLE test_files (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL CHECK (owner_id <> ''),
    problem_id uuid NOT NULL,
    object_key text NOT NULL UNIQUE CHECK (object_key <> ''),
    version_id text CHECK (version_id IS NULL OR version_id <> ''),
    sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    size bigint NOT NULL CHECK (size > 0 AND size <= 16777216),
    ready boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((NOT ready AND version_id IS NULL) OR (ready AND version_id IS NOT NULL))
);
CREATE INDEX test_files_owner_problem ON test_files(owner_id, problem_id, id);
