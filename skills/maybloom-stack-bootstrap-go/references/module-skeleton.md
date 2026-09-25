# Go module skeleton

The files a Go service has exactly once, whatever it serves. Per-layer
patterns — migrations, queries, adapters, stores, handlers — are in
`../../maybloom-stack-shared/references/paths/backend-go/README.md`; this
file is only the scaffolding around them. It is the shape two production
services converged on in 2026; where they differed, the reason is given.

Sections: Dependencies and tool pinning · go.mod · Codegen entry point ·
Config · Migrations and the pool · run() · Server and interceptors ·
Health endpoints · sqlc.yaml · Lint · Dockerfile · Tests and the dev
database · What to check as you go.

Placeholders: `<GO_MODULE>`, `<SERVICE>`, `<APP_SLUG>`,
`<SERVICE_PROTO_PKG>`, `<SERVICE_NAME>`, `<PORT>`.

## Dependencies and tool pinning

Resolve versions with `go get` rather than writing them from memory — a
scaffold that arrives with a stale or invented version is worse than one
that takes an extra command. The service needs:

- `connectrpc.com/connect` — the RPC runtime
- `connectrpc.com/validate` — the protovalidate interceptor
- `github.com/jackc/pgx/v5` — driver and pool (Postgres)
- `github.com/pressly/goose/v3` — migrations
- `github.com/caarlos0/env/v11` — the config struct
- `google.golang.org/protobuf` — generated message runtime
- `github.com/google/uuid` — ids, if the schema uses them

Pin the code generators and the linter as **tool dependencies** so every
machine, CI and the Docker build run the same versions with nothing
installed but Go:

```bash
cd go
go get -tool github.com/bufbuild/buf/cmd/buf
go get -tool google.golang.org/protobuf/cmd/protoc-gen-go
go get -tool connectrpc.com/connect/cmd/protoc-gen-connect-go
go get -tool github.com/sqlc-dev/sqlc/cmd/sqlc
go get -tool github.com/golangci/golangci-lint/v2/cmd/golangci-lint
```

They land in `go.mod` under a `tool` block and run as `go tool buf ...`,
`go tool sqlc ...`, `go tool golangci-lint ...`. The cost is a fat
indirect dependency list; the benefit is hermetic builds. goose's CLI is
not needed as a tool: migrations are applied by the binary, and a new
file is written by hand from the template in the path reference.

## go.mod

```
module <GO_MODULE>

go 1.26

tool (
	connectrpc.com/connect/cmd/protoc-gen-connect-go
	github.com/bufbuild/buf/cmd/buf
	github.com/golangci/golangci-lint/v2/cmd/golangci-lint
	github.com/sqlc-dev/sqlc/cmd/sqlc
	google.golang.org/protobuf/cmd/protoc-gen-go
)

require (
	// filled in by `go get`; run `go mod tidy` after writing the code
)
```

Set the `go` line to the version the user named. The module path ends in
`/go` because the module lives in the `go/` subdirectory of the repo and
the import path mirrors the directory. If the repo wants `go build` to
work from the root too, a `go.work` with `use ./go` beside `go.mod` does
that; one service uses it, one does not, and nothing depends on it.

## Codegen entry point

`go/buf.gen.yaml` holds the Go targets (the path reference shows it), and
`go/generate.go` is the one command everything runs:

```go
// Package main is not here; this file only carries the generate directives.
// Run from go/: go generate .
//
//go:generate go tool buf generate ../proto --template buf.gen.yaml
//go:generate go tool sqlc generate
package generate
```

(Any package name works; keep the file at the module root so `go
generate .` finds it.) The README, CI and the Dockerfile all run
`go generate .` and nothing else. A repo with more generators, or one
that needs the module root and the repo root told apart in code, grows a
`bin/build/build.go` instead; two `//go:generate` lines do not.

Optional third plugin, when someone who does not read protos needs to
browse the contract: `protoc-gen-connect-openapi` as another `go tool`
local, `out: gen/openapi`.

## Config

`internal/config/config.go`. Parse the environment once into a typed
struct and fail loudly at boot rather than at first use — a service that
starts and then 500s on its first request because a variable was missing
is harder to diagnose than one that refuses to start.

