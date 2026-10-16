-- +goose Up
-- The example resource. Column mapping from the contract: proto string ->
-- text NOT NULL (an empty string is a value, never NULL); optional Timestamp
-- -> nullable timestamptz; ids are uuids the database assigns. archived_at
-- is the stack's default shape for "delete": the row stays, lists leave it
-- out unless asked, and anything that referenced it keeps its meaning.
CREATE TABLE notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  created_by  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  archived_at timestamptz
);

-- The list is keyset-paged newest first on (created_at, id); this is the
-- index that walk reads.
CREATE INDEX notes_created_at_idx ON notes (created_at DESC, id DESC);

-- +goose Down
DROP TABLE notes;
