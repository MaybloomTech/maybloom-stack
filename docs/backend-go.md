---
title: "Backend: Go"
description: The connect-go + sqlc + pgx blueprint
order: 4
---

# Backend: Go

The Go backend is a peer of the TypeScript one: the same contract, the same
handler → store → adapter vocabulary, the same generated-edges philosophy,
implemented with the current Go idiom. It exists for workloads where a
single static binary, a small memory footprint, and Go's concurrency model
earn their keep. The criteria for choosing it live in
[Choosing a runtime](./choosing.md).

This blueprint is grounded in two sources: the modern Go service consensus
(stdlib `net/http`, sqlc, pgx, goose, slog) and a close reading of
production Go systems, which supplied infrastructure patterns worth
generalizing and lessons about what to avoid. The final section lists both,
explicitly.

## Runtime choices at a glance

| Concern | Choice | TypeScript equivalent |
|---|---|---|
| RPC | connect-go on stdlib `net/http` | Connect plugin on Fastify |
| Data layer | sqlc-generated queries over pgx/v5 | Drizzle ORM |
| Schema truth | `db/migrations/*.sql` (goose format) | `src/db/schema.ts` |
| Migrations | goose, embedded, applied on boot | drizzle-kit, manual in prod |
| Dev database | embedded-postgres (real Postgres, no Docker) | PGlite |
| Config | struct + env tags + `Validate()` | TypeBox + `@fastify/env` |
| Logging | `log/slog`, JSON handler | Fastify pino logger |
| Codegen pinning | `go tool` directives in go.mod | pnpm catalog |

connect-go serves the same wire protocol the interface already speaks, so a
Go service and a TypeScript service are indistinguishable to a generated
client. It is a library on plain `net/http` rather than a framework: routing
is the stdlib `ServeMux`, middleware is `func(http.Handler) http.Handler`,
and anything that works with `http.Server` works here.

## Module layout

One Go module per repo, at `go/`:

```
go/
  cmd/<service>/main.go   thin main: parse config, call run(ctx, cfg) error
  internal/
    server/               Connect handlers, interceptors, mux wiring
    store/                sqlc-generated package + hand-written stores + adapters
    postgres/             pool setup, goose migrate, embedded-postgres for dev
  gen/                    buf output (gitignored, regenerated on build)
  db/
    migrations/           goose SQL files: the schema source of truth
    queries/              sqlc query files
  sqlc.yaml
```

Everything lives under `internal/` because nothing here is a library for
strangers; the contract is the public API. `main.go` stays under ten lines
and delegates to `run(ctx context.Context, cfg Config) error` so the whole
server is testable as a function.

## The server

```go
func run(ctx context.Context, cfg Config) error {
    ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
    defer stop()

    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    slog.SetDefault(logger)

    db, err := postgres.Open(ctx, cfg.DatabaseURL) // migrates on boot
    if err != nil {
        return fmt.Errorf("open database: %w", err)
    }
    defer db.Close()

    mux := http.NewServeMux()
    mux.Handle(ingestv1connect.NewIngestServiceHandler(
        server.New(db, cfg),
        connect.WithInterceptors(server.RequestID(), server.Logging(logger)),
    ))
    mux.HandleFunc("GET /healthz", server.Healthz(db))

    srv := &http.Server{
        Addr:              cfg.Addr,
        Handler:           http.MaxBytesHandler(mux, cfg.MaxRequestBytes),
        ReadHeaderTimeout: 10 * time.Second,
    }
    // listen, serve in a goroutine, Shutdown with a deadline on ctx.Done()
    ...
}
```

The rules encoded above:

- **Interceptors are declared once**, at handler construction, and apply to
  every RPC. Per-route repetition of middleware is the most common
  structural mistake in organically grown Go services; the stack forbids
  it. Auth, logging, request IDs, and panic recovery are interceptors;
  opting out is the explicit, visible act.
