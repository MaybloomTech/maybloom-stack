# Proto authoring conventions

Stack-specific rules for editing `.proto` files. Generic protobuf style
(field naming, etc.) follows Google's standard guide; this file covers
only what's distinctive about *this* stack.

The rules here are contract-level: they bind the TypeScript and Go
backends identically. Code illustrations use the TypeScript backend
(Drizzle, Connect-ES); `backend-go.md` in this directory shows the Go
shapes for the same rules (`pgtype` for the NULL side of the string
convention, the generated handler interface for the one-service rule).

## Field number policy: removed numbers are reserved

A removed field's number (and name) is marked `reserved` in the message,
always, from the first commit (decided 2026-10-15; the two-regime rule
that let a pre-launch project reuse numbers is gone, because the moment
a project ships is easy to miss and the cost of missing it is corrupted
deserialization on clients already on the network). Add `buf breaking
--against` the default branch to CI once clients you do not control
exist; `gotchas.md` has the history.

## Layout and the Go package option

`proto/<slug>/resources/v1` holds the nouns, `common/v1` holds value
types once two resources share one (the scaffold creates it empty),
`service/v1` holds one envelope file per resource plus `health.proto`
and `service.proto`, which declares the one service. Every file carries

```proto
option go_package = "<GO_MODULE>/gen/<slug>/<pkg>/v1;<pkg>v1";
```

on both backend paths, so a Go service can join later without touching
the contract. The `Health` RPC (`HealthRequest {}` → `ok`, `version`) is
in every contract: buf refuses an empty service, it is the one procedure
open to anonymous callers, and it is where a client reads which build is
serving.

The rules in this file (`buf.validate`) resolve against
`third_party/protovalidate/buf/validate/validate.proto`, vendored as a
second, lint-ignored module in `buf.yaml`, so generation needs no
registry; the TypeScript target emits it through `include_imports`.

## Empty strings vs absent strings vs NULL

Proto3 has no nullable strings. `string foo = 1;` defaults to `""` on
the wire if unset. `optional string foo = 1;` adds presence tracking
so generated code can distinguish "client sent empty" from "client
didn't set it." The DB layer is where NULL lives.

The convention in this stack:

- For required-feeling fields with a meaningful empty value (titles,
  bodies, etc.): plain `string`. Map to `text("...").notNull()` in
  Drizzle, no presence semantics.
- For "may not exist yet" fields (description, avatar URL, updatedAt):
  `optional` in proto, **nullable** in Drizzle. Adapter normalizes
  `""` → `NULL` on insert and `NULL` → `""` on read.
- Timestamps that fire on update (`updated_at`): `optional
  google.protobuf.Timestamp`. Required ones (`created_at`):
  non-optional.

The bootstrap's `noteToInsert` shows the `emptyStringToNull` helper.
Always run user-supplied strings through it before insert when the
column is nullable; never apply it to columns that are `notNull`.

## Enums

Convention from the maybloom resources protos:

```proto
enum UserKind {
  USER_KIND_UNSPECIFIED = 0;
  USER_KIND_HUMAN = 1;
  USER_KIND_SERVICE = 2;
}
```

Three rules:

1. Always include `<NAME>_UNSPECIFIED = 0`. Proto3 enums default to 0
   on the wire; if `_UNSPECIFIED` is absent, an unset enum gets the
   first declared value silently — a footgun.
2. Prefix every value with the enum name. `USER_KIND_HUMAN`, not just
   `HUMAN`. This avoids collisions when the same logical word
   (`ARCHIVED`, `DRAFT`) appears in multiple enums.
3. The Drizzle column is a `pgEnum` whose values match the proto
   *names* (not numbers). Adapter maps them. If the project has a
   helper that derives the Drizzle list from the proto type, use it;
   otherwise keep the lists in sync by hand and add a comment
   pointing to the proto enum.

## `oneof` and TypeScript narrowing

When a proto message has a `oneof`, Connect-ES emits a discriminated
union for that field. Iterating arrays of such messages and
extracting one variant looks like this:

```ts
import type { BookEvent } from "<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/resources/v1/books_pb";

// BookEvent.detail is a oneof with `case: "stateChange" | "fieldUpdate" | ...`
function stateChanges(events: BookEvent[]) {
  return events.flatMap((event) =>
    event.detail.case === "stateChange" ? [event.detail.value] : [],
  );
}
```

