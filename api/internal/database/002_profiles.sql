CREATE TABLE user_profiles (
    owner_id text PRIMARY KEY CHECK (owner_id <> ''),
    handle text NOT NULL UNIQUE CHECK (handle ~ '^[a-z][a-z0-9_]{2,19}$'),
    avatar text NOT NULL DEFAULT '' CHECK (octet_length(avatar) <= 180000),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
