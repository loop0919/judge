ALTER TABLE user_profiles ADD COLUMN accounts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(accounts) = 'object' AND octet_length(accounts::text) <= 512);
