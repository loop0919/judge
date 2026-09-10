-- The submission row is the durable outbox. One stable attempt per submission;
-- SQS redelivery retries that attempt and first final result wins.
ALTER TABLE submissions ADD COLUMN judge_attempt uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE submissions ADD COLUMN dispatched_at timestamptz;
CREATE INDEX submissions_dispatch ON submissions(created_at)
    WHERE runtime = 'cpp17-isolate' AND dispatched_at IS NULL AND status <> 'DONE';
