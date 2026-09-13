CREATE TABLE problem_favorites (
    problem_id uuid NOT NULL REFERENCES problem_drafts(id) ON DELETE CASCADE,
    owner_id text NOT NULL REFERENCES user_profiles(owner_id) ON DELETE CASCADE,
    PRIMARY KEY (problem_id, owner_id)
);
