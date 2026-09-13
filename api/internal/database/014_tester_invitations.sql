CREATE TABLE problem_tester_invitations (
    problem_id uuid PRIMARY KEY REFERENCES problem_drafts(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX problem_testers_owner ON problem_testers(owner_id, problem_id);

-- The same problem permissions apply to authors and accepted testers.
CREATE FUNCTION can_manage_problem(problem uuid, actor text) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS(SELECT 1 FROM problem_drafts WHERE id=problem AND owner_id=actor)
        OR EXISTS(SELECT 1 FROM problem_testers WHERE problem_id=problem AND owner_id=actor)
$$;
