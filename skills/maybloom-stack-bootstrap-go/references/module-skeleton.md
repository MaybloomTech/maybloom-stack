# Go module skeleton

The files a Go service has exactly once, whatever it serves. Per-layer
patterns — migrations, queries, adapters, stores, handlers — are in
`../../maybloom-stack-shared/references/paths/backend-go/README.md`; this
file is only the scaffolding around them.

Sections: Dependencies and tool pinning · go.mod · Config · Postgres
(pool, migrations, dev database) · run() · Server and interceptors ·
Health endpoints · sqlc.yaml · Dockerfile · What to check as you go.

Placeholders: `<GO_MODULE>`, `<SERVICE>`, `<APP_SLUG>`,
`<SERVICE_PROTO_PKG>`, `<SERVICE_NAME>`, `<PORT>`.

## Dependencies and tool pinning

Resolve versions with `go get` rather than writing them from memory — a
scaffold that arrives with a stale or invented version is worse than one
that takes an extra command. The service needs:

- `connectrpc.com/connect` — the RPC runtime
- `github.com/jackc/pgx/v5` — driver and pool
- `github.com/pressly/goose/v3` — migrations
- `google.golang.org/protobuf` — generated message runtime
- `github.com/google/uuid` — ids
- for development: `github.com/fergusstrange/embedded-postgres`

Pin the code generators as **tool dependencies** so every machine and CI
runs the same versions without a separate install step:

```bash
cd go
go get -tool github.com/sqlc-dev/sqlc/cmd/sqlc
go get -tool github.com/pressly/goose/v3/cmd/goose
```

They land in `go.mod` under a `tool` block and run as `go tool sqlc ...`
and `go tool goose ...`. The cost is a fatter indirect dependency list;
the benefit is that a fresh clone can generate and migrate with nothing
installed but Go.

## go.mod

```
module <GO_MODULE>

go 1.25

tool (
	github.com/pressly/goose/v3/cmd/goose
	github.com/sqlc-dev/sqlc/cmd/sqlc
)

require (
	// filled in by `go get`; run `go mod tidy` after writing the code
)
```

Set the `go` line to the version the user named. The module path ends in
`/go` when the module lives in a `go/` subdirectory of the repo, because
the import path mirrors the directory.

## Config

`internal/config/config.go`. Parse the environment once, into a typed
struct, and fail loudly at boot rather than at first use — a service that
starts and then 500s on its first request because a variable was missing
is harder to diagnose than one that refuses to start.

```go
package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Port        int
	DatabaseURL string // empty in dev: an embedded Postgres is started instead
	Env         string // "dev" | "production"
}

func Load() (Config, error) {
	cfg := Config{
		Port:        <PORT>,
		DatabaseURL: os.Getenv("DATABASE_URL"),
		Env:         envOr("APP_ENV", "dev"),
	}
	if p := os.Getenv("PORT"); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil {
			return cfg, fmt.Errorf("PORT %q is not a number: %w", p, err)
		}
		cfg.Port = n
	}
	if cfg.Env == "production" && cfg.DatabaseURL == "" {
		return cfg, fmt.Errorf("DATABASE_URL is required in production")
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

## Postgres: pool, migrations, dev database

`internal/postgres/postgres.go`. Three jobs: start a database in
development, open a pool, apply migrations before serving.

```go
package postgres

import (
	"context"
	"embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed all:../../db/migrations/*.sql
var migrations embed.FS

// Open returns a pool with migrations already applied, so callers can
// assume the schema exists rather than racing the first request.
func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	if err := Migrate(ctx, pool); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("goose dialect: %w", err)
	}
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()
	if err := goose.UpContext(ctx, db, "db/migrations"); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}
