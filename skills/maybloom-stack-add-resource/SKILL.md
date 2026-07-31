---
name: maybloom-stack-add-resource
description: Use ONLY when the user wants to introduce a brand-new TOP-LEVEL resource — its own proto message, its own DB table, and the standard five-RPC CRUD surface (Create / Update / Get / List / Delete) — to a project on the maybloom stack (the monorepo from `maybloom-stack-bootstrap`, or any repo whose boundary types are proto + Connect-RPC following its conventions). Covers the validated implementations — TypeScript (Fastify + Drizzle) and Go (connect-go + sqlc + pgx) — and, via the shared core reference, projects that implement the contract in any other Connect-RPC language on either the client or the server. Triggers on "add a Book resource", "scaffold CRUD for Loan", "wire up a new top-level entity end-to-end". Does NOT cover (a) adding fields or sub-tables to an existing resource — that's `maybloom-stack-extend-resource` (when it exists; until then, use the load+replace and read-modify-write patterns documented in maybloom-stack-shared/references/tx-patterns.md), or (b) adding a single non-CRUD RPC like `CheckOutBook` or a sub-resource list like `ListBookEvents` — that's `maybloom-stack-add-rpc` (when it exists; until then, follow the request/response conventions in this skill but skip the schema/migration/CRUD-handler steps). When in doubt, prefer the narrower skill.
---

# maybloom-stack-add-resource

Add one **brand-new top-level resource** end-to-end through every layer of
the maybloom stack:

```
proto      →  schema   →  adapter  →  store  →  handlers  →  wiring
                                                                ↓
                                                        api/queries/screen
```

Each layer has one canonical pattern — documented in this skill's
`references/` for the TypeScript backend and in the shared
`../maybloom-stack-shared/references/backend-go.md` for the Go backend.
Read the pattern for the layer you're working on, then write the file.
Don't skip ahead — later layers reference types from earlier ones, and
trying to write the handler before the proto exists will produce import
errors that mask the real shape mismatch.

Canonical does not mean locked. The references record the validated
pattern as it currently stands; where the project has deliberately
deviated — a different file layout, a different cache layer, its own
naming — imitate the project and keep only the core rules from
`../maybloom-stack-shared/references/core.md`. A skill run that
"corrects" a working convention back to the reference is doing damage,
not maintenance.

## Which implementation?

The pipeline is implementation-neutral; steps 2–6 differ only in where
the files live and which generator runs. Detect the target before
starting:

- **`packages/backend/` with `drizzle.config.ts`** → TypeScript backend
  (validated). The layer references in this skill's `references/` show
  this path directly.
- **`go/` with `sqlc.yaml` and `db/migrations/`** → Go backend
  (validated). Read
  `../maybloom-stack-shared/references/backend-go.md` first: it maps every
  step below to its Go location and pattern (goose migration instead of a
  Drizzle schema, sqlc query files, adapter/store/handlers in Go, no
  manual wiring step) and ends with the Go verification checklist. Steps 1
  (proto) and 7 (interface) are identical on both paths.
- **Both present** → ask the user which service owns the resource. Backend
  choice is per-service, never per-RPC.
- **Something else** — the server is in another Connect-RPC language, or
  the user names a framework the references don't cover → open path. Read
  `../maybloom-stack-shared/references/core.md`: it separates the rules
  that still bind (the contract, the layer seams, generated edges) from
  the validated-path preferences that don't, and its open-path protocol
  makes the project's own code the exemplar the way `references/` is for
  TypeScript. The sequence below still applies step for step; only the
  per-step file locations and generators come from the project instead
  of a reference.

The same logic covers the client in step 7:

- **The Expo interface** (validated) → `references/interface.md`, as step 7
  below describes.
- **An Astro site** (`packages/<name>-site`, validated) →
  `../maybloom-stack-shared/references/client-astro.md`. Read it before
  touching a site: the usual correct outcome of adding a resource is that
  no site changes at all, and the reference draws the line between content
  a site may bake in at build time and data that means the work belongs to
  an interface screen instead.
- **Anything else** → keep the api → cache → screens tiers from `core.md`
  and imitate the project's existing client code.

## When this skill is the wrong tool

This skill is shaped for *one* job: a fresh top-level resource with the full
five-RPC CRUD surface. If the request is one of the following, stop and use
the correct tool:

- **Adding a field, child table, or many-to-many to an existing resource**
  (e.g. "add `editions[]` and `author_links[]` to Book"). Use
  `maybloom-stack-extend-resource` once it exists. Until then, the
  load+replace recipe lives in
  `../maybloom-stack-shared/references/tx-patterns.md`
  ("Load + replace for M:N children") and the read-modify-write shape lives
  in the same file ("Read-modify-write with derived state").
- **Adding a single non-CRUD RPC** (workflow RPCs like `CheckOutBook`;
  sub-resource list RPCs like `ListBookEvents`). Use
  `maybloom-stack-add-rpc` once it exists. Until then, follow the
  request/response shape conventions in `references/proto.md` and
  `references/handlers.md`, but skip the schema/migration and CRUD-handler
  steps — you only need the proto request/response, the store function,
  the handler, and (on the TypeScript backend) the main.ts wiring.

Always-applicable references that the layer-by-layer docs in this skill
cross-link:

- `../maybloom-stack-shared/references/gotchas.md` — Drizzle's
  interactive rename prompt; proto field-number reuse policy.
- `../maybloom-stack-shared/references/proto-conventions.md` —
  enum defaults, oneof + flatMap narrowing, empty-string vs NULL, the
  one-service-per-project rule.
- `../maybloom-stack-shared/references/tx-patterns.md` —
  multi-step transaction shapes when a store function does more than a
  single insert/update.
- `../maybloom-stack-shared/references/backend-go.md` —
  the per-layer patterns when the target service is the Go backend
  (see "Which implementation?" above).
- `../maybloom-stack-shared/references/core.md` —
  the language-neutral core rules and the open-path protocol, when the
  project's client or server isn't a validated implementation.

## Inputs you need from the user

- **Resource name (PascalCase singular)** — e.g. `Book`. Becomes the proto
  message, the schema variable (plural: `books`), the type names, the path
  segment under `core/`, and the file names under `handlers/`.
- **Fields** — name, type, optionality. Map to proto field types and DB
  column types. If unsure, ask: keep proto and schema field types aligned
  (string ↔ text, int32 ↔ integer, bool ↔ boolean, timestamp ↔
  timestamptz).
- **RPC surface** — default to the standard five (`Create`, `Update`, `Get`,
  `List`, `Delete`). Skip whichever the user doesn't need; add list filters,
  reactions, etc. as they describe.
- **Whether the resource is user-owned** — affects the handler. If yes,
  the handler reads the session user from the request context and forces
  it onto the proto before it reaches the store. `createNote.ts` in the
  bootstrap scaffold shows the TypeScript shape (`kUserId` context key);
  the create-handler pattern in
  `../maybloom-stack-shared/references/backend-go.md` shows the Go shape
  (interceptor-populated context).

## Variables in the templates

Most templates use these placeholder names. Substitute mentally as you write:

| Placeholder | Example |
|---|---|
| `<Resource>` | `Book` (PascalCase singular) |
| `<resource>` | `book` (camelCase singular) |
| `<resources>` | `books` (camelCase plural — table name, list field name) |
| `<APP_SLUG>` | `foobar` (read from existing `proto/<APP_SLUG>/`) |
| `<APP_NAME>` | `Foobar` (read from existing `<APP_NAME>Service` in service.proto) |
| `<ORG_SCOPE>` | `@foobar-tech` (read from any package.json) |

Detect `<APP_SLUG>`, `<APP_NAME>`, and `<ORG_SCOPE>` once at the start by
inspecting the existing repo — don't ask the user.

## Sequence

Work through the layers in order. After each one, the project should still
compile — it won't pass tests until everything is wired, but the cheapest
quick-feedback signal is `pnpm typecheck` on the TypeScript backend and
`go build ./...` on the Go backend.

Steps 2–6 name the two validated backend paths explicitly; follow the one
you detected in "Which implementation?" and ignore the other. Don't
translate the TypeScript instructions into Go by analogy — the Go path
has its own reference with its own file locations and generators. On an
open path, walk the same steps with `core.md` naming what each layer must
do and the project's existing code showing how it does it.

### 1. Proto

Identical on both backends. Read `references/proto.md`. Write two new
files and edit one:

