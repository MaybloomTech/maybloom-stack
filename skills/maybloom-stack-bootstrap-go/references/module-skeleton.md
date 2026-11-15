# Go module skeleton

The files a Go service has exactly once, whatever it serves. Since
plugin 0.6.0 they ship as templates:
`../../maybloom-stack-bootstrap/templates/backend-go/` is the module
(landing at `go/`) and `../../maybloom-stack-bootstrap/templates/root-go/`
holds the repo-root pieces (`go.work`, `scripts/go`,
`scripts/golangci-lint`, the Go `package.json`, `AGENTS.md` and
`.claude/settings.json`). **The
templates are canonical; this file is the commentary**: what each file is
for, which choices carry weight, and where a service may deviate. Copy
the files (substituting `__GO_MODULE__`, `__APP_SLUG__`, `__APP_NAME__`,
`__ORG_SCOPE__` and dropping `.tmpl`) rather than retyping them from the excerpts here.
Per-layer patterns — migrations, queries, adapters, stores, handlers —
are in `../../maybloom-stack-shared/references/paths/backend-go/README.md`.

It is the shape the reference implementation runs in production, with
the plugin's own prescriptions kept where that app lacks them (the
request id, the public-message error wrapper in `internal/rpcerr`,
`emit_empty_slices`).

Sections: Dependencies and tool pinning · go.mod and go.sum · Codegen
entry point · Config · Migrations and the pool · run() · Identity · Server
and interceptors · Health · sqlc.yaml · Transactions · Lint · Dockerfile
and the Docker wrappers · Tests and the dev database · What to check as
you go.

Placeholders: `__GO_MODULE__`, `__APP_SLUG__` (also the binary and the
`cmd/` directory), `__APP_NAME__`. The port is 8080.

## Dependencies and tool pinning

The service needs:

- `connectrpc.com/connect/v2` — the RPC runtime (connect-go v2: the module
  path carries the `/v2`, and so does the generator's,
  `connectrpc.com/connect/v2/cmd/protoc-gen-connect-go`)
- `connectrpc.com/validate` — the protovalidate interceptor (v0.9.0; its
  `NewServerInterceptor` is the v2 one, `NewInterceptor` the v1 one)
- `buf.build/gen/go/bufbuild/protovalidate/protocolbuffers/go` — the Go
  types for the `buf.validate` options the generated messages import
- `github.com/jackc/pgx/v5` — driver and pool (Postgres)
- `github.com/pressly/goose/v3` — migrations
- `github.com/caarlos0/env/v11` — the config struct
- `google.golang.org/protobuf` — generated message runtime

The code generators are pinned as **tool dependencies** so every machine,
CI and the Docker build run the same versions with nothing installed but
Go: buf itself, `protoc-gen-go`, `protoc-gen-connect-go` and sqlc, run as
`go tool buf ...`, `go tool sqlc ...`. The cost is a fat indirect
dependency list; the benefit is hermetic builds. The linter is **not** a
tool dependency: golangci advises against it (it would pull its whole
graph into `go.mod`), so it runs from its pinned image through
`scripts/golangci-lint`. goose's CLI is not needed either: migrations are
applied by the binary, and a new file is written by hand.

## go.mod and go.sum

`go.mod.tmpl` ships the `tool` block and the full `require` set at the
versions the app runs, and `go.sum` beside it, so `go generate .` works on
a fresh scaffold with no `go get`. They are a floor, like the pnpm
catalog: the post-scaffold checklist runs `go mod tidy`, and raising them
is `go get -u ./... && go mod tidy` after the first generate. Refreshing
the shipped pair is a per-release chore of the plugin.

The module path ends in `/go` because the module lives in the `go/`
subdirectory of the repo and the import path mirrors the directory.
`go.work` at the repo root (`use ./go`) lets `go` commands run from there
too; its `go` line must not be below `go.mod`'s.

## Codegen entry point

`buf.gen.yaml` holds the Go targets (two local `go tool` plugins,
`paths=source_relative`, `out: gen`) and `generate.go` is the one command
everything runs:

```go
//go:generate go tool buf generate ../proto --template buf.gen.yaml
//go:generate go tool sqlc generate
```

`go generate .` from `go/`. The README, CI and the Dockerfile run that and
nothing else. A repo with more generators adds lines; two or three
`//go:generate` lines do not need a build program. The usual third is an
OpenAPI client for a third-party service:

```go
//go:generate go tool oapi-codegen -config internal/<provider>/oapi.yaml internal/<provider>/<provider>-openapi-<release>.json
```

The provider's document is vendored unchanged in the adapter package, next to
`oapi.yaml` (`third_party/` stays the buf module root for protos),
`oapi-codegen` joins the `tool` block in `go.mod` and
`github.com/oapi-codegen/runtime` becomes a direct `require` (the generated
client imports it), the config lists only
the operation ids the app calls, and the output lands in a package inside
the adapter (`internal/<provider>/<provider>api/`) that you add to
`go/.gitignore`, which lists only `gen/` and `internal/store/storedb/`.
Calls the document does not describe are a hand-written client beside it. The
Docker-context ignore entry for the output is in the ship reference.

## Config

`internal/config/config.go`. Parse the environment once into a typed
struct and fail loudly at boot rather than at first use. Every setting is
a field with an `env` tag, a case in `Validate()` (which accumulates with
`errors.Join` so one boot reports every mistake), a line in `.env.example`
and the README's table, and an entry in `Summary()`, which the startup log
prints with secrets masked. The template's settings: `ADDR`,
`ENVIRONMENT` (production refuses the dev shortcuts), `PUBLIC_URL` (https
in production), `DATABASE_URL` (required), `DEV_USER`, `CORS_ORIGINS`,
`LOG_FORMAT`, `LOG_LEVEL` (info by default; debug shows every RPC),
`MAX_REQUEST_BYTES`. `config_test.go` is a table test over
`Validate`; extend it with every setting added.

The authenticator rule lives here too: `Validate` refuses to boot without
`DEV_USER` until a real `auth.Authenticator` is wired, and refuses
`DEV_USER` in production. It is a config rule, not a check in `run()`,
so a misconfigured deploy fails before the database is opened or
migrated.

## Migrations and the pool

Two packages. `db/db.go` embeds the migrations, because `//go:embed`
paths are package-relative and cannot reach up the tree.
`internal/postgres/postgres.go` opens the pool, pings, and migrates
before returning it (`Open`), logging one line (`migrations applied
applied=N version=M`), so callers can assume the schema exists rather
than racing the first request; `Migrate(ctx, pool, version)`
stops at a version for a test that puts data through a migration.

Migrate-on-boot is right for one instance; revisit it the day two
replicas race to migrate. Seed data is not a migration: it is a store
function called from `run()` after `Open`, switched by a config setting,
off in production.

## run()

`cmd/__APP_SLUG__/main.go`. `main` does nothing but load config and call
`run(ctx, cfg) error`, so a test can boot the whole service in-process
with one call. `run` sets up the logger (JSON in production, text in
development), opens the pool, builds the store and the authenticator,
wraps the mux in `http.MaxBytesHandler`, listens first (readiness is a
fact a test can wait on), serves, and drains on SIGINT/SIGTERM with a
15-second budget. `internal/version.Version` is `"dev"` until the
Dockerfile's `-ldflags -X` stamps the git SHA; the Health RPC reports it.

## Identity

