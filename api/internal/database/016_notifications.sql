CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id text NOT NULL REFERENCES user_profiles(owner_id) ON DELETE CASCADE,
    problem_id uuid NOT NULL REFERENCES problem_drafts(id) ON DELETE CASCADE,
    actor_id text NOT NULL REFERENCES user_profiles(owner_id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('favorite','first_accept','tester')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    read_at timestamptz
);
CREATE INDEX notifications_unread ON notifications(owner_id,created_at DESC) WHERE read_at IS NULL;
CREATE UNIQUE INDEX notifications_first_accept ON notifications(problem_id) WHERE kind='first_accept';

-- Preserve existing first accepts without sending historical notifications.
INSERT INTO notifications(owner_id,problem_id,actor_id,kind,read_at)
SELECT DISTINCT ON (p.id) p.owner_id,p.id,s.owner_id,'first_accept',clock_timestamp()
FROM problem_drafts p JOIN submissions s ON s.problem_id=p.id
WHERE s.status='DONE' AND s.result->>'verdict'='AC'
 AND NOT can_manage_problem(p.id,s.owner_id)
 AND NOT COALESCE((s.job->>'easyTest')::boolean,false)
 AND NOT COALESCE((s.job->>'generate')::boolean,false)
 AND NOT COALESCE((s.job->>'validate')::boolean,false)
ORDER BY p.id,s.finished_at,s.id;

CREATE FUNCTION notify_problem_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO notifications(owner_id,problem_id,actor_id,kind)
    SELECT owner_id,id,NEW.owner_id,TG_ARGV[0] FROM problem_drafts
    WHERE id=NEW.problem_id AND owner_id<>NEW.owner_id;
    RETURN NEW;
END
$$;
CREATE TRIGGER favorite_notification AFTER INSERT ON problem_favorites
FOR EACH ROW EXECUTE FUNCTION notify_problem_activity('favorite');
CREATE TRIGGER tester_notification AFTER INSERT ON problem_testers
FOR EACH ROW EXECUTE FUNCTION notify_problem_activity('tester');

CREATE FUNCTION notify_first_accept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status='DONE' AND NEW.result->>'verdict'='AC'
       AND NOT COALESCE((NEW.job->>'easyTest')::boolean,false)
       AND NOT COALESCE((NEW.job->>'generate')::boolean,false)
       AND NOT COALESCE((NEW.job->>'validate')::boolean,false)
       AND NOT can_manage_problem(NEW.problem_id,NEW.owner_id) THEN
        INSERT INTO notifications(owner_id,problem_id,actor_id,kind)
        SELECT owner_id,id,NEW.owner_id,'first_accept' FROM problem_drafts WHERE id=NEW.problem_id
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER first_accept_notification AFTER INSERT OR UPDATE OF status,result ON submissions
FOR EACH ROW EXECUTE FUNCTION notify_first_accept();