- New: `proto/<APP_SLUG>/resources/v1/<resources>.proto` — the data model.
- New: `proto/<APP_SLUG>/service/v1/<resources>.proto` — request/response
  messages for each RPC method.
- Edit: `proto/<APP_SLUG>/service/v1/service.proto` — import the new file
  and add `rpc` lines to the service body.

Then regenerate:

```bash
pnpm proto:gen
```

This populates `packages/protocol-buffers/src/<APP_SLUG>/...` and, when
the repo has a Go service, `go/gen/<APP_SLUG>/...` (if the Go output is
missing, `buf.gen.yaml` lacks the Go plugins — see the "Codegen" section
of `../maybloom-stack-shared/references/backend-go.md`). Don't edit
generated files.

### 2. Schema + migration

**TypeScript** — read `references/schema.md`. Add a
`pgTable("<resources>", ...)` block to
`packages/backend/src/db/schema.ts`. Then generate the migration:

```bash
pnpm --filter <ORG_SCOPE>/backend db:generate
```

Drizzle-kit writes `drizzle/000N_*.sql`. Review it — if it includes
columns or constraints the user didn't ask for (e.g. it dropped an
unrelated column because the dev DB drifted), hand-edit the SQL or roll
back the schema change before continuing.

**Go** — read the "Migration (goose)" and "Queries (sqlc)" sections of
`../maybloom-stack-shared/references/backend-go.md`. Write the goose
migration in `go/db/migrations/` by hand (migrations *are* the schema —
there is no generator output to review) and the CRUD query file in
`go/db/queries/<resources>.sql`, then:

```bash
cd go && go tool sqlc generate
```

sqlc validates every query against the schema and writes the row structs
and `Querier` methods into `internal/store/storedb/`.

### 3. Adapter

**TypeScript** — read `references/adapter.md`. Create
`packages/backend/src/core/<resources>/adapter.ts`. The adapter:

- exports `<Resource>Row` and `New<Resource>Row` types from the schema
- exports `<resource>RowToProto(row)` that returns a proto message via
  `create(<Resource>Schema, {...})`
- exports `<resource>ToInsert(proto, id)` and `<resource>ToUpdate(proto)`
  that return DB rows
- handles enum mapping, timestamp conversion via `core/utils/timestamps`,
  and empty-string-to-null normalization

**Go** — read the "Adapter" section of `backend-go.md` (same shared
file). Create `go/internal/store/<resources>_adapter.go`: pure functions
between the sqlc row structs and proto messages, with `pgtype` carrying
the NULL side of the empty-string normalization and `timestamppb` the
timestamps. Same rules either way: the adapter is the only place both
shapes are known, and it does no I/O.

### 4. Store

**TypeScript** — read `references/store.md`. Create
`packages/backend/src/core/<resources>/store.ts`. One exported async
function per RPC: `create<Resource>`, `update<Resource>`, `get<Resource>`,
`list<Resources>`, `delete<Resource>`. Each takes the proto request type
(or `id: string` for get/delete) and uses the adapter + Drizzle.

If the resource needs to mutate other tables in the same transaction, wrap
in `server.db.transaction(async (tx) => ...)` and pass `tx` to anything
that needs it. The full shape is in
`../maybloom-stack-shared/references/tx-patterns.md`.

**Go** — read the "Store" section of `backend-go.md`. Create
`go/internal/store/<resources>.go`: one method per RPC, accepting and
returning proto messages, speaking Connect error codes directly. Wrap
multi-table mutations in `RunInTx` and pass the `tx` to every query —
the transaction shapes in `tx-patterns.md` apply unchanged.

### 5. Handlers

**TypeScript** — read `references/handlers.md`. Create one file per RPC
under `packages/backend/src/handlers/`. Each handler:

- imports the service definition and the response `*Schema` from generated
  proto
- declares `export type <Method>Method = typeof <APP_NAME>Service.method.<method>`
- exports `const <method>: MethodImpl<<Method>Method> = async (req, ctx) => {...}`
- for create/update on user-owned resources, reads `kUserId` from `ctx`
  and forces it onto the proto; for read/delete it's usually a one-line
  call to the store

