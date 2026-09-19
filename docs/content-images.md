# Content images

Problem statements/editorials, contest descriptions, and articles share the image
upload controls in `MarkdownSourceEditor.vue`. Users can drop or paste images,
select files, or insert an existing image from their library. The generated
Markdown uses `/api/images/<uuid>`; users should replace the placeholder alt text.

## Limits and storage

- Input: PNG, JPEG, or WebP, up to 10 MiB per file and 10 files per selection/drop.
- The browser preserves transparency, resizes to at most 2,048 pixels on either
  side, and compresses/reduces dimensions further when necessary.
- The API accepts only decoded PNG/JPEG up to 512 KiB and 2,048 × 2,048 pixels.
  It re-encodes images to remove metadata/trailing payloads and checks size again.
- There are **no per-account or service-wide byte/count quotas**.
- Migration 017 stores image bytes in PostgreSQL. Identical normalized images
  from the same uploader share one row and URL, including concurrent uploads.
  Images do not require a new bucket or infrastructure deployment.

## Visibility and deletion

An uploader can preview their images before saving a document. Other readers can
retrieve an image only when content they can read references it. Drafts, published
snapshots, problem testers, contest start times, and editorial release times are
checked independently. Copying another user's private image URL into a public
article does not publish that image. Responses use `Cache-Control: no-store`, so
unpublishing is not defeated by a shared/browser cache. Previously downloaded
copies cannot be revoked.

The image library shows the uploader's stored bytes and supports insertion and
deletion. Images referenced by saved drafts or published/contest snapshots cannot
be deleted. Remove the reference, save, and update any published snapshot first.
The deletion transaction locks content tables against concurrent saves while
checking references. Uploads abandoned before insertion are available in the
library and can be deleted there. There is no automatic expiration: unsaved work
and deliberately reusable images must not silently lose their files.

## Operations

Apply migration 017 before deploying the API and web changes. Observe database
storage and backup/WAL growth alongside the stored image payload:

```sql
SELECT count(*) AS images, COALESCE(sum(size), 0) AS payload_bytes
FROM content_images;

SELECT pg_size_pretty(pg_total_relation_size('content_images')) AS database_size;
```

Deletion releases live rows for PostgreSQL vacuum/reuse; it does not immediately
shrink database files or retained backups. There is intentionally no automatic
upload cutoff. If image traffic or backup volume becomes material, move payloads
to object storage while retaining the URLs and authorization checks. The current
reference checks scan content text; a maintained reference index is the next step
if that query becomes costly.

Checks: `TestContentImageValidation`, the image cases in `TestProfilesPostgres`,
and `web/tests/account/images.spec.ts` cover validation, concurrent deduplication,
private/public access, contest timing, deletion, and the browser-to-API flow.
