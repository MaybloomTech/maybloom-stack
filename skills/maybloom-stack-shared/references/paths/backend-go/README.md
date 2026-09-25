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
    store/                sqlc-generated package + stores + adapters
    postgres/             pool setup, goose migrate on boot
    auth/                 the login, whatever shape it takes
  gen/                    buf output (gitignored, regenerated on build)
  db/
    db.go                 //go:embed migrations/*.sql
    migrations/           goose SQL files: the schema source of truth
    queries/              sqlc query files
  buf.gen.yaml            the Go codegen targets (local go-tool plugins)
  sqlc.yaml
```

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
| Codegen | `pnpm proto:gen` | `go tool buf generate ../proto --template buf.gen.yaml`, run from `go/` (below) |
| Schema + migration | `src/db/schema.ts` + drizzle-kit | `db/migrations/000N_*.sql` (goose) — migrations ARE the schema |
| Queries | Drizzle query builder, inline in store | `db/queries/<resources>.sql` + `go tool sqlc generate` |
| Adapter | `src/core/<resources>/adapter.ts` | `internal/store/<resources>_adapter.go` |
| Store | `src/core/<resources>/store.ts` | `internal/store/<resources>.go` |
| Handlers | `src/handlers/<method>.ts`, one file per RPC | `internal/server/<resource>.go`, one method per RPC |
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
    id         text PRIMARY KEY,
    title      text NOT NULL,
    body       text NOT NULL DEFAULT '',
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

-- +goose Down
DROP TABLE <resources>;
```

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
INSERT INTO <resources> (id, title, body, created_by)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: Update<Resource> :one
UPDATE <resources>
SET title = $2, body = $3, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: Get<Resource> :one
SELECT * FROM <resources> WHERE id = $1;

-- name: List<Resources> :many
SELECT * FROM <resources> ORDER BY created_at DESC;

-- name: Delete<Resource> :execrows
DELETE FROM <resources> WHERE id = $1;
```

Then regenerate:

```bash
cd go && go tool sqlc generate
```

sqlc reads the schema from `db/migrations/` (that's why the migration must
exist first) and writes into `internal/store/storedb/`: a
`<Resource>` row struct, `Create<Resource>Params`, and `Querier` methods.
`:execrows` on Delete lets the store distinguish "deleted" from "was never
there".

## Adapter

`internal/store/<resources>_adapter.go`. Pure functions, no I/O, the only
place both shapes are known — same rules as TypeScript:

```go
package store

import (
    "strings"

    "github.com/jackc/pgx/v5/pgtype"
    "google.golang.org/protobuf/types/known/timestamppb"

    resourcesv1 "<GO_MODULE>/gen/<APP_SLUG>/resources/v1"
    "<GO_MODULE>/internal/store/storedb"
)

func <resource>RowToProto(row storedb.<Resource>) *resourcesv1.<Resource> {
    return &resourcesv1.<Resource>{
        Id:        row.ID,
        Title:     row.Title,
        Body:      row.Body,
        CreatedBy: row.CreatedBy.String, // pgtype.Text zero value is ""
        CreatedAt: timestamppb.New(row.CreatedAt.Time),
        UpdatedAt: tsOrNil(row.UpdatedAt),
    }
}

func <resource>ToCreateParams(msg *resourcesv1.<Resource>, id string) storedb.Create<Resource>Params {
    return storedb.Create<Resource>Params{
        ID:        id,
        Title:     msg.GetTitle(),
        Body:      msg.GetBody(),
        CreatedBy: textOrNull(msg.GetCreatedBy()),
    }
}

// textOrNull maps proto's empty-string default to SQL NULL for nullable
// columns; tsOrNil returns nil when the timestamptz is not Valid, so the
// proto optional field is unset rather than epoch.
func textOrNull(s string) pgtype.Text {
    return pgtype.Text{String: s, Valid: strings.TrimSpace(s) != ""}
}

func tsOrNil(t pgtype.Timestamptz) *timestamppb.Timestamp {
    if !t.Valid {
        return nil
    }
    return timestamppb.New(t.Time)
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
    row, err := s.q.Get<Resource>(ctx, s.db, id)
    if errors.Is(err, pgx.ErrNoRows) {
        return nil, connect.NewError(connect.CodeNotFound,
            errors.New("<resource> not found"))
    }
    if err != nil {
        return nil, fmt.Errorf("get <resource> %s: %w", id, err)
    }
    return <resource>RowToProto(row), nil
}

