---
name: maybloom-stack-extend-resource
description: Use whenever the user wants to change the shape of a resource that ALREADY EXISTS in a maybloom stack project (a proto + Connect-RPC monorepo, from `maybloom-stack-bootstrap` or following its conventions) — adding a field, making a field optional, adding an enum value, attaching a child table (1:N), or linking two resources many-to-many. Triggers on "add a due date to Task", "Books need an editions list", "let me tag notes", "add a status enum to Loan", "Book should link to multiple Authors". Works on both validated server paths (TypeScript/Drizzle, Go/sqlc) and on open paths through the shared core reference. Prefer this over `maybloom-stack-add-resource` whenever the resource already exists — the RPC surface usually does not change here, and the work is concentrated in wire compatibility and migrating rows that are already in the database, which add-resource does not cover. Use `maybloom-stack-add-rpc` instead if the request is a new operation rather than new data.
---

# maybloom-stack-extend-resource

Change the shape of a resource that already exists. The five CRUD RPCs
usually stay exactly as they are — `UpdateBook` already carries the whole
`Book`, so a new field on `Book` is automatically writable — and that is
what makes this a different job from adding a resource:

```
proto  →  schema + migration  →  adapter  →  store  →  (handlers usually untouched)
                                                                ↓
                                                    api unchanged / queries / screen
```

The two places this goes wrong are the two places nothing tells you:
**the wire** (old clients still in the field, field numbers that can never
be reused) and **the rows already in the database** (a NOT NULL column
added to a populated table fails, or silently backfills a wrong default).
Everything else is ordinary layer work.

## Which implementation?

Detect the target before starting; the shape of the change is identical,
only the schema and store mechanics differ.

- **`packages/backend/` with `drizzle.config.ts`** → TypeScript. Read
  `../maybloom-stack-shared/references/paths/backend-typescript/README.md`
  and, per layer, `schema.md`, `adapter.md`, `store.md`.
- **`go/` with `sqlc.yaml` and `db/migrations/`** → Go. Read
  `../maybloom-stack-shared/references/paths/backend-go/README.md`. Note
  its rule that sqlc reads the schema from the migrations, so the
  migration lands before the queries or generation fails.
- **Both present** → ask which service owns the resource.
- **Something else** → open path. Read
  `../maybloom-stack-shared/references/core.md` and imitate the project's
  own code for everything the core doesn't govern.

For the client, `../maybloom-stack-shared/references/paths/client-expo/README.md`
covers the Expo interface; a site on the Astro path usually needs nothing
(`../maybloom-stack-shared/references/paths/client-astro/README.md`).

## Pick the shape first

Five shapes cover almost every request. Naming the shape decides the work,
so do it before touching a file — the differences between them are exactly
where the mistakes live.

| Shape | Example | Proto | Storage |
|---|---|---|---|
| Scalar field | "add a due date to Task" | new field, next free number | new column |
| Optional scalar | "priority, but it can be unset" | `optional` scalar | nullable column |
| Enum value | "add ARCHIVED to Status" | append to enum | no migration unless the column is a PG enum |
| Child collection (1:N) | "Books have editions" | `repeated Edition editions` | child table with FK |
| Link (M:N) | "Books link to Authors" | `repeated BookAuthorLink` | join table |

If the answer is "the user wants a new operation" (`CheckOutBook`,
`ListBookEvents`), this is the wrong skill — use `maybloom-stack-add-rpc`.
If the resource does not exist yet, use `maybloom-stack-add-resource`.

## Wire compatibility, before you write anything

Field numbers are the contract's memory. Read
`../maybloom-stack-shared/references/proto-conventions.md` for the full
policy; the short version that governs this skill:

- **Take the next free number.** Never reuse a number, even one whose
  field was deleted years ago — a client built against the old schema will
  decode the new field as the old one and be confidently wrong.
- **Deleting a field means `reserved`**, both the number and the name, so
  the compiler stops the next person from reusing it.
- **Adding a field is always safe on the wire**; a client that doesn't
  know it ignores it. Removing or renumbering is not, and neither is
  changing a type.
- **Enums append.** Existing numbers keep their meaning, and consumers
  that don't know the new value see the raw number, so ship the client
  handling before the server starts emitting it.

Say plainly which of these applies. "This is additive and safe for
deployed clients" is worth one sentence in the summary; so is "this
renames a field, which is a break, and here is the two-step".

## Migrating rows that already exist

A new column lands in a table that already has data, so the default
matters more than the column.

- **A required scalar needs a value for existing rows.** Either give the
  column a SQL default (`NOT NULL DEFAULT ''`, `DEFAULT 0`, `DEFAULT now()`)
  or add it nullable, backfill, then tighten. Say which you chose and why.
- **Prefer the stack's empty-string convention** over NULL for strings the
  proto declares non-optional: proto has no NULL, so a nullable column
  round-trips as `""` anyway. `optional string` is the signal that absence
  is meaningful — see the empty-string section of
  `../maybloom-stack-shared/references/proto-conventions.md`.
