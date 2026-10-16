# Go module skeleton

The files a Go service has exactly once, whatever it serves. Since
plugin 0.6.0 they ship as templates:
`../../maybloom-stack-bootstrap/templates/backend-go/` is the module
(landing at `go/`) and `../../maybloom-stack-bootstrap/templates/root-go/`
holds the repo-root pieces (`go.work`, `scripts/go`,
`scripts/golangci-lint`, the Go `package.json` and `CLAUDE.md`). **The
templates are canonical; this file is the commentary**: what each file is
for, which choices carry weight, and where a service may deviate. Copy
the files (substituting `__GO_MODULE__`, `__APP_SLUG__`, `__APP_NAME__`
and dropping `.tmpl`) rather than retyping them from the excerpts here.
Per-layer patterns — migrations, queries, adapters, stores, handlers —
are in `../../maybloom-stack-shared/references/paths/backend-go/README.md`.

It is the shape the Maybloom app settled in production in 2026, with the
plugin's own prescriptions kept where the app lacks them (the request id,
the public-message error wrapper, `emit_empty_slices`).

Sections: Dependencies and tool pinning · go.mod and go.sum · Codegen
entry point · Config · Migrations and the pool · run() · Identity · Server
and interceptors · Health · sqlc.yaml · Lint · Dockerfile and the Docker
wrappers · Tests and the dev database · What to check as you go.

Placeholders: `__GO_MODULE__`, `__APP_SLUG__` (also the binary and the
`cmd/` directory), `__APP_NAME__`. The port is 8080.

## Dependencies and tool pinning

The service needs:

- `connectrpc.com/connect` — the RPC runtime
- `connectrpc.com/validate` — the protovalidate interceptor
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
nothing else. A repo with more generators (an OpenAPI client through
oapi-codegen, for one) adds a third line; two or three `//go:generate`
lines do not need a build program.

## Config

`internal/config/config.go`. Parse the environment once into a typed
struct and fail loudly at boot rather than at first use. Every setting is
a field with an `env` tag, a case in `Validate()` (which accumulates with
`errors.Join` so one boot reports every mistake), a line in `.env.example`
and the README's table, and an entry in `Summary()`, which the startup log
prints with secrets masked. The template's settings: `ADDR`,
`ENVIRONMENT` (production refuses the dev shortcuts), `PUBLIC_URL` (https
in production), `DATABASE_URL` (required), `DEV_USER`, `CORS_ORIGINS`,
`LOG_FORMAT`, `MAX_REQUEST_BYTES`. `config_test.go` is a table test over
`Validate`; extend it with every setting added.

## Migrations and the pool

Two packages. `db/db.go` embeds the migrations, because `//go:embed`
paths are package-relative and cannot reach up the tree.
`internal/postgres/postgres.go` opens the pool, pings, and migrates
before returning it (`Open`), so callers can assume the schema exists
rather than racing the first request; `Migrate(ctx, pool, version)`
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
`DevAuthenticator` from `DEV_USER`. The config refuses `DEV_USER` in
production, and `run()` refuses to start without an authenticator, so a
production deploy fails loudly until the project wires a real one: an
OIDC client behind the household's provider, or bearer tokens the service
mints (the stack's Go document, Auth, has both shapes). That first auth
decision lives in this package beside the seam.

The gating shape fits a service where most RPCs need a user and the
exceptions fit in a list. A service whose anonymous RPCs are a feature
(`Login`, `GetAuthStatus`) populates instead and lets each handler assert.

## Server and interceptors

`internal/server/mux.go`. Build the mux, register the generated handler,
and declare cross-cutting behaviour **once** as interceptors rather than
per route — that is what makes a new RPC arrive with recovery, a request
id, logging, auth and validation already attached. The order is the
design (decided 2026-10-15):

1. `Recover` — outermost: a panic becomes `CodeInternal`, logged with the
   request id, instead of a dropped connection.
2. `RequestID` — the caller's `X-Request-Id` or a fresh one, on the
   context for every log line below and on the response (or the error)
   for the caller.
3. `Logging` — one line per RPC, outside auth so a refused request is
   still logged. Internal-class codes log at Error with the cause chain;
   refusals at Warn with the code only.
4. `auth.Interceptor` — gates, `Health` open.
5. `validate.NewInterceptor()` — innermost: the contract's `buf.validate`
   rules, so a bad request never reaches a handler.

An audit interceptor, when a service wants one, goes between auth and
validate; it is opt-in, and there is no read marker in the contract to
drive it (`NO_SIDE_EFFECTS` left the conventions on 2026-10-15), so it
keeps its own list of the RPCs it records.

The `Service` struct (`service.go`) must satisfy the generated
`__APP_NAME__ServiceHandler` interface; one file per resource holds its
methods (`notes.go`). Do not embed the generated `Unimplemented...` type
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
pool or a transaction, which is what lets `RunInTx` exist;
`emit_interface` generates the `Querier` interface that is the seam tests
substitute; `emit_empty_slices` makes an empty `:many` answer `[]` rather
than `nil`, so adapters never special-case it. For MariaDB: `engine:
mysql`, `sql_package: database/sql`, and the adapters use `sql.Null*`.

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
`wget`, and the version as the `org.opencontainers.image.revision` label.
The verified image is about 10 MB.

If the binary also serves the web interface, add a `node:24-alpine` stage
that runs the Expo export and `COPY --from=web` its output into an
embedded `internal/web/dist` before `go build`; the stack's Go document
(Build) covers the handler.

`scripts/go` and `scripts/golangci-lint` run the toolchain and the linter
in their pinned images for a machine without Go (a deploy host that
builds everything in Docker, a laptop that would rather not), with the
module and build caches in named volumes created once and owned by the
invoking user. `GO_DOCKER_ARGS` adds `docker run` flags (a `--network` for
the test database, a `-p` to publish the port, `-e` for settings) and
`TEST_DATABASE_URL` passes through.

## Tests and the dev database

Store and server tests run against a real database and skip without one
(`TEST_DATABASE_URL` unset), so `go test ./...` stays green on a machine
with no database while the interceptor tests (`server_test.go`, through
the generated client against `httptest.NewServer(NewMux(deps))`) still
run: `Health` open, the gate refusing the anonymous, validate refusing an
empty title and a `page_size` over the cap, the request id on the
response. With the database, the store tests walk the Note loop and the
paging, and the server test walks it over the wire.

The compose database at the repo root is the usual dev database; a
throwaway `postgres:17-alpine` container on a Docker network is the shape
`scripts/go` reaches (`GO_DOCKER_ARGS="--network <net>"`). Development
runs the same database with `DEV_USER`. embedded-postgres, the in-process
option, has not been walked.

RPC tests go through the generated connect-go client; a hand-built
`connect.NewRequest` carries an empty `Spec()`, so an interceptor that
reads the procedure cannot be unit-tested that way.

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
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/__APP_SLUG__ go test ./...
pnpm dev:backend                 # at the repo root: migrations apply on boot; watch the log
docker build -f go/Dockerfile --build-arg VERSION=$(git rev-parse --short HEAD) .
```