func (s *Store) Create<Resource>(ctx context.Context, msg *resourcesv1.<Resource>) (*resourcesv1.<Resource>, error) {
    id := msg.GetId()
    if id == "" {
        id = uuid.NewString()
    }
    row, err := s.q.Create<Resource>(ctx, s.db, <resource>ToCreateParams(msg, id))
    if err != nil {
        return nil, fmt.Errorf("create <resource>: %w", err)
    }
    return <resource>RowToProto(row), nil
}
```

Conventions:

- `CodeNotFound` for missing rows (never a 500 for an unknown id),
  `CodeAlreadyExists` for unique violations (match SQLSTATE 23505 via
  `pgconn.PgError` + `errors.As`), `CodeFailedPrecondition` for a
  well-formed request the current state forbids, `CodeInvalidArgument`
  only for what protovalidate cannot express.
- **connect-go sends `err.Error()` to the client.** A plain wrapped error
  returned from a handler reaches the wire as `CodeUnknown` with the full
  message, and `connect.NewError(CodeInternal, fmt.Errorf("...: %w", err))`
  sends the driver's text too. Wrap causes with `%w` inside the store so
  `errors.Is`/`errors.As` work, and hide them at the edge: either let the
  handler map unexpected errors to a fixed public message, or use a small
  wrapper whose `Error()` is the public text and whose `Unwrap()` is the
  cause, with the logging interceptor logging the cause. The message the
  client sees is part of the contract; the cause never is.
- Multi-table mutations go through `RunInTx(ctx, pool, func(ctx, tx) error)`
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

`internal/server/<resource>.go` — one method per RPC on the service
struct. The struct must satisfy the generated
`servicev1connect.<APP_NAME>ServiceHandler` interface, which is the same
exhaustiveness guarantee as `ServiceImpl<typeof <APP_NAME>Service>`: the
build fails until every declared RPC has a method.

```go
func (s *Server) Create<Resource>(
    ctx context.Context,
    req *connect.Request[servicev1.Create<Resource>Request],
) (*connect.Response[servicev1.Create<Resource>Response], error) {
    input := req.Msg.Get<Resource>()
    if input == nil {
        return nil, connect.NewError(connect.CodeInvalidArgument,
            errors.New("<resource> is required"))
    }
    if userID, ok := UserID(ctx); ok { // set by the auth interceptor
        input.CreatedBy = userID
    }
    created, err := s.store.Create<Resource>(ctx, input)
    if err != nil {
        return nil, err
    }
    return connect.NewResponse(&servicev1.Create<Resource>Response{
        <Resource>: created,
    }), nil
}
```

Handlers read identity from the context the auth interceptor populated,
call the store, wrap in `connect.NewResponse`. The twenty-line rule
applies: more logic than that belongs in the store. Auth, logging,
request IDs, panic recovery and validation are interceptors declared once
at handler construction — a new RPC gets all of them for free, no
per-route wiring. The `nil` check on `input` above is what the validate
interceptor makes unnecessary once the field is marked `required` (next
section); keep it only on a service that has not adopted protovalidate.

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
  int32 limit = 1 [(buf.validate.field).int32 = {gt: 0, lte: 200}];
}
```

```go
interceptors := connect.WithInterceptors(
    Recover(log), RequestID(), auth.Interceptor(...), Logging(log),
    validate.NewInterceptor(), // last = innermost; single return value
)
```

Rules: a message-typed request field the handler dereferences is
`required` (getters are nil-safe, field access on a nil message is not,
and the recovery interceptor would turn that panic into a 500 any client
can trigger); always-valid invariants (lengths, enum membership) go on the
resource message, presence goes on the request envelopes; list reads carry
a bounded `limit` from the first version. Mark read RPCs
`option idempotency_level = NO_SIDE_EFFECTS;` so an audit interceptor can
skip them, remembering that connect-go then also serves them over GET.

## Wiring

None, usually. `mux.Handle(servicev1connect.New<APP_NAME>ServiceHandler(...))`
already exists in `run()`; adding RPCs to the proto service changes the
generated interface, and the compiler lists every missing method by name.
Use `go build ./...` as the checklist the way the TypeScript path uses
`pnpm typecheck`.

## Verification before claiming done

1. `go tool buf generate ../proto --template buf.gen.yaml` (from `go/`)
   ran cleanly and populated `go/gen/<APP_SLUG>/...`; `go tool buf lint
   ../proto` is clean.
2. `go tool sqlc generate` (from `go/`) ran cleanly — it validates every
   query against the schema; a typo'd column fails here, not at runtime.
3. `go build ./...` and `go vet ./...` pass.
4. The server boots (`go run ./cmd/<service>`) — the new goose migration
   applies on boot; watch the log for it.
5. Each RPC works end-to-end, via the generated connect-go client from a
   test, or curl (Connect speaks POST + JSON:
   `curl -X POST http://localhost:3001/<APP_SLUG>.service.v1.<APP_NAME>Service/Get<Resource> -H 'content-type: application/json' -d '{"id":"..."}'`).

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
- **`NO_SIDE_EFFECTS` makes the RPC GET-able**, and therefore cacheable
  by an intermediary. A credential-returning read marked that way needs
  `Cache-Control: no-store`.
- **A hand-built `connect.NewRequest` has an empty `Spec()`**, so an
  interceptor that branches on the method's idempotency level cannot be
  unit-tested that way; drive it through the generated handler.
- **On MariaDB, `UPDATE` reports changed rows, not matched rows** by
  default, so "rows affected == 0 means not found" is wrong when the
  update is a no-op; pre-read the row. Its DDL is also non-transactional,
  which makes one change per migration file a correctness rule.