**Go** — read the "Handlers" section of `backend-go.md`. Add one method
per RPC to the service struct in `go/internal/server/<resource>.go`,
satisfying the generated `<APP_NAME>ServiceHandler` interface. User-owned
create/update reads the user ID the auth interceptor put on the context;
read/delete is usually a one-line call to the store.

### 6. Wiring

**TypeScript** — read `references/main-wiring.md`. Edit
`packages/backend/src/main.ts`:

- Add imports for each new handler.
- Add the handler functions to the `<APP_SLUG>Service` ServiceImpl object.

The TypeScript compiler will refuse to compile until every RPC declared in
the proto service has a corresponding entry. Use that as your check.

Run `pnpm --filter <ORG_SCOPE>/backend typecheck` to confirm.

**Go** — nothing to edit: the mux already registers the service handler,
and the generated interface grew with the proto. Run `go build ./...` —
the compiler lists every missing method by name, which is the same
exhaustiveness check the ServiceImpl object gives TypeScript.

### 7. Interface: api wrapper, hooks, screen

Identical on both backends — the interface talks to the generated Connect
client and cannot tell which language serves it. Read
`references/interface.md`. Three files:

- `packages/interface/src/data/api/<resources>.ts` — thin functions that
  call `client.<method>(...)` and return the proto messages directly.
- `packages/interface/src/data/queries/use<Resources>.ts` — React Query
  hooks: one `useQuery` for list/get, one `useMutation` per create/update/
  delete with `onSuccess: invalidateQueries({ queryKey: [...] })`.
- A new screen under `packages/interface/app/<resources>/` (Expo Router
  file-based) or a component under `src/components/`. Use the bootstrap's
  `app/index.tsx` (the Note screen) as a reference for the minimum shape.

If the user is just adding a resource and not yet a UI for it, stop after
the data layer — the user will request the UI separately.

## Verification before claiming done

Walk through this checklist with the user (TypeScript backend — the Go
equivalent is the checklist at the end of
`../maybloom-stack-shared/references/backend-go.md`; on an open path,
translate it: codegen ran, the data layer validates against the schema,
the build passes, the service boots and migrates, every RPC exercised
end-to-end):

1. `pnpm proto:gen` ran cleanly and created files under
   `packages/protocol-buffers/src/<APP_SLUG>/resources/v1/<resources>_pb.ts`
   and `.../service/v1/<resources>_pb.ts`.
2. `pnpm --filter <ORG_SCOPE>/backend db:generate` ran cleanly and added a
   migration file with the expected `CREATE TABLE` statement.
3. `pnpm --filter <ORG_SCOPE>/backend typecheck` passes.
4. Backend boots (`pnpm dev:backend`) without runtime errors and the
   migration applies on startup (look for `[database] PGlite migrations
   applied` in the log).
5. From the interface (or curl/grpcurl), each RPC works: create, get, list,
   update, delete.

Don't claim the layer is done before each of these passes. If something
fails, debug from the bottom up: regen, then typecheck, then runtime.

## Common pitfalls

Pitfalls specific to this skill's "fresh top-level resource" job:

- **Forgot to regenerate proto.** Symptoms: `Cannot find module '...resources/v1/<resources>_pb.js'`. Fix: `pnpm proto:gen`.
- **Forgot to add the RPC to `service.proto`.** Symptoms: handler imports
  `<APP_NAME>Service.method.<method>` and TS says it doesn't exist. Fix:
  add the `rpc` line, regen.
- **`ServiceImpl` shape mismatch in main.ts.** Symptoms: TS error with
  every method listed. Fix: every RPC in the proto service needs a key in
  the ServiceImpl object — check for typos.
- **Drizzle migration dropped unrelated stuff.** Symptoms: generated SQL
  has DROP TABLE/COLUMN statements you didn't ask for. Fix: the dev DB
  drifted from the schema — either revert your local DB changes or
  hand-edit the migration SQL. Don't apply blindly.

For the project-wide gotchas (Drizzle's interactive rename prompt; proto
field-number reuse policy; empty-string-vs-NULL semantics) see
`../maybloom-stack-shared/references/gotchas.md` and
`../maybloom-stack-shared/references/proto-conventions.md`. Go-specific
pitfalls (sqlc reads the schema from the migrations directory; `pgtype`
`Valid` flags; goose's append-only rule) are in the gotchas section of
`../maybloom-stack-shared/references/backend-go.md`.
