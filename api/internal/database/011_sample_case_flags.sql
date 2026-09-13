-- Preserve the old sample_ meaning once; new and edited cases use an explicit flag.
UPDATE problem_drafts d
SET draft = jsonb_set(d.draft, '{testCases}', (
    SELECT jsonb_agg(CASE WHEN c ? 'isSample' THEN c ELSE c || jsonb_build_object('isSample', COALESCE(starts_with(c->>'name', 'sample_'), false)) END ORDER BY ordinal)
    FROM jsonb_array_elements(d.draft->'testCases') WITH ORDINALITY AS cases(c, ordinal)
)), version = version + 1
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(d.draft->'testCases', '[]'::jsonb)) c WHERE NOT (c ? 'isSample'));

UPDATE problem_drafts d
SET published_draft = jsonb_set(d.published_draft, '{testCases}', (
    SELECT jsonb_agg(CASE WHEN c ? 'isSample' THEN c ELSE c || jsonb_build_object('isSample', COALESCE(starts_with(c->>'name', 'sample_'), false)) END ORDER BY ordinal)
    FROM jsonb_array_elements(d.published_draft->'testCases') WITH ORDINALITY AS cases(c, ordinal)
)), version = version + 1
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(d.published_draft->'testCases', '[]'::jsonb)) c WHERE NOT (c ? 'isSample'));
