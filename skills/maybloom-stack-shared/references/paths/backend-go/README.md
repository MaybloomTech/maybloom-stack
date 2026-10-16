# The Go backend path

The stack allows a service to be implemented in Go instead of TypeScript:
connect-go on stdlib `net/http`, sqlc-generated queries over pgx/v5, goose
migrations, slog. The contract, the layer vocabulary (handler → store →
adapter), and the interface are identical — a generated client cannot tell
the two backends apart. This file defines the per-layer patterns so the
skills that walk the pipeline (add-resource, add-rpc, extend-resource,
bootstrap-go) can do so on a Go service without reading any external
codebase. Two production services walked this path in 2026 and the
patterns below are theirs.

Sections: Detecting a Go backend · Layer map · Codegen · Migration
(goose) · Queries (sqlc) · Adapter · Store · Handlers · Validation ·
Wiring · Verification before claiming done · Go-specific gotchas.

## Detecting a Go backend

The repo has a `go/` directory containing `go.mod`, `sqlc.yaml`, and
`db/migrations/`. Layout:

```
go/
  cmd/<service>/main.go   thin main: load config, call run(ctx, cfg) error
  internal/
    config/               env struct + Validate()
    server/               Connect handlers, interceptors, mux wiring
    store/                stores, adapters, paging, over the sqlc output (storedb/, generated)
    postgres/             pool setup, goose migrate on boot
    auth/                 the Authenticator seam and the gating interceptor; the login, whatever shape it takes
    version/              the build stamp
  gen/                    buf output (gitignored, regenerated on build)
  db/
    db.go                 //go:embed migrations/*.sql
    migrations/           goose SQL files: the schema source of truth
    queries/              sqlc query files
  buf.gen.yaml            the Go codegen targets (local go-tool plugins)
  sqlc.yaml
  generate.go             `go generate .` runs buf then sqlc
```

The bootstrap skill scaffolds exactly this (`templates/backend-go/`), with
`Note` as the specimen in every layer; read its files as the live
exemplar before writing a new resource.

A larger service may package by domain instead (`internal/<domain>/`
holding that domain's handlers, store and adapters, with a `Service`
struct per domain and a leaf `internal/server` for the cross-cutting
code). Detect it by the presence of resource-named directories under
`internal/`; the per-layer patterns below are the same, only the file
paths move into the domain directory.

If both `packages/backend/` and `go/` exist, ask the user which service the
resource belongs to — backend choice is per-service, never per-RPC.

## Layer map

The pipeline order is the same as the TypeScript path. What changes is
where each layer lives and which generator runs:

| Step | TypeScript | Go |
|---|---|---|
| Proto | `proto/<APP_SLUG>/...` | identical — same files, same conventions |
| Codegen | `pnpm proto:gen` | `go generate .`, run from `go/` (buf, then sqlc; below) |
| Schema + migration | `src/db/schema.ts` + drizzle-kit | `db/migrations/000N_*.sql` (goose) — migrations ARE the schema |
| Queries | Drizzle query builder, inline in store | `db/queries/<resources>.sql` + `go tool sqlc generate` |
| Adapter | `src/core/<resources>/adapter.ts` | `internal/store/adapters.go` (or `<resources>_adapter.go` once long) |
| Store | `src/core/<resources>/store.ts` | `internal/store/<resources>.go` |
| Handlers | `src/handlers/<method>.ts`, one file per RPC | `internal/server/<resources>.go`, one method per RPC |
| Wiring | add each handler to the ServiceImpl object in `main.ts` | nothing — the generated handler interface enforces exhaustiveness |
| Interface | React Query hooks + screen | identical — the client is generated from the same proto |

## Codegen

The Go targets live in `go/buf.gen.yaml`, separate from the root template
pnpm runs for TypeScript, and every plugin is a `go tool` binary pinned in
`go.mod` (buf itself included), so generation needs no network and no
JavaScript toolchain:

```yaml
version: v2
plugins:
  - local: ["go", "tool", "protoc-gen-go"]
    out: gen
    opt: paths=source_relative
  - local: ["go", "tool", "protoc-gen-connect-go"]
    out: gen
    opt: paths=source_relative
```

Run it **from `go/`**, pointed up at the contract:

```bash
cd go && go tool buf generate ../proto --template buf.gen.yaml
```

`go tool` resolves the pinned buf only inside the module, and `out: gen`
is relative to that directory, so the output lands in `go/gen/`. If the
repo's `pnpm proto:gen` script wraps this command too, use it; either way
the Go build (and the Dockerfile) runs the `go tool buf` form.

For proto package `<APP_SLUG>.service.v1` this generates
`servicev1` (messages) and `servicev1connect` (the handler interface and
`New<APP_NAME>ServiceHandler`), imported as
`<GO_MODULE>/gen/<APP_SLUG>/service/v1/servicev1connect`. Every proto
file needs a `go_package` option of the form
`<GO_MODULE>/gen/<APP_SLUG>/service/v1;servicev1`. Never edit generated
files; never commit `go/gen/` or `internal/store/storedb/`.

## Migration (goose)

New SQL file in `db/migrations/`, numbered after the last one. Append-only,
one logical change per file, schema statements only:

```sql
-- +goose Up
CREATE TABLE <resources> (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title       text NOT NULL,
    body        text NOT NULL DEFAULT '',
    created_by  text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz,
    archived_at timestamptz
);
CREATE INDEX <resources>_created_at_idx ON <resources> (created_at DESC, id DESC);

-- +goose Down
DROP TABLE <resources>;
```

Ids are uuids the database assigns (`RETURNING *` hands them back), the
list's keyset `(created_at, id)` has its index from day one, and
`archived_at` is there because removal is archival.

Column mapping follows the same table as the Drizzle reference: proto
`string` → `text`, `int32` → `integer`, `bool` → `boolean`,
`google.protobuf.Timestamp` → `timestamptz`, proto `optional` → nullable
(no NOT NULL), proto enum → a Postgres enum type created in the same
migration. `Down` sections are best-effort dev conveniences.

Migrations are embedded (`go/db/db.go`, a tiny package beside the
directory, because embed paths cannot reach up the tree) and applied on
boot through `goose.NewProvider(...).Up(ctx)`, so there is no separate
"apply" step in dev — boot the server and watch the log. Migrations are
schema-only; seed data is a store function switched by config.

## Queries (sqlc)

New file `db/queries/<resources>.sql`, one named query per store need:

```sql
-- name: Create<Resource> :one
INSERT INTO <resources> (title, body, created_by)
VALUES ($1, $2, $3)
RETURNING *;

-- name: Update<Resource> :one
UPDATE <resources>
SET title = sqlc.arg(title), body = sqlc.arg(body),
    archived_at = CASE WHEN sqlc.arg(archived)::bool THEN COALESCE(archived_at, now()) ELSE NULL END,
    updated_at = now()
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: Get<Resource> :one
SELECT * FROM <resources> WHERE id = $1;

-- name: List<Resources> :many
-- Newest first, keyset-paged on (created_at, id); archived rows only when asked.
SELECT * FROM <resources>
WHERE (sqlc.arg(include_archived)::bool OR archived_at IS NULL)
  AND (sqlc.narg(before_created_at)::timestamptz IS NULL
       OR (created_at, id) < (sqlc.narg(before_created_at), sqlc.narg(before_id)::uuid))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_size);
```

The Update sets `archived_at = CASE WHEN sqlc.arg(archived)::bool THEN
COALESCE(archived_at, now()) ELSE NULL END` beside the columns it
replaces: archival is the default removal, and the bootstrap's
`db/queries/notes.sql` is the full set. A hard delete, for leaf data
only, is `-- name: Delete<Resource> :execrows` with `DELETE ... WHERE id =
$1`; `:execrows` lets the store tell "deleted" from "was never there".

Then regenerate:

```bash
cd go && go generate .
```

sqlc reads the schema from `db/migrations/` (that's why the migration must
exist first) and writes into `internal/store/storedb/`: a
`<Resource>` row struct, `Create<Resource>Params`, and `Querier` methods.

## Adapter

`internal/store/adapters.go` (one file while it is short; a
`<resources>_adapter.go` beside it once it is not). Pure functions, no
I/O, the only place both shapes are known — same rules as TypeScript:

```go
func <resource>ToProto(r storedb.<Resource>) *resourcesv1.<Resource> {
    return &resourcesv1.<Resource>{
        Id:         uuidString(r.ID),
        Title:      r.Title,
        Body:       r.Body,
        CreatedBy:  r.CreatedBy,
        CreatedAt:  timestamp(r.CreatedAt),
        UpdatedAt:  timestamp(r.UpdatedAt),
        ArchivedAt: timestamp(r.ArchivedAt),
    }
}

// The helpers the bootstrap's adapters.go ships: uuidString ("" for an
// invalid pgtype.UUID), timestamp (nil for a NULL column, so the proto
// optional field is unset rather than epoch), argUUID (a request id that
// does not parse is CodeInvalidArgument), and for nullable text columns
// textOrNull, which maps proto's empty-string default to SQL NULL:
func textOrNull(s string) pgtype.Text {
    return pgtype.Text{String: s, Valid: strings.TrimSpace(s) != ""}
}
```

The empty-string-vs-NULL semantics are contract-wide, not per-language:
proto strings have no NULL, so NULL columns become `""` on the way out and
`""` becomes NULL on the way in *only* where the column is nullable. See
`../../proto-conventions.md`.

## Store

`internal/store/<resources>.go`. Business logic; accepts and returns proto
messages; speaks Connect error codes directly (the Go mirror of stores
throwing `ConnectError`):

```go
func (s *Store) Get<Resource>(ctx context.Context, id string) (*resourcesv1.<Resource>, error) {
    uid, err := argUUID(id)
    if err != nil {
        return nil, err
    }
    row, err := s.q.Get<Resource>(ctx, s.pool, uid)
    if errors.Is(err, pgx.ErrNoRows) {
        return nil, connect.NewError(connect.CodeNotFound, errors.New("<resource> not found"))
    }
    if err != nil {
        return nil, internalError("could not read the <resource>", err)
    }
    return <resource>ToProto(row), nil
}

func (s *Store) Create<Resource>(ctx context.Context, createdBy string, in *resourcesv1.<Resource>) (*resourcesv1.<Resource>, error) {
    row, err := s.q.Create<Resource>(ctx, s.pool, storedb.Create<Resource>Params{
        Title: in.GetTitle(), Body: in.GetBody(), CreatedBy: createdBy,
    })
    if err != nil {
        return nil, internalError("could not create the <resource>", err)
    }
    return <resource>ToProto(row), nil
}

func (s *Store) List<Resources>(ctx context.Context, f <Resource>Filter) (<Resource>Page, error) {
    w, err := newPageWindow(f.PageSize, f.PageToken, default<Resource>Page, max<Resource>Page)
    if err != nil {
        return <Resource>Page{}, err
    }
    rows, err := s.q.List<Resources>(ctx, s.pool, storedb.List<Resources>Params{
        IncludeArchived: f.IncludeArchived, BeforeCreatedAt: w.before, BeforeID: w.beforeID, PageSize: w.limit,
    })
    if err != nil {
        return <Resource>Page{}, internalError("could not list the <resources>", err)
    }
    rows, next := trimPage(w, rows, func(r storedb.<Resource>) (time.Time, pgtype.UUID) { return r.CreatedAt.Time, r.ID })
    return <Resource>Page{<Resources>: <resources>ToProto(rows), NextPageToken: next}, nil
}
```

