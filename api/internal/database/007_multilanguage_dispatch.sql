CREATE INDEX submissions_multilanguage_dispatch ON submissions(created_at, id)
    WHERE dispatched_at IS NULL AND status <> 'DONE';
