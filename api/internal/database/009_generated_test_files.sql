-- Generated uploads are pinned before the owner completes content validation.
ALTER TABLE test_files ADD COLUMN upload_version_id text CHECK (upload_version_id IS NULL OR upload_version_id <> '');