The idiom is `flatMap(x => predicate(x) ? [x.something] : [])`. Three
reasons this works where `filter().map()` doesn't:

1. `filter` doesn't narrow the union type for chained `.map`, so TS
   still sees the full union and complains.
2. The inline ternary inside `flatMap` *does* narrow because the
   true-branch's `[x.something]` is type-checked under the
   already-narrowed `case === "..."` guard.
3. `flatMap` returns the right element type (the unwrapped variant)
   without a cast.

This pattern recurs anywhere a oneof is iterated. If you find yourself
reaching for `as` casts on a oneof, this is the first thing to try.

## Service definition lives in `service.proto`

There is exactly one `service` block per project, named
`<APP_NAME>Service`, in `proto/<slug>/service/v1/service.proto`. RPCs
group by resource using comment headers (`// Book management`, etc.)
but they all live on the same service. Clients import one service def
and get a typed client for the whole API.

Don't split into multiple service blocks. The bootstrap's main.ts is
keyed off `typeof <APP_NAME>Service` — multiple services would mean
multiple `ServiceImpl` objects and multiple `router.service()`
registrations, which the conventions don't currently support.

## Request/response message conventions

- Request type: `<Verb><Resource>Request`. Response type:
  `<Verb><Resource>Response`.
- Singular wrapper field for a single resource: the field name is the
  resource lowercased — `Book book = 1;`, `Note note = 1;`.
- Plural wrapper field for a list: pluralized resource name —
  `repeated Book books = 1;`.
- Empty Delete responses: `message DeleteFooResponse {}` — don't
  reuse a generic `Empty` from `google.protobuf`; the named empty
  message lets you add fields later without breaking the wire.
- Nested writes (e.g. `CreateTaskRequest` carrying an `initial_post`):
  put the optional related resource as an `optional <Other> ...` field
  at the request level, not inside the main resource message. Keeps
  the resource shape clean for reads.
- Selectors are surrogate ids (`string id`, or `int32 event_id` on an
  integer-keyed system), never a unique name, even where a REST URL
  used the name. The name is a read-only display field on the resource.
- List requests page by cursor from the first version: `int32 page_size`
  (validated `gte: 0, lte: <cap>`; 0 means the default), `string
  page_token` (opaque, from the previous answer), and `string
  next_page_token` on the response, empty on the last page. No offset,
  no `total_size`: a count is a second query the client rarely needs,
  and an offset shifts under inserts. For time-ordered data add a
  `min_time`/`max_time` window. The token is the keyset of the last row
  (`created_at, id`), encoded by the server; a token the service did not
  issue is `CodeInvalidArgument`. An empty list request that reads a
  whole table is a smell.
- Removal is archival by default: the resource carries `optional
  google.protobuf.Timestamp archived_at`, the Update request carries
  `bool archived`, the row stays, and lists leave archived rows out
  unless `include_archived` is set. A hard `Delete<Resource>` RPC is the
  option for leaf data nothing references, named as such in its comment.
- Calendar dates (a due date, a day in a schedule) are `YYYY-MM-DD`
  strings, never timestamps, and "today" is supplied by the client,
  because the server has no time zone to resolve it in.
- Derived read-only fields go where the thing they describe lives: a
  fact about the caller (`viewer_may_edit`) on the response envelope, a
  fact about a member of the resource (`has_access` on a link) on the
  resource, output-only and documented as such.

## Validation constraints

`buf.validate` options carry the input rules, and the Go path enforces
them in the validate interceptor (the TypeScript path can with
`@bufbuild/protovalidate`; until then its stores check presence):

```proto
import "buf/validate/validate.proto";

message CreateBookRequest {
  // required: the handler dereferences it, and the validate
  // interceptor is the only nil guard.
  resources.v1.Book book = 1 [(buf.validate.field).required = true];
}

message GetBookRequest {
  string id = 1 [(buf.validate.field).string.uuid = true];
}
```

Rules: always-valid invariants (lengths, enum membership) on the resource
message, presence on the request envelopes, since create and update reuse
the resource message with most of it unset. Ids on request envelopes are
`uuid`; `page_size` is bounded.

`option idempotency_level = NO_SIDE_EFFECTS` is not used in this stack
(dropped 2026-10-15): it was carried as a read marker for an audit
interceptor, and it also makes the RPC GET-able and cacheable by any
intermediary, a second meaning nobody asked for. A service that audits
mutations keeps its own list of the RPCs it records; audit is opt-in.