```go
package config

import (
	"errors"
	"fmt"
	"net/url"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	Addr        string `env:"ADDR" envDefault:":<PORT>"`
	Environment string `env:"ENVIRONMENT" envDefault:"development"` // or "production"
	PublicURL   string `env:"PUBLIC_URL" envDefault:"http://localhost:<PORT>"`
	DatabaseURL string `env:"DATABASE_URL,required"`
	LogFormat   string `env:"LOG_FORMAT"` // "json" | "text"; empty picks by environment
	MaxRequestBytes int64 `env:"MAX_REQUEST_BYTES" envDefault:"1048576"`
}

func Load() (Config, error) {
	cfg, err := env.ParseAs[Config]()
	if err != nil {
		return Config{}, fmt.Errorf("read environment: %w", err)
	}
	return cfg, cfg.Validate()
}

func (c Config) Production() bool { return c.Environment == "production" }

func (c Config) Validate() error {
	var errs []error
	if c.Environment != "production" && c.Environment != "development" {
		errs = append(errs, fmt.Errorf("ENVIRONMENT must be production or development, got %q", c.Environment))
	}
	if u, err := url.Parse(c.PublicURL); err != nil || u.Scheme == "" || u.Host == "" {
		errs = append(errs, fmt.Errorf("PUBLIC_URL must be an absolute URL, got %q", c.PublicURL))
	} else if c.Production() && u.Scheme != "https" {
		errs = append(errs, errors.New("PUBLIC_URL must be https in production"))
	}
	if c.MaxRequestBytes <= 0 {
		errs = append(errs, errors.New("MAX_REQUEST_BYTES must be positive"))
	}
	return errors.Join(errs...)
}

// Summary is what the startup log prints; mask every secret here.
func (c Config) Summary() map[string]any { ... }
```

Every setting is a field, a case in `Validate` (all-or-none groups,
secret shape, production refusals of dev shortcuts), and a line in
`.env.example`. Secrets are masked in `Summary()`.

## Migrations and the pool

Two packages. `go/db/db.go` embeds the migrations, because `//go:embed`
paths are package-relative and cannot reach up the tree:

```go
// Package db embeds the goose migrations so the binary applies them on
// boot. Policy: append-only, one logical change per file, schema only.
package db

import "embed"

//go:embed migrations/*.sql
var Migrations embed.FS
```

`internal/postgres/postgres.go` opens the pool and migrates before
returning it, so callers can assume the schema exists rather than racing
the first request:

```go
package postgres

import (
	"context"
	"fmt"
	"io/fs"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"<GO_MODULE>/db"
)

func Open(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	if err := migrate(ctx, pool); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()
	migrations, err := fs.Sub(db.Migrations, "migrations")
	if err != nil {
		return fmt.Errorf("migrations fs: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations)
	if err != nil {
		return fmt.Errorf("goose provider: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}
```

Migrate-on-boot is right for one instance; revisit it the day two
replicas race to migrate. Seed data is not a migration: it is a store
function called from `run()` after `Open`, switched by a config setting,
off in production.

## run()

`cmd/<SERVICE>/main.go`. The pattern that makes the service testable:
`main` does nothing but load config and call `run`, and `run` takes a
context and a config and returns an error. A test can then boot the whole
service in-process with one call.

```go
func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "<SERVICE>:", err)
		os.Exit(2)
	}
	if err := run(context.Background(), cfg); err != nil {
		slog.Error("<SERVICE> stopped", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, cfg config.Config) error {
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	log := newLogger(cfg) // JSON handler in production, text in development
	slog.SetDefault(log)
	log.Info("starting", "version", version.Version, "config", cfg.Summary())

	pool, err := postgres.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer pool.Close()

	srv := &http.Server{
		Handler:           http.MaxBytesHandler(server.NewMux(server.Deps{Store: store.New(pool), Log: log}), cfg.MaxRequestBytes),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	ln, err := net.Listen("tcp", cfg.Addr) // listen first: readiness is a fact tests can wait on
	if err != nil {
		return fmt.Errorf("listen on %s: %w", cfg.Addr, err)
	}
	log.Info("listening", "addr", ln.Addr().String())

	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()

	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve: %w", err)
		}
		return nil
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx) // drain in-flight requests
	}
}
```

`internal/version/version.go` holds `var Version = "dev"`, set by the
Dockerfile's `-ldflags -X` from the git SHA and reported by the health
RPC.

## Server and interceptors

`internal/server/mux.go`. Build the mux, register the generated handler,
and declare cross-cutting behavior **once** as interceptors rather than
per route — that is what makes a new RPC arrive with recovery, logging,
auth and validation already attached.

```go
type Deps struct {
	Store         *store.Store
	Authenticator auth.Authenticator
	Log           *slog.Logger
}

func NewMux(d Deps) http.Handler {
	mux := http.NewServeMux()
	interceptors := connect.WithInterceptors(
		Recover(d.Log),                 // outermost: a panic becomes CodeInternal, logged with the stack
		RequestID(),                    // into the context and the response header
		auth.Interceptor(d.Authenticator, <pkg>connect.<SERVICE_NAME>HealthProcedure), // open list by procedure name
		Logging(d.Log),                 // one line per RPC; internal-class codes at Error with the cause, refusals at Warn
		validate.NewInterceptor(),      // innermost: protovalidate, single return value
	)
	mux.Handle(<pkg>connect.New<SERVICE_NAME>Handler(NewService(d.Store), interceptors))
	mux.HandleFunc("GET /healthz", healthz)
	mux.HandleFunc("GET /readyz", readyz(d.Store))
	return mux
}
```

The order is the design: recovery outside everything, auth before the
things that read the caller, validation last so a bad request never
reaches the handler. A service that audits mutations adds an audit
interceptor between logging and validation, skipping RPCs marked
`NO_SIDE_EFFECTS`.