`newPageWindow`, `trimPage` and the token codec live in `paging.go`,
shipped by the bootstrap; `internalError` (a `CodeInternal` whose message
is public and whose cause is logged, never sent) in `store.go`. The id
comes from the database, not from `uuid.NewString()`, and `createdBy` is
an argument because the handler, not the store, knows who is calling.

Conventions:

- `CodeNotFound` for missing rows (never a 500 for an unknown id),
  `CodeAlreadyExists` for unique violations (match SQLSTATE 23505 via
  `pgconn.PgError` + `errors.AsType`), `CodeFailedPrecondition` for a
  well-formed request the current state forbids, `CodeInvalidArgument`
  only for what protovalidate cannot express (a page token the service
  did not issue, an id that does not parse).
- **connect-go sends `err.Error()` to the client.** A plain wrapped error
  returned from a handler reaches the wire as `CodeUnknown` with the full
  message, and `connect.NewError(CodeInternal, fmt.Errorf("...: %w", err))`
  sends the driver's text too. The scaffold's `rpcerr.Internal(public,
  cause)` (`internalError` inside the store) is the answer: `Error()` is the public text, `Unwrap()` the
  cause, and the logging interceptor logs the cause. The message the
  client sees is part of the contract; the cause never is.
- **Make errors per call, never in a package variable.** The `RequestID`
  interceptor writes the id into the error's `Meta()`, so a shared
  `var errNotFound = connect.NewError(...)` is one header map every
  missing request writes at once. `func noteNotFound() error` is the
  shape.
- Multi-table mutations go through `RunInTx(ctx, func(ctx, tx) error)`
  (added to `store.go` with the first one; the shape is in the module
  skeleton, Transactions)
  — the helper that retries serialization failures (SQLSTATE 40001,
  40P01). Every generated query method takes a `DBTX`
  (`emit_methods_with_db_argument`), so the same `Querier` works against
  the pool or the tx; pass `tx`, never the pool, from inside. This is the
  Go equivalent of every shape in `tx-patterns.md` — the ground rules
  there (validate before opening, load before-row, adapter stays pure)
  apply unchanged.
- `updated_at` is set server-side in the SQL (`now()`), mirroring the
  TypeScript store's `updatedAt: new Date()`.

## Handlers

`internal/server/<resources>.go` — one method per RPC on the `Service`
struct. The struct must satisfy the generated
`servicev1connect.<APP_NAME>ServiceHandler` interface, which is the same
exhaustiveness guarantee as `ServiceImpl<typeof <APP_NAME>Service>`: the
build fails until every declared RPC has a method.

```go
func (s *Service) Create<Resource>(
    ctx context.Context,
    req *connect.Request[servicev1.Create<Resource>Request],
) (*connect.Response[servicev1.Create<Resource>Response], error) {
    id := auth.IdentityFrom(ctx) // set by the auth interceptor
    if id == nil {
        return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("sign in first"))
    }
    created, err := s.store.Create<Resource>(ctx, id.UserID, req.Msg.Get<Resource>())
    if err != nil {
        return nil, err
    }
    return connect.NewResponse(&servicev1.Create<Resource>Response{<Resource>: created}), nil
}
```

Handlers read identity from the context the auth interceptor populated,
call the store, wrap in `connect.NewResponse`. The twenty-line rule
applies: more logic than that belongs in the store. Recovery, the request
id, logging, auth and validation are interceptors declared once at
handler construction — a new RPC gets all of them for free, no per-route
wiring. There is no `nil` check on the request's resource: the field is
`required` in the contract and the validate interceptor is the nil guard.

## Validation

Input rules live in the contract as `buf.validate` options and are
enforced by the `connectrpc.com/validate` interceptor, innermost in the
chain, so a bad request never reaches the handler:

```proto
import "buf/validate/validate.proto";

message Create<Resource>Request {
  resources.v1.<Resource> <resource> = 1 [(buf.validate.field).required = true];
}
message List<Resources>Request {
  int32 page_size = 1 [(buf.validate.field).int32 = {gte: 0, lte: 200}];
  string page_token = 2;
}
```