- **slog is wired on day one**: JSON handler in production, text in dev, and
  a request-ID interceptor that puts a logger into the context. `slog` calls
  without a configured handler are worse than useless because they look like
  logging.
- **Graceful shutdown** is `signal.NotifyContext` plus `http.Server.Shutdown`
  with a deadline. The listener is created with `net.Listen` before serving
  so readiness is a fact, which tests can wait on.
- `/healthz` is liveness; a `/readyz` that pings the pool with a short
  timeout is added when a load balancer exists to care.

## Persistence

sqlc generates the data layer from SQL, which inverts Drizzle's direction
while preserving the property that matters: one authoritative artifact, a
generated data layer, and compile-time types. `sqlc.yaml`:

```yaml
version: "2"
sql:
  - engine: postgresql
    queries: db/queries
    schema: db/migrations        # migrations ARE the schema; nothing to drift
    gen:
      go:
        package: storedb
        out: internal/store/storedb
        sql_package: pgx/v5
        emit_interface: true
        emit_methods_with_db_argument: true
```

The two emit options are load-bearing, both proven in production:

- `emit_methods_with_db_argument` makes every generated method take a `DBTX`,
  so the same querier works against a pool or a transaction with no second
  type.
- `emit_interface` generates a `Querier` interface, which is the mocking and
  decoration seam.

Migrations are goose-format SQL in `db/migrations/`, embedded into the
binary with `//go:embed`, and applied on boot (`goose.UpContext`). Policy:
append-only, one logical change per file, schema statements only, `Down`
sections are best-effort dev conveniences. Migrate-on-boot is correct for a
single-instance deployment and closes the manual-migration gap the
TypeScript backend still has; revisit it the day two replicas race to
migrate.

Transactions go through one helper:

```go
// RunInTx retries on serialization failures (SQLSTATE 40001, 40P01) with
// backoff. fn must be idempotent and must use the tx it is handed.
func RunInTx(ctx context.Context, pool *pgxpool.Pool,
    fn func(ctx context.Context, tx pgx.Tx) error) error
```

The retry-on-serialization-failure behavior is the part most codebases skip
and later need. Match the SQLSTATEs via `pgconn.PgError` and `errors.As` so
the check still fires when the error arrives wrapped.

## handler → store → adapter, in Go

- **Handler** (`internal/server/note.go`): one method per RPC on the service
  struct, satisfying the connect-go generated interface, which gives the same
  exhaustiveness guarantee as `ServiceImpl<typeof AppService>` does in
  TypeScript. Handlers validate presence, read identity from the context the
  auth interceptor populated, call the store, and wrap the result in
  `connect.NewResponse`.
- **Store** (`internal/store/notes.go`): business logic, `RunInTx`, calls
  into the sqlc-generated `Querier`. Stores accept and return proto messages.
- **Adapter** (`internal/store/notes_adapter.go`): pure functions between
  sqlc row structs and proto messages, including the empty-string/NULL
  normalization and enum bridges. Same rules as TypeScript: the only place
  both shapes are known, and no I/O.

## Errors

Connect error codes are part of the contract, so stores speak them directly,
mirroring the TypeScript stores that throw `ConnectError`:

```go
return nil, connect.NewError(connect.CodeNotFound,
    fmt.Errorf("note %s: %w", id, err))
```

Wrap causes with `%w` so `errors.Is`/`errors.As` work through the chain. A
logging interceptor at the edge splits severity: internal-class codes log as
errors with the full chain, expected client failures log as warnings with
the code only. This gives breadcrumb-chain errors with the stdlib and
connect-go alone, no error package required.

## Config

A plain struct with env tags, parsed by a small library
(`caarlos0/env`), then validated as a whole:

```go
type Config struct {
    Addr        string `env:"ADDR" envDefault:":3001"`
    DatabaseURL string `env:"DATABASE_URL" envDefault:"embedded://.dev-db/ingest"`
    JWTSecret   string `env:"JWT_SECRET" redact:"true"`
}

func (c Config) Validate() error // accumulate with errors.Join
```

