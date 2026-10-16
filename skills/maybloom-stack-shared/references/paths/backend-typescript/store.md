# Store

Create `packages/backend/src/core/<resources>/store.ts`. The store holds
the actual business logic. Handlers should be one or two lines that wrap a
store function.

## Pattern

```ts
import { Code, ConnectError } from "@connectrpc/connect";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { <Resource> } from "<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/resources/v1/<resources>_pb";
import { <resources> } from "db/schema";
import { server } from "server";
import {
  <resource>RowToProto,
  <resource>ToInsert,
  <resource>ToUpdate,
} from "core/<resources>/adapter";

export async function create<Resource>(createdBy: string, input: <Resource>) {
  if (!input.title.trim()) {
    throw new ConnectError("Title is required", Code.InvalidArgument);
  }
  const [row] = await server.db
    .insert(<resources>)
    .values(<resource>ToInsert(input, randomUUID(), createdBy))
    .returning();
  return <resource>RowToProto(row);
}

// archived moves the row in or out of the archive; the row stays either
// way. This is the stack's default shape for "delete".
export async function update<Resource>(input: <Resource>, archived: boolean) {
  if (!input.id) {
    throw new ConnectError("<Resource> id is required", Code.InvalidArgument);
  }
  const [row] = await server.db
    .update(<resources>)
    .set({
      ...<resource>ToUpdate(input),
      archivedAt: archived ? sql`coalesce(${<resources>.archivedAt}, now())` : null,
      updatedAt: new Date(),
    })
    .where(eq(<resources>.id, input.id))
    .returning();
  if (!row) {
    throw new ConnectError("<Resource> not found", Code.NotFound);
  }
  return <resource>RowToProto(row);
}

export async function get<Resource>(id: string) {
  const [row] = await server.db
    .select()
    .from(<resources>)
    .where(eq(<resources>.id, id));
  if (!row) {
    throw new ConnectError("<Resource> not found", Code.NotFound);
  }
  return <resource>RowToProto(row);
}

// Cursor paging, newest first, keyset on (created_at, id); the bootstrap's
// core/notes/store.ts has the token codec (base64url of "<millis>:<id>").
export async function list<Resources>(filter: {
  pageSize: number;
  pageToken: string;
  includeArchived: boolean;
}) {
  const size = Math.min(filter.pageSize > 0 ? filter.pageSize : 50, 200);
  const before = decodePageToken(filter.pageToken);
  const rows = await server.db
    .select()
    .from(<resources>)
    .where(
      and(
        filter.includeArchived ? undefined : isNull(<resources>.archivedAt),
        before
          ? or(
              lt(<resources>.createdAt, before.createdAt),
              and(eq(<resources>.createdAt, before.createdAt), lt(<resources>.id, before.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(<resources>.createdAt), desc(<resources>.id))
    .limit(size + 1);
  const page = rows.slice(0, size);
  const last = page[page.length - 1];
  return {
    <resources>: page.map(<resource>RowToProto),
    nextPageToken: rows.length > size && last ? encodePageToken(last.createdAt, last.id) : "",
  };
}
```

A hard delete, for leaf data only, is
`await server.db.delete(<resources>).where(eq(<resources>.id, id))`.

## Conventions

- **Throw `ConnectError`, not generic `Error`.** Connect maps the code to
  HTTP status; the central error handler in `server.ts` keeps logging
  consistent.
- **`Code.InvalidArgument`** for missing required fields and a page token
  the service did not issue. `Code.NotFound`
  for missing rows on get/update. `Code.AlreadyExists` for unique
  constraint violations (catch the Drizzle error and rethrow with this
  code if you care about the distinction).
- **`server.db.transaction(async (tx) => ...)`** when a single RPC mutates
  multiple tables. Pass `tx` (not `server.db`) into anything called from
  inside the transaction so it joins the same transaction. For the full
  recipe (load before-row → mutate → recompute derived state → emit events
  → replace M:N children → reload aggregates), see the
  "Read-modify-write with derived state" section of
  `../../tx-patterns.md`.
- **`updatedAt: new Date()`** on every update — set it server-side, not
  client-side. The adapter ignores `proto.updated_at` for updates because
  of this.
- **Return proto messages, not rows.** Always `<resource>RowToProto(row)`
  before returning. Handlers should be able to call the store and pass
  the result straight to the response builder.

## List filters

Proto `List<Resources>Request` fields beyond the paging trio become
further `and(...)` conditions in `list<Resources>` above, each `undefined`
when the request left the filter out. Handlers extract the proto fields
and pass them as the filter object.

## What does *not* belong in a store

- Reading auth context (that's the handler's job — pass user ID as an arg
  if the store needs it).
- Constructing proto messages manually (use the adapter).
- HTTP status logic (throw `ConnectError`, the handler/error-mapper will
  translate).
- Direct `process.env` reads (use `server.config`).
