ALTER TABLE problem_drafts ADD COLUMN published_draft jsonb;
ALTER TABLE problem_drafts ADD COLUMN published_version bigint NOT NULL DEFAULT 0;
ALTER TABLE problem_drafts ADD COLUMN published_at timestamptz;
CREATE INDEX problem_publication_order ON problem_drafts (published_at DESC, id DESC) WHERE published_draft IS NOT NULL;
CREATE TABLE blog_posts (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL REFERENCES user_profiles(owner_id),
    title text NOT NULL,
    markdown text NOT NULL,
    version bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    published_title text,
    published_markdown text,
    published_version bigint NOT NULL DEFAULT 0,
    published_at timestamptz
);
CREATE INDEX blog_owner_order ON blog_posts (owner_id, updated_at DESC, id DESC);
CREATE INDEX blog_publication_order ON blog_posts (published_at DESC, id DESC) WHERE published_title IS NOT NULL;