```

The `go:embed` path must reach the migrations from this package's
directory; if the relative path fights you, move the embed into a small
package that sits beside `db/` rather than reshaping the tree.

For development, start an embedded Postgres when `DatabaseURL` is empty
and return its URL plus a stop function. This is the Go answer to PGlite:
clone, run, no container. Keep it behind the same `Env` check so it can
never start in production.

## run()

`internal/app/run.go`. The pattern that makes the service testable: `main`
does nothing but call `run`, and `run` takes a context and a config and
returns an error. A test can then boot the whole service in-process with
one call.

```go
func Run(ctx context.Context, cfg config.Config) error {
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	logger := newLogger(cfg.Env) // JSON in production, text in dev
	slog.SetDefault(logger)

	pool, err := postgres.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Port),
		Handler: server.New(pool, logger),
	}

	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	slog.Info("listening", "port", cfg.Port, "env", cfg.Env)

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
		// Drain in-flight requests instead of cutting them off.
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}
```

`cmd/<SERVICE>/main.go` is then a few lines: load config, call
`app.Run`, log the error and exit non-zero.

## Server and interceptors

`internal/server/server.go`. Build the mux, register the generated
handler, and declare cross-cutting behavior **once** as interceptors
rather than per route — that is what makes a new RPC arrive with logging,
auth, request ids, and panic recovery already attached.

```go
func New(pool *pgxpool.Pool, logger *slog.Logger) http.Handler {
	st := store.New(pool)
	svc := &Server{store: st}

	interceptors := connect.WithInterceptors(
		requestIDInterceptor(),
		loggingInterceptor(logger),
		recoveryInterceptor(logger),
		authInterceptor(st), // skips the login RPC by procedure name
	)

	mux := http.NewServeMux()
	mux.Handle(<pkg>connect.New<SERVICE_NAME>Handler(svc, interceptors))
	mux.HandleFunc("/healthz", healthz)
	mux.HandleFunc("/readyz", readyz(pool))
	return mux
}
```

The `Server` struct is what must satisfy the generated
`<SERVICE_NAME>Handler` interface. Do not embed the generated
`Unimplemented...` type in the real server: partial implementation would
compile, and losing that build failure loses the exhaustiveness guarantee
that justifies the whole approach. Embed it in tests only.

## Health endpoints

`/healthz` is liveness — it answers if the process is up, and touches
nothing else. `/readyz` pings the pool with a short timeout, so readiness
is a fact the deploy can wait on rather than a guess.

Give the binary a `healthcheck` subcommand that calls its own `/healthz`,
so the container image needs no curl to declare a `HEALTHCHECK`.

## sqlc.yaml

```yaml
version: "2"
sql:
  - engine: postgresql
    schema: db/migrations
    queries: db/queries
    gen:
      go:
        package: storedb
        out: internal/store/storedb
        sql_package: pgx/v5
        emit_interface: true
        emit_methods_with_db_argument: true
        emit_empty_slices: true
```

Two of those options carry weight. `emit_methods_with_db_argument` makes
every generated method take a `DBTX`, so the same `Querier` works against
the pool or a transaction — which is what lets `RunInTx` exist at all.
`emit_interface` generates the `Querier` interface that stores depend on,
which is the seam tests substitute.

## Dockerfile

Multi-stage, matching the shape the rest of the repo deploys with: a Go
build stage and a minimal runtime stage.

- Build with `CGO_ENABLED=0` so the runtime image needs no libc.
- Stamp the binary with the git SHA through `-ldflags "-X main.version=..."`.
- Copy only the binary into the final stage.
- Set `HEALTHCHECK` to the binary's own `healthcheck` subcommand.
- Set `GOMEMLIMIT` from the container's memory limit so the collector
  respects the cgroup rather than the host's memory.

## What to check as you go

Build after each file rather than at the end. `go build ./...` is fast,
and an import path typo found now is one line to fix; found after six
files it looks like a layout problem.

The first full loop that proves the scaffold works:

```bash
pnpm proto:gen           # from the repo root — Go files appear under go/gen
cd go
go tool sqlc generate    # validates queries against db/migrations
go build ./... && go vet ./...
go run ./cmd/<SERVICE>   # migrations apply on boot; watch the log
```