```go
interceptors := connect.WithInterceptors(
    Recover(log), RequestID(), Logging(log), auth.Interceptor(...),
    validate.NewInterceptor(), // last = innermost; single return value
)
```

That order is the stack's: logging outside auth so a
refused request is logged, the request id outermost after recovery so
every line carries it, an audit interceptor (opt-in) between auth and
validate when a service wants one. Each is a full `connect.Interceptor`
with `WrapStreamingHandler`, never a `UnaryInterceptorFunc`, which
streaming RPCs would bypass. Rules: a message-typed request field
the handler dereferences is `required` (getters are nil-safe, field
access on a nil message is not, and the recovery interceptor would turn
that panic into a 500 any client can trigger); always-valid invariants
(lengths, enum membership) go on the resource message, presence goes on
the request envelopes; list reads carry a bounded `page_size` from the
first version.

## Wiring

None, usually. `mux.Handle(servicev1connect.New<APP_NAME>ServiceHandler(...))`
already exists in `run()`; adding RPCs to the proto service changes the
generated interface, and the compiler lists every missing method by name.
Use `go build ./...` as the checklist the way the TypeScript path uses
`pnpm typecheck`.

## Verification before claiming done

1. `go generate .` (from `go/`) ran cleanly: buf populated
   `go/gen/<APP_SLUG>/...` and sqlc validated every query against the
   schema (a typo'd column fails here, not at runtime); `pnpm lint:proto`
   is clean.
2. `go build ./...`, `go vet ./...` and `scripts/golangci-lint run` pass.
3. The server boots (`pnpm dev:backend`) — the new goose migration
   applies on boot; watch the log for it.
4. Each RPC works end-to-end, via the generated connect-go client from a
   test (`server_test.go` is the shape), or curl (Connect speaks POST +
   JSON:
   `curl -X POST http://localhost:8080/<APP_SLUG>.service.v1.<APP_NAME>Service/Get<Resource> -H 'content-type: application/json' -d '{"id":"..."}'`),
   and a request that breaks a `buf.validate` rule answers
   `invalid_argument`.

## Go-specific gotchas

- **sqlc reads the schema from `db/migrations/`** — write the migration
  before the queries or `sqlc generate` fails on the unknown table.
- **Adding a column means a new migration file**, never editing an old
  one: goose tracks applied versions by filename, and an edited applied
  file silently diverges dev from prod.
- **`pgtype` zero values are `Valid: false`**, which scans/encodes as
  NULL. Forgetting `Valid: true` on a populated `pgtype.Text` writes NULL
  and no error tells you.
- **Match Postgres errors through the wrap chain** (`errors.As` into
  `*pgconn.PgError`), never by string. Wrapped errors are the norm here.
- **Don't hand-write a struct that happens to satisfy the handler
  interface partially** — embed
  `servicev1connect.Unimplemented<APP_NAME>ServiceHandler` only in tests.
  In the real server, no embedding: full exhaustiveness is the point. (A
  brownfield filling a large interface over weeks may embed it as a
  scaffold with a grep in CI that fails while it exists; see the stack's
  adopting document.)
- **`go tool buf` only resolves from inside the module.** Run it from
  `go/` pointed at `../proto`; from the repo root it reports no such tool.
- **buf refuses to generate an empty module.** A fresh contract needs one
  RPC (`Health`) before the first generate succeeds.
- **Go 1.22 method patterns answer `OPTIONS` with 405 before middleware
  runs.** A service that enables CORS for a development client must
  register one `OPTIONS /prefix/` route, or every preflight fails.
- **A hand-built `connect.NewRequest` has an empty `Spec()`**, so an
  interceptor that branches on the method's idempotency level cannot be
  unit-tested that way; drive it through the generated handler.
- **On MariaDB, `UPDATE` reports changed rows, not matched rows** by
  default, so "rows affected == 0 means not found" is wrong when the
  update is a no-op; pre-read the row. Its DDL is also non-transactional,
  which makes one change per migration file a correctness rule.
