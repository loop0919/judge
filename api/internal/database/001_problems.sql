CREATE TABLE problem_drafts (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL CHECK (owner_id <> ''),
    draft jsonb NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX problem_drafts_owner_updated ON problem_drafts (owner_id, updated_at DESC, id DESC);
