# Store

Create `packages/backend/src/core/<resources>/store.ts`. The store holds
the actual business logic. Handlers should be one or two lines that wrap a
store function.

## Pattern

```ts
import { Code, ConnectError } from "@connectrpc/connect";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type {
  Create<Resource>Request,
  Update<Resource>Request,
} from "<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/service/v1/<resources>_pb";
import { <resources> } from "db/schema";
import { server } from "server";
import {
  <resource>RowToProto,
  <resource>ToInsert,
  <resource>ToUpdate,
} from "core/<resources>/adapter";

export async function create<Resource>(request: Create<Resource>Request) {
  const input = request.<resource>;
  if (!input) {
    throw new ConnectError("<Resource> is required", Code.InvalidArgument);
  }
  const id = input.id || randomUUID();
  const [row] = await server.db
    .insert(<resources>)
    .values(<resource>ToInsert(input, id))
    .returning();
  return <resource>RowToProto(row);
}

export async function update<Resource>(request: Update<Resource>Request) {
  const input = request.<resource>;
  if (!input?.id) {
    throw new ConnectError("<Resource> id is required", Code.InvalidArgument);
  }
  const [row] = await server.db
    .update(<resources>)
    .set({
      ...<resource>ToUpdate(input),
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

export async function list<Resources>() {
  const rows = await server.db.select().from(<resources>);
  return rows.map(<resource>RowToProto);
}

export async function delete<Resource>(id: string) {
  await server.db.delete(<resources>).where(eq(<resources>.id, id));
}
```

## Conventions

- **Throw `ConnectError`, not generic `Error`.** Connect maps the code to
  HTTP status; the central error handler in `server.ts` keeps logging
  consistent.
- **`Code.InvalidArgument`** for missing required fields. `Code.NotFound`
  for missing rows on get/update/delete. `Code.AlreadyExists` for unique
  constraint violations (catch the Drizzle error and rethrow with this
  code if you care about the distinction).
- **`server.db.transaction(async (tx) => ...)`** when a single RPC mutates
  multiple tables. Pass `tx` (not `server.db`) into anything called from
  inside the transaction so it joins the same transaction. For the full
  recipe (load before-row → mutate → recompute derived state → emit events
  → replace M:N children → reload aggregates), see the
  "Read-modify-write with derived state" section of
  `../../maybloom-stack-shared/references/tx-patterns.md`.
- **`updatedAt: new Date()`** on every update — set it server-side, not
  client-side. The adapter ignores `proto.updated_at` for updates because
  of this.
- **Return proto messages, not rows.** Always `<resource>RowToProto(row)`
  before returning. Handlers should be able to call the store and pass
  the result straight to the response builder.

## List filters

Proto `List<Resources>Request` fields become optional store args. Pattern
adapted from the maybloom `listQuests`:

```ts
export async function list<Resources>(filters?: {
  includeArchived?: boolean;
}) {
  const conditions = [];
  if (!filters?.includeArchived) {
    conditions.push(isNull(<resources>.archivedAt));
  }
  const rows = conditions.length
    ? await server.db.select().from(<resources>).where(and(...conditions))
    : await server.db.select().from(<resources>);
  return rows.map(<resource>RowToProto);
}
```

Handlers extract the proto fields and pass them as the filters object.

## What does *not* belong in a store

- Reading auth context (that's the handler's job — pass user ID as an arg
  if the store needs it).
- Constructing proto messages manually (use the adapter).
- HTTP status logic (throw `ConnectError`, the handler/error-mapper will
  translate).
- Direct `process.env` reads (use `server.config`).
