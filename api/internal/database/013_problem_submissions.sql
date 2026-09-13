-- Record whether existing ordinary submissions were accepted on a public problem.
-- The latest publication timestamp is the conservative boundary for old records.
UPDATE submissions s SET job = job || jsonb_build_object('privateDraft', NOT EXISTS(
    SELECT 1 FROM problem_drafts p WHERE p.id=s.problem_id
    AND p.published_draft IS NOT NULL AND s.created_at>=p.published_at
)) WHERE contest_id IS NULL AND NOT job ? 'privateDraft';
CREATE INDEX submissions_problem_order ON submissions(problem_id, created_at DESC, id DESC);