- **On Go, the migration is append-only.** New file, never an edit to an
  applied one; goose tracks by filename and an edited file diverges dev
  from production silently.
- **On TypeScript, generate the migration, then read it.** `pnpm
  db:generate` may ask whether a column was renamed or dropped-and-added;
  answering by reflex is how data disappears. The prompt is documented in
  `../maybloom-stack-shared/references/gotchas.md`.

## Sequence

Work in order. Later layers use types from earlier ones, and a store
written before the adapter knows the new field produces type errors that
look like store bugs.

### 1. Proto

Add the field to the resource message in
`proto/<APP_SLUG>/resources/v1/<resources>.proto`, with the next free
number and a comment saying what it means — field comments are
load-bearing documentation here, and on a contract-rendering site they are
what the published page shows.

For a child collection or a link, add the child message (or the
`<A><B>Link` message) in the same file rather than embedding another
resource, then reference it with `repeated`. Cross-resource links get
dedicated link messages so the two resources stay independently
fetchable.

The request/response envelopes in `service/v1/` usually need no change:
create and update carry the whole resource. If the child collection should
be writable independently of its parent, that is a new RPC — finish here
and hand off to `maybloom-stack-add-rpc`.

Then regenerate (`pnpm proto:gen`) and let the compiler show you every
place the new field must be handled.

### 2. Schema + migration

**TypeScript** — add the column to the `pgTable` in
`packages/backend/src/db/schema.ts`, a child table with a FK for 1:N, or a
join table with a composite primary key for M:N. Then `pnpm db:generate`
and read the generated SQL before applying it.

**Go** — new numbered file in `db/migrations/`, `-- +goose Up` and
`-- +goose Down`. Then add or extend the query files in `db/queries/` and
run `go tool sqlc generate` from `go/`.

### 3. Adapter

The adapter is where the new field crosses between shapes, and it is the
layer most often forgotten — a field added to proto and schema but not to
the adapter compiles on some paths and silently reads as empty.

Map the new column both ways. For a child collection, the adapter gains a
function that turns child rows into the repeated proto field; keep it pure
(no queries) and let the store do the loading.

### 4. Store

A scalar usually needs no store change at all: it flows through the
adapter. The shapes that do need work are the collections, and both
recipes are in
`../maybloom-stack-shared/references/tx-patterns.md`:

- **Child collections and links** use *load + replace* inside a
  transaction — delete the child rows for the parent and re-insert what
  the request carries, rather than diffing. It is shorter, and it makes
  the write idempotent.
- **Anything derived from the new field** (a counter, a status that
  depends on it) uses *read-modify-write*: load the current row inside the
  transaction, compute, write.
- **List queries that now return children** use an aggregate loader —
  batch the child rows for the whole page rather than one query per parent.

### 5. Handlers and wiring

Usually nothing. The RPCs already exist and their request messages already
carry the whole resource. Touch a handler only if the new field needs
identity from the request context (a `created_by`-style field) or presence
validation the store shouldn't own.

Wiring changes only if you added an RPC, which means you are in the wrong
skill.

### 6. Client

- **api wrapper** — usually unchanged; it passes the whole resource.
- **queries/mutations** — unchanged unless a new list query appeared. If
  the resource now carries children, check that the item and list cache
  keys still invalidate together after a mutation.
- **screens** — this is where the real work is. A new field shows up in
  forms and detail views, and a new child collection usually means a small
  list plus an editor.

## Verification before claiming done

The compiler carries most of this, but it cannot see the two failures that
matter, so check them by hand.

1. Typecheck the whole repo (`pnpm typecheck`, or `go build ./...` and
   `go vet ./...`), not just the package you edited — the interface fails
   here when a screen still constructs the old shape.
2. The migration applies to a database that **already has rows**, not just
   a fresh one. Boot against a seeded dev database and read the log.
3. Round-trip the field for real: write it through Update, read it back
   through Get, confirm the value survived. An adapter that drops a field
   passes every type check and fails this.
4. For a collection: save a parent with two children, then with one, and
   confirm the removed child is gone rather than orphaned.
5. Confirm the wire story out loud — additive and safe, or a break with a
   named migration path.
6. Generated code is absent from `git status`.

## Common pitfalls

- **Adding the field everywhere except the adapter.** It compiles, and the
  value is silently always empty. If a field reads back empty, look here
  first.
- **Reusing a field number** freed by a deleted field. Nothing fails at
  build time; old clients decode garbage.
- **`NOT NULL` with no default on a populated table.** The migration
  fails, and the temptation is to drop the constraint rather than pick a
  default deliberately.
- **Diffing children instead of load + replace.** Longer, and it usually
  loses the "removed" case.
- **Editing an applied Go migration** instead of adding one.
- **Extending a resource when the user asked for an operation.** "Mark a
  book as checked out" is an RPC, not a boolean the client sets — the RPC
  is where the rule about who may set it can live.