The `Service` struct returned by `NewService` is what must satisfy the
generated `<SERVICE_NAME>Handler` interface. Do not embed the generated
`Unimplemented...` type in the real server: partial implementation would
compile, and losing that build failure loses the exhaustiveness guarantee
that justifies the whole approach. Embed it in tests only.

The auth interceptor above *gates*: no identity and not on the open list
means `CodeUnauthenticated`. The alternative that *populates* (verifies
if present, lets each handler assert) fits a service whose anonymous
RPCs are a feature (`Login`, `GetAuthStatus`); choose per service.

## Health endpoints

`/healthz` is liveness — it answers if the process is up, and touches
nothing else. `/readyz` pings the pool with a short timeout, so readiness
is a fact the deploy can wait on rather than a guess. Add a `Health` RPC
too: buf refuses an empty service, the interface can show the version,
and it is the one procedure on the auth interceptor's open list.

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
which is the seam tests substitute. For MariaDB: `engine: mysql`,
`sql_package: database/sql`, and the adapters use `sql.Null*`.

## Lint

`go/.golangci.yml`, golangci-lint v2, pinned as a tool:

```yaml
version: "2"
linters:
  default: all
  disable:
    # one line of reason per disable, e.g.
    - cyclop      # complexity budgets are not enforced on domain code
    - gocognit
    - gocyclo
  exclusions:
    rules:
      # funlen guards the transport layer only: a fat handler is a leak.
      - path-except: '(^|/)internal/server/[^/]+\.go$'
        linters: [funlen]
      - path: '_test\.go$'
        linters: [funlen]
```

`go tool golangci-lint run` from `go/` in CI, beside `go vet` and
`govulncheck`.

## Dockerfile

`go/Dockerfile`, multi-stage, **built with the repo root as context**
(`docker build -f go/Dockerfile .`): the build stage regenerates the
contract, so it needs `proto/` and the buf configs as well as `go/`.

```dockerfile
FROM golang:1.26-alpine AS build
WORKDIR /src/go
COPY go/go.mod go/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY buf.yaml /src/buf.yaml
COPY proto /src/proto
COPY go ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go generate .
ARG VERSION=dev
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath \
      -ldflags "-s -w -X <GO_MODULE>/internal/version.Version=${VERSION}" \
      -o /out/<SERVICE> ./cmd/<SERVICE>

FROM alpine:3.22
RUN adduser -D -u 10001 <SERVICE>
COPY --from=build /out/<SERVICE> /usr/local/bin/<SERVICE>
USER <SERVICE>
ENV ADDR=:<PORT>
EXPOSE <PORT>
LABEL org.opencontainers.image.revision="${VERSION}"
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:<PORT>/healthz >/dev/null || exit 1
ENTRYPOINT ["<SERVICE>"]
```

If the binary also serves the web interface, add a `node:24-alpine` stage
before `build` that runs the Expo export and `COPY --from=web` its output
into `internal/web/dist` before `go build`; the path reference's Build
section and the stack's Go document cover the handler. The healthcheck
can equally be the binary's own `healthcheck` subcommand; busybox `wget`
is what alpine has.

If the deploy host has no Go, a `scripts/go` wrapper that runs the
toolchain in the same `golang:1.26-alpine` image with the module and
build caches in named volumes makes `scripts/go test ./...` work there;
the stack's Go document has the script.

## Tests and the dev database

Store tests run against a real database and skip without one:

```go
func testStore(t *testing.T) *Store {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := postgres.Open(ctx, url) // migrates
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(pool.Close)
	return New(pool)
}
```

A throwaway `postgres:17-alpine` container is the validated Postgres
shape; testcontainers, which starts and stops the container from
`TestMain`, is the validated MariaDB shape. Either is fine, and the skip
keeps `go test ./...` green on a machine with neither. Development runs
the same container with a `DEV_USER`-style setting that bypasses the
identity provider and is refused in production. embedded-postgres, the
in-process option, has not been walked.

RPC tests go through the generated connect-go client against
`httptest.NewServer(NewMux(deps))`; an interceptor that branches on the
method's idempotency level must be tested that way, because a hand-built
`connect.NewRequest` carries an empty `Spec()`.

## What to check as you go

Build after each file rather than at the end. `go build ./...` is fast,
and an import path typo found now is one line to fix; found after six
files it looks like a layout problem.

The first full loop that proves the scaffold works, from `go/`:

```bash
go generate .            # buf (Go files appear under gen/) then sqlc (validates queries against db/migrations)
go build ./... && go vet ./... && go tool golangci-lint run
docker run -d --rm --name <SERVICE>-pg -p 127.0.0.1:5432:5432 -e POSTGRES_PASSWORD=x -e POSTGRES_DB=<SERVICE> postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:x@127.0.0.1:5432/<SERVICE> go test ./...
DATABASE_URL=postgres://postgres:x@127.0.0.1:5432/<SERVICE> go run ./cmd/<SERVICE>   # migrations apply on boot; watch the log
```
