# Proto authoring conventions

Stack-specific rules for editing `.proto` files. Generic protobuf style
(field naming, etc.) follows Google's standard guide; this file covers
only what's distinctive about *this* stack.

The rules here are contract-level: they bind the TypeScript and Go
backends identically. Code illustrations use the TypeScript backend
(Drizzle, Connect-ES); `backend-go.md` in this directory shows the Go
shapes for the same rules (`pgtype` for the NULL side of the string
convention, the generated handler interface for the one-service rule).

## Field number policy: reuse vs reserve

See `gotchas.md` for the full rationale. The short version:

- **In active development** (no external proto consumers): reuse
  removed field numbers. Don't add `reserved N;`.
- **Once shipped to clients you don't control**: mark removed numbers
  `reserved` so they can never be reintroduced with a different type.

Check which regime the project is in before removing a field, and ask
if it is not obvious. Guessing wrong in the shipped direction corrupts
deserialization for clients already on the network.

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