`internal/auth/auth.go` is the seam SSO plugs into. `Authenticator`
resolves the caller from the request headers (`nil, nil` is anonymous);
`Identity` is what stores write into `created_by`; `Interceptor` gates
(anonymous and not on the open list is `CodeUnauthenticated`), with
`Health` the one open procedure; `IdentityFrom(ctx)` is how a handler
reads the caller. The scaffold ships one implementation,
`DevAuthenticator` from `DEV_USER`. `config.Validate` refuses `DEV_USER`
in production and refuses to start without one otherwise, so a production
deploy fails loudly, at config time, until the project wires a real one:
an OIDC client against the deployment's identity provider, or bearer
tokens the service mints (the stack's Go document, Auth, has both shapes).
That first auth decision lives in this package beside the seam, with its
config rule in `Validate`.

Under connect-go v2 `Authenticate(ctx, header *connect.Header)` takes the
headers as a `*connect.Header` (the same `Get` and `Values` as `http.Header`,
with no HTTP behind it). Two helpers in the package bridge to HTTP:
`auth.Cookie(header, name)` reads a session cookie off that header, and
`auth.FromHTTP(r.Header)` converts an `http.Header`, so a plain
`http.Handler` (a blob route, a login callback) calls the same
`Authenticator` as the RPCs: `a.Authenticate(r.Context(),
auth.FromHTTP(r.Header))`.

The gating shape fits a service where most RPCs need a user and the
exceptions fit in a list. A service whose anonymous RPCs are a feature
(`Login`, `GetAuthStatus`) populates instead and lets each handler assert.

## Server and interceptors

`internal/server/mux.go`. `NewServer` builds the `connect.Server` (the
interceptor chain, then the generated `Register...Handler`); `NewMux` mounts
it on the mux with `connecthttp.Mount`. Cross-cutting behaviour is declared
**once**, as the server's interceptors, rather than per route — that is what
makes a new RPC arrive with recovery, a request id, logging, auth and
validation already attached. The split is also what the tests use: they
give the generated client `connectinprocess.New(NewServer(deps))`, so a
test runs the real chain with no listener. The order is the design:

1. `RequestID` — outermost: the caller's `X-Request-ID` when it matches
   `[A-Za-z0-9_-]{1,64}`, a fresh one otherwise, on the context for every
   log line below and on the response headers for the caller, set before
   the rest of the chain runs so that a refusal carries it too.
2. `Recover` — a panic becomes `CodeInternal` instead of a dropped
   connection, logged with the request id; the id is on the response
   headers because `RequestID` is outside it.
3. `Logging` — one line per RPC, outside auth so a refused request is
   still logged. Internal-class codes log at Error with the cause chain;
   refusals at Warn with the code only.
4. `auth.Interceptor` — gates, `Health` open.
5. `validate.NewServerInterceptor()` — innermost: the contract's
   `buf.validate` rules, so a bad request never reaches a handler.

An audit interceptor, when a service wants one, goes between auth and
validate; it is opt-in, and there is no marker in the contract to drive
it, so it keeps its own list of the RPCs it records.

The order was re-checked for connect-go v2's whole-call interceptors and
holds. An interceptor is `func(next connect.ServerFunc) connect.ServerFunc`
and runs before the request body is decompressed or unmarshalled (the
generated handler does that, with `stream.Receive`, inside `next`), so auth
refuses an anonymous caller before any of the body is read, and a body that
does not decode fails inside the chain, where the request id and the
logging interceptors see it (under v1 it failed before them and left no log
line). Validation, innermost, wraps the stream and checks each message as
the handler receives it.

Two rules the interceptors impose on the rest of the module:

- **An interceptor is one function over the whole call**, so it covers unary
  and streaming RPCs alike; there is no `WrapUnary` and
  `WrapStreamingHandler` pair, and no unary-only variant for a stream to
  slip past. An interceptor reads the request headers from
  `connect.CallInfoForServerContext(ctx)` and the procedure from
  `spec.Procedure`, sets response headers on the same `CallInfo`, and
  wraps the `connect.ServerStream` it passes to `next` only when it needs the
  messages. An audit interceptor follows the same shape.
- **Only a `*connect.Error` you create sends its message.**
  `connect.NewError(code, "message")` takes a string, which is public;
  anything else a handler returns goes to the client as a bare `CodeUnknown`
  with no message, and its text stays in the log. A cause behind a public
  message rides on `WithCause` (`rpcerr.Internal`). There is no `Meta()`
  on an error any more: the request id goes on the response headers, so a
  package-level error is no longer a shared header map (the store's
  `noteNotFound()` and the others stay functions all the same).

The `Service` struct (`service.go`) must satisfy the generated
`__APP_NAME__ServiceHandler` interface, whose methods take the request
message and return the response message, plain; one file per resource holds
its methods (`notes.go`). Do not embed the generated `Unimplemented...` type
in the real server: a partial implementation would compile, and losing
that build failure loses the exhaustiveness guarantee that justifies the
whole approach. Embed it in tests only.

`cors()` wraps the mux for the origins in `CORS_ORIGINS` (the Expo dev
server in development) and answers preflights itself, because Go's method
patterns answer an `OPTIONS` with 405 before any handler runs. Production
serves the web export from the API's origin and lists no origins.

## Health

`/healthz` is liveness — it answers if the process is up, and touches
nothing else. `/readyz` pings the pool, so readiness is a fact the deploy
can wait on. The `Health` RPC is the third: buf refuses an empty service,
the interface can show the version, and it is the one procedure on the
auth interceptor's open list.

## sqlc.yaml

`engine: postgresql`, schema read from `db/migrations`, queries from
`db/queries`, output `internal/store/storedb` with `sql_package: pgx/v5`.
Three options carry weight: `emit_methods_with_db_argument` makes every
generated method take a `DBTX`, so the same `Querier` works against the
pool or a transaction, which is what lets a transaction helper exist;
`emit_interface` generates the `Querier` interface that is the seam tests
substitute; `emit_empty_slices` makes an empty `:many` answer `[]` rather
than `nil`, so adapters never special-case it. For MariaDB: `engine:
mysql`, `sql_package: database/sql`, and the adapters use `sql.Null*`.

## Transactions

The scaffold ships no transaction helper: the Note store has no
multi-table mutation, and a helper nothing calls is a helper nothing
tests. The first mutation that touches two tables adds this to `store.go`
and passes the `tx` to every query inside `fn` (every generated method
takes a `DBTX`, so the same `Querier` runs against the pool or the
transaction):

```go
// RunInTx runs fn in a transaction and retries serialization failures
// (SQLSTATE 40001, 40P01) a few times. fn must be idempotent and must use
// the tx it is handed.
func (s *Store) RunInTx(ctx context.Context, fn func(ctx context.Context, tx pgx.Tx) error) error {
	const attempts = 3
	var err error
	for range attempts {
		err = s.runOnce(ctx, fn)
		if err == nil || !retryable(err) {
			return err
		}
	}
	return fmt.Errorf("transaction gave up after %d attempts: %w", attempts, err)
}

func (s *Store) runOnce(ctx context.Context, fn func(ctx context.Context, tx pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback after commit is a no-op
	if err := fn(ctx, tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

func retryable(err error) bool {
	if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok {
		return pgErr.Code == "40001" || pgErr.Code == "40P01"
	}
	return false
}
```

For MariaDB the retryable codes are 1213 and 1205. The patterns that run
inside it are in `../../maybloom-stack-shared/references/tx-patterns.md`.

## Lint

`.golangci.yml`, golangci-lint v2, `default: all` with a short disable
list where every line says why, `funlen` scoped to `internal/server` by a
`path-except` exclusion (handlers stay thin, domain code may be long when
it reads well), tests exempt from the repetition linters. It runs from the
pinned image through `scripts/golangci-lint run` (the version is pinned in
that script and nowhere else; CI reads it from there). `godoclint` is on:
a package's doc comment starts with `Package <name>`, and the licence
header the scaffold stamps is separated from it by a blank line for that
reason.

## Dockerfile and the Docker wrappers

`Dockerfile`, multi-stage, **built with the repo root as context**
(`docker build -f go/Dockerfile .`): the build stage regenerates the
contract, so it copies `proto/`, `third_party/` and `buf.yaml` as well as
`go/`, runs `go generate .`, and builds with `-ldflags -X ...Version` from
the `VERSION` build arg (the git short SHA). The runtime stage is
`alpine`, a non-root user, `/healthz` as the healthcheck through busybox
`wget`, and the commit as the `org.opencontainers.image.revision` label,
from a `REVISION` build arg that defaults to `VERSION` (CI passes the full
SHA, which its image tag check reads).
The verified image is about 10 MB.

If the binary also serves the web interface, add a `node:24-alpine` stage
that runs the Expo export and `COPY --from=web` its output into an
embedded `internal/web/dist` before `go build`; the stack's Go document
(Build) covers the handler.

The Go patch is pinned in four places that must agree: `go.mod`'s `go`
line, `go.work`'s at the repo root, the Dockerfile's `FROM
golang:<patch>-alpine` and `GO_IMAGE` in `scripts/go`; the image and the
wrapper set `GOTOOLCHAIN=local`, so a go line ahead of the image fails
loudly instead of downloading another toolchain. Raising Go is one change
to the four (CONTRIBUTING, Maintainers' chores).

`scripts/go` and `scripts/golangci-lint` run the toolchain and the linter
in their pinned images for a machine without Go (a deploy host that
builds everything in Docker, a laptop that would rather not), with the
module and build caches in named volumes created once and owned by the
invoking user. `GO_DOCKER_ARGS` adds `docker run` flags (a `--network` for
the database, a `-p` to publish the port) and the backend's settings pass
through when set. Run from a terminal the container gets a tty and an init
process, so Ctrl-C on `pnpm dev:backend` stops it; piped runs get neither.

## Tests and the dev database

Store and server tests run against a real database and skip without one
(`TEST_DATABASE_URL` unset), so `go test ./...` stays green on a machine
with no database while the interceptor tests (`server_test.go`, through
the generated client over `connectinprocess.New(NewServer(deps))`) still
run: `Health` open, the gate refusing the anonymous, validate refusing an
empty title and a `page_size` over the cap, the request id on the
response. With the database, the store tests walk the Note loop and the
paging, and the server test walks it through the client. Since the
contract has no streaming RPC yet, `TestStreamingRPCGetsTheChain`
registers a bidirectional method on a bare `connect.Server` and runs it
through the same interceptors.

The store and server packages share `TEST_DATABASE_URL` and each migrates
it on open, so with the database set they run one package at a time:
`go test -p 1 ./...` (`pnpm test:backend` at the repo root). CI does the
same with `-race`.

The compose database at the repo root is the usual dev database; a
throwaway `postgres:17-alpine` container (the compose image) on a Docker network is the shape
`scripts/go` reaches (`GO_DOCKER_ARGS="--network <net>"`). Development
runs the same database with `DEV_USER`. embedded-postgres, the in-process
option, has not been walked.

RPC tests go through the generated connect-go client over
`connectinprocess.New(NewServer(deps))`: the real interceptor chain and
handlers, no listener, no port (headers are read off the call's `CallInfo`,
`connect.NewClientContext`). The few assertions about HTTP itself, the
mount, the status code an anonymous caller gets, the response headers, use
an `httptest.Server` over `NewMux` and `connecthttp.NewTransport`. The
handler methods are never called by hand: that skips the chain.

## What to check as you go

Build after each file rather than at the end. `go build ./...` is fast,
and an import path typo found now is one line to fix; found after six
files it looks like a layout problem.

The first full loop that proves the module works, from `go/` (or through
`scripts/go` from the repo root):

```bash
go mod tidy && go generate .     # go.sum against the pins; buf (gen/) then sqlc (storedb/, validated against db/migrations)
go build ./... && go vet ./... && ../scripts/golangci-lint run
go test ./...                    # interceptor and config tests; store and wire tests skip
docker compose up -d db          # at the repo root
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/__APP_SLUG___test go test -p 1 ./...   # the compose test database; one package at a time
pnpm dev:backend                 # at the repo root, through scripts/go on the compose network; the log says `migrations applied applied=1 version=1`
docker build -f go/Dockerfile --build-arg VERSION=$(git rev-parse --short HEAD) .
```
