CREATE TABLE content_images (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL REFERENCES user_profiles(owner_id),
    digest bytea NOT NULL,
    media_type text NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg')),
    data bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 524288),
    size integer NOT NULL CHECK (size = octet_length(data)),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(owner_id, digest)
);
-- Only the text actually visible to a reader may grant image access.
-- The uploader must also have permission to edit that content: copying a
-- private image URL into another user's article must not publish the image.
-- ponytail: scans content text; maintain an indexed reference table if volume
-- makes permission checks expensive.
CREATE FUNCTION content_image_access(image_id uuid, uploader text, viewer text, include_private boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (
   SELECT 1 FROM (
     SELECT d.draft->>'markdown' AS body, d.owner_id AS author, d.id AS problem, NULL::timestamptz AS visible_at FROM problem_drafts d
     UNION ALL SELECT d.draft->>'editorial', d.owner_id, d.id, NULL FROM problem_drafts d
     UNION ALL SELECT d.published_draft->>'markdown', d.owner_id, d.id, '-infinity'::timestamptz FROM problem_drafts d
     UNION ALL SELECT d.published_draft->>'editorial', d.owner_id, d.id, '-infinity'::timestamptz FROM problem_drafts d
     UNION ALL SELECT b.markdown, b.owner_id, NULL, NULL FROM blog_posts b
     UNION ALL SELECT b.published_markdown, b.owner_id, NULL, '-infinity'::timestamptz FROM blog_posts b
     UNION ALL SELECT c.description, c.owner_id, NULL, '-infinity'::timestamptz FROM contests c
     UNION ALL SELECT cp.draft->>'markdown', c.owner_id, cp.problem_id, c.starts_at FROM contest_problems cp JOIN contests c ON c.id=cp.contest_id
     UNION ALL SELECT cp.draft->>'editorial', c.owner_id, cp.problem_id, c.ends_at FROM contest_problems cp JOIN contests c ON c.id=cp.contest_id
   ) source
   WHERE strpos(source.body, '/api/images/' || image_id::text) > 0
     AND (source.author=uploader OR can_manage_problem(source.problem,uploader))
     AND (include_private OR source.visible_at<=statement_timestamp()
          OR source.author=viewer OR can_manage_problem(source.problem,viewer))
 )
$$;
