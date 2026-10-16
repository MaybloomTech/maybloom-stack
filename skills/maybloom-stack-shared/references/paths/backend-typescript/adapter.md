# Adapter

Create `packages/backend/src/core/<resources>/adapter.ts`. The adapter is
the *only* place that knows about both proto messages and DB rows. Stores
should never construct a proto directly; handlers should never read a
column.

## Responsibilities

1. Export the row types derived from the schema.
2. Convert proto → DB row for inserts (`<resource>ToInsert`) and updates
   (`<resource>ToUpdate`).
3. Convert DB row → proto for reads (`<resource>RowToProto`).
4. Normalize proto's empty-string defaults to NULL where the DB column is
   nullable.
5. Convert DB Dates to proto Timestamps via `core/utils/timestamps`. The
   server owns `created_at`, `updated_at` and `archived_at`: they are read
   here and never written from a request.
6. Map proto enums to the DB enum string values, if applicable.

## Pattern

```ts
import { create } from "@bufbuild/protobuf";
import {
  <Resource>Schema,
  type <Resource>,
} from "<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/resources/v1/<resources>_pb";
import { <resources> } from "db/schema";
import { toTimestamp } from "core/utils/timestamps";

export type <Resource>Row = typeof <resources>.$inferSelect;
export type New<Resource>Row = typeof <resources>.$inferInsert;

function emptyStringToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

export function <resource>RowToProto(row: <Resource>Row): <Resource> {
  return create(<Resource>Schema, {
    id: row.id,
    title: row.title,
    body: row.body,
    createdBy: row.createdBy ?? "",
    createdAt: toTimestamp(row.createdAt),
    updatedAt: toTimestamp(row.updatedAt),
    archivedAt: toTimestamp(row.archivedAt), // only if the resource archives
  });
}

// created_by is the caller the handler read from the context, never the
// client's word for it, so it arrives as its own argument.
export function <resource>ToInsert(
  <resource>: <Resource>,
  id: string,
  createdBy: string,
): New<Resource>Row {
  return {
    id,
    title: <resource>.title,
    body: <resource>.body,
    createdBy: emptyStringToNull(createdBy),
  };
}

// Only the mutable fields; the store sets updated_at.
export function <resource>ToUpdate(
  <resource>: <Resource>,
): Partial<New<Resource>Row> {
  return {
    title: <resource>.title,
    body: <resource>.body,
  };
}
```

## Why each piece

- `create(<Resource>Schema, {...})` is how Connect-ES constructs typed proto
  messages. Don't `as <Resource>` an object literal — proto messages have
  hidden internal fields and TypeScript will let through invalid shapes.
- `row.foo ?? ""` — proto strings have no NULL; the wire format defaults to
  empty string. Convert NULLs to empty strings on the way out.
- `emptyStringToNull(value)` — invert that on the way in *only if* the DB
  column is nullable. If the column is `notNull`, leave the empty string
  alone.
- `Partial<New<Resource>Row>` for updates — Drizzle's `.set({...})` accepts
  a partial; only set what's actually changing. Timestamps are not in it:
  the store sets `updatedAt: new Date()` beside the adapter's fields, and
  `archived_at` belongs to the archive RPC.

## Joins / nested resources

If the proto has nested fields (e.g. `Book.author_links`), the adapter
takes the joined rows as a second argument:

```ts
export function bookRowToProto(
  row: BookRow,
  links: JoinedAuthorLink[],
): Book {
  return create(BookSchema, {
    id: row.id,
    authorLinks: links.map(authorLinkToProto),
    // ...
  });
}
```

The store is responsible for loading the joined rows in one query (or one
per ID) before calling the adapter. Don't make the adapter do I/O.
