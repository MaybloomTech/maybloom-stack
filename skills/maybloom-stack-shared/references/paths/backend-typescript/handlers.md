# Handlers

Create one file per RPC method under
`packages/backend/src/handlers/`. Handlers are the seam between Connect-RPC
and the store: they extract context (auth, request ID), translate the
request, call the store, and shape the response.

Keep them short. If a handler needs more than ~20 lines of logic, that's
a sign the work belongs in the store.

## Pattern (read-only)

`getNote.ts` — minimal:

```ts
import { create } from "@bufbuild/protobuf";
import type { MethodImpl } from "@connectrpc/connect";
import { <APP_NAME>Service } from "<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/service/v1/service_pb";
import { Get<Resource>ResponseSchema } from "<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/service/v1/<resources>_pb";
import { get<Resource> as get<Resource>Core } from "core/<resources>/store";

export type Get<Resource>Method =
  typeof <APP_NAME>Service.method.get<Resource>;

export const get<Resource>: MethodImpl<Get<Resource>Method> = async (
  request,
) => {
  const <resource> = await get<Resource>Core(request.id);
  return create(Get<Resource>ResponseSchema, { <resource> });
};
```

## Pattern (write, user-owned)

`createNote.ts` — forces session user onto the proto:

```ts
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, type MethodImpl } from "@connectrpc/connect";
import { <APP_NAME>Service } from "<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/service/v1/service_pb";
import { Create<Resource>ResponseSchema } from "<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/service/v1/<resources>_pb";
import { kUserId } from "context";
import { create<Resource> as create<Resource>Core } from "core/<resources>/store";

export type Create<Resource>Method =
  typeof <APP_NAME>Service.method.create<Resource>;

export const create<Resource>: MethodImpl<Create<Resource>Method> = async (
  request,
  context,
) => {
  const input = request.<resource>;
  if (!input) {
    throw new ConnectError(
      "<Resource> is required",
      Code.InvalidArgument,
    );
  }
  const sessionUserId = context.values.get(kUserId);
  const createdBy = sessionUserId ?? input.createdBy ?? "";
  const <resource> = await create<Resource>Core({
    ...request,
    <resource>: { ...input, createdBy },
  });
  return create(Create<Resource>ResponseSchema, { <resource> });
};
```

## Why force `createdBy` in the handler, not the store?

The store has no idea who's calling it; it just inserts what it's given.
The handler has the auth context and is the boundary where "who is the
user" gets resolved. If the same store function is called from a CLI or
a scheduled job (no user), the caller passes whatever it wants for
`createdBy`. Keeping that policy in the handler makes the store reusable.

## List handler with filters

```ts
export const list<Resources>: MethodImpl<List<Resources>Method> = async (
  request,
) => {
  const <resources> = await list<Resources>Core({
    includeArchived: request.includeArchived ?? undefined,
  });
  return create(List<Resources>ResponseSchema, { <resources> });
};
```

`?? undefined` matters — proto's default for `optional bool` is `false`,
so passing the field through directly always sets the filter. Stores
treat undefined as "no filter", false as "exclude archived".

## Don't put in handlers

- Direct DB queries (those go in the store).
- Multi-step orchestration (compose store functions, or push the
  orchestration into a single store function).
- Logging beyond `request.log.info(...)` for security-relevant events.
- Try/catch around the store unless you're translating to a different
  Connect code; otherwise let the central error handler log it.