`Validate` runs at boot and checks cross-field invariants (secret length in
non-dev environments, size caps ordered correctly, all-or-none key groups).
Startup logs the config once, with `redact:"true"` fields masked. Every new
setting is a field, a validation case, and a line in `.env.example`.

## The dev database

`postgres.Open` switches on the `DATABASE_URL` scheme, mirroring the
TypeScript `DbHandle`:

| Scheme | Backing | Used for |
|---|---|---|
| `embedded://<path>` | embedded-postgres (real Postgres binaries, child process) | dev default |
| `embedded-memory://` | embedded-postgres, ephemeral data dir | tests |
| `postgresql://...` | pgxpool | production |

There is no true PGlite equivalent in Go;
[fergusstrange/embedded-postgres](https://github.com/fergusstrange/embedded-postgres)
is the nearest thing and preserves the property the stack refuses to give
up: clone, install, run, no Docker, no external services. Testcontainers is
the documented alternative for CI environments that already have Docker.

## Codegen and tooling

- Generators are pinned in go.mod's `tool` block and invoked as `go tool
  sqlc`, `go tool goose`, so there is no `go install` version skew. The cost
  is a fat indirect section in go.mod; the benefit is hermetic builds.
- Generated code (`gen/`, `internal/store/storedb/`) is never committed. A
  `go generate`-style build step runs buf and sqlc; CI runs the identical
  command and fails on diff.
- Lint is golangci-lint with `default: all` and a curated disable list where
  every disable carries a one-line reason. `govulncheck` runs in CI.
- The binary doubles as its own healthcheck client (`<service> healthcheck`),
  so the container image needs no curl.

## Testing

- **Unit**: table tests with `t.Parallel()`; fakes are hand-written against
  the sqlc `Querier` interface or small function-struct seams.
- **Integration**: one `TestMain` per package boots one database (embedded or
  testcontainers) and an `httptest.Server`; tests talk to the server through
  the **generated connect-go client**, which serves as the typed API helper
  such suites otherwise hand-write. Isolation comes from
  per-test fixtures, so tests run in parallel against one database.
- The `run()` signature makes full end-to-end tests one function call.

## Build and deploy

Multi-stage Dockerfile: `golang:alpine` build with `CGO_ENABLED=0`, then a
minimal runtime stage running as a non-root user. Migrations and any static
assets are embedded, so the artifact is one binary. Copy `.git` into the
build stage so `debug.ReadBuildInfo` stamps the version, and set
`GOMEMLIMIT` from the container limit (or read the cgroup limit at boot).
The image joins the same compose file and Caddy proxy as every other
service.

## Patterns adopted, patterns left behind

Adopted from production Go systems we studied:

- stdlib `ServeMux` routing with Go 1.22+ patterns, zero router dependency
- sqlc with `emit_interface` + `emit_methods_with_db_argument`, schema read
  from the migrations directory
- `RunInTx` with retryable-error detection through wrapped errors
- goose migrations, embedded and applied on boot; append-only policy
- config as struct tree + boot-time `Validate()` + redacted startup dump
- `go tool` pinning; generated code uncommitted; the healthcheck subcommand;
  cgroup-aware memory limit; `.git`-stamped builds
- integration testing shape: one container per package, typed client,
  parallel tests via fixture ownership

Left behind, deliberately:

- float epoch timestamps and SCREAMING_CASE identifiers (Python-era fossils;
  the contract mandates `timestamptz` and lower_snake columns)
- per-route middleware chains repeated per endpoint (interceptors, declared
  once)
- audit logging as per-route opt-in (cross-cutting behavior defaults on)
- thousand-line handler files that force complexity linters off (the
  twenty-line handler rule exists for this)
- flat root packages importable by anyone (`internal/` from day one)
- hand-rolled env parsing across dozens of if-blocks (struct tags), and
  slog left running on the default text handler (JSON handler, wired at
  boot)
