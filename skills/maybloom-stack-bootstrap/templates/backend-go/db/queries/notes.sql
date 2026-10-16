-- name: CreateNote :one
INSERT INTO notes (title, body, created_by)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetNote :one
SELECT * FROM notes WHERE id = $1;

-- name: ListNotes :many
-- Newest first, keyset-paged on (created_at, id): the page starts strictly
-- before the (created_at, id) of the previous page's last row, and the store
-- asks for one row more than the page to learn whether another follows.
-- Archived rows only when asked.
SELECT * FROM notes
WHERE (sqlc.arg(include_archived)::bool OR archived_at IS NULL)
  AND (sqlc.narg(before_created_at)::timestamptz IS NULL
       OR (created_at, id) < (sqlc.narg(before_created_at), sqlc.narg(before_id)::uuid))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_size);

-- name: UpdateNote :one
-- Replaces title and body. updated_at is set here, server-side, never by the
-- client; archived_at is ArchiveNote's.
UPDATE notes
SET title = sqlc.arg(title),
    body = sqlc.arg(body),
    updated_at = now()
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: ArchiveNote :one
-- Sets archived_at once: a second archive keeps the first timestamp. The
-- mirror (UnarchiveNote: SET archived_at = NULL) is added when a screen needs it.
UPDATE notes
SET archived_at = COALESCE(archived_at, now()),
    updated_at = now()
WHERE id = sqlc.arg(id)
RETURNING *;
