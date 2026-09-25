---
title: "Backend: Go"
description: The connect-go + sqlc + goose blueprint, as two services walked it
order: 4
---

# Backend: Go

The Go backend is a peer of the TypeScript one: the same contract, the same
handler → store → adapter vocabulary, the same generated-edges philosophy,
implemented with the current Go idiom. It exists for workloads where a
single static binary, a small memory footprint, and Go's concurrency model
earn their keep. The criteria for choosing it live in
[Choosing a runtime](./choosing.md).

The first version of this document was a design grounded in study. Two
services have since walked it, and this version records what they found:

- **OCF IMS**, an incident-management system for a fair, brought onto the
  contract from a Go REST codebase: 60 unary RPCs on connect-go, sqlc over
  MariaDB, goose, slog, a full interceptor spine, and an Expo client. It runs
  as a staging instance that follows `master`, with production next.
- **The Maybloom app**, the stack's own reference implementation, restarted
  as a Go backend-for-frontend over Postgres: connect-go, sqlc + pgx, goose,
  an OIDC login, the web interface embedded in the binary. Built and
  verified from the `bootstrap-go` skill's layout; its first deploy is the
  step after this document.

Where the two agree, the pattern below is stated as settled. Where they
chose differently, both answers are given with the reason each was chosen.
Where neither went, the section says so.

## Runtime choices at a glance

| Concern | Choice | Walked by | TypeScript equivalent |
|---|---|---|---|
| RPC | connect-go on stdlib `net/http` | both | Connect plugin on Fastify |
| Data layer | sqlc-generated queries; pgx/v5 on Postgres, `database/sql` on MariaDB | both | Drizzle ORM |
| Schema truth | `db/migrations/*.sql` (goose format), read by sqlc | both | `src/db/schema.ts` |
| Migrations | goose, embedded, applied on boot | both | drizzle-kit, manual in prod |
| Validation | protovalidate constraints in the contract, enforced by an interceptor | OCF IMS | hand-written presence checks |
| Config | struct + env tags (`caarlos0/env`) + `Validate()` | Maybloom | TypeBox + `@fastify/env` |
| Logging | `log/slog`; JSON in production, text in development | both | Fastify pino logger |
| Codegen | buf and every plugin pinned as `go tool` binaries in go.mod, run from `go/` | both | pnpm catalog |
| Dev database | a real database in a container; embedded-postgres unwalked | both | PGlite |

connect-go serves the same wire protocol the interface already speaks, so a
Go service and a TypeScript service are indistinguishable to a generated
client. It is a library on plain `net/http` rather than a framework: routing
is the stdlib `ServeMux`, middleware is `func(http.Handler) http.Handler`,
and anything that works with `http.Server` works here. A Connect handler is
an `http.Handler` at a path prefix, so it coexists with whatever else the
mux serves: OCF IMS mounted it beside its REST routes for the length of the
migration, with no second server and no precedence clash.

## Module layout

One Go module per repo, at `go/`. The contract stays at the repo root,
because the TypeScript packages consume it too, which makes the module root
and the repo root different directories. That fact shapes the codegen
section below and the Dockerfile.

```
go/
  cmd/<service>/main.go   thin main: load config, call run(ctx, cfg) error
  internal/
    config/               the env struct and its Validate()
    server/               Connect handlers, interceptors, the mux
    store/                stores + adapters over the sqlc output (storedb/, generated)
    postgres/             pool setup, migrate on boot
    auth/                 whatever the login is: OIDC client, JWT, sessions
    web/                  the embedded web export, if the binary serves it
  db/
    db.go                 //go:embed migrations/*.sql, so the path is one level
    migrations/           goose SQL files: the schema source of truth
    queries/              sqlc query files
  gen/                    buf output (gitignored, regenerated on build)
  buf.gen.yaml            the Go targets, run as `go tool buf` from here
  sqlc.yaml
  Dockerfile              built with the repo root as context
```

Everything lives under `internal/` because nothing here is a library for
strangers; the contract is the public API. `main.go` stays short and
delegates to `run(ctx context.Context, cfg Config) error`, so the whole
server is testable as a function.

### Layer packages or domain packages

The layout above packages by layer: every handler in `server`, every store
in `store`. That is the right shape for a small service, and it is what
the Maybloom backend uses at four RPCs.

OCF IMS, at 60 RPCs across a dozen resources, packages by domain instead:
`internal/incident`, `internal/person`, `internal/event`, each holding its
own handlers, stores and adapters, each exposing a `Service` struct that
carries the domain's shared dependencies with the RPCs as methods on it.
The service struct registered with connect-go composes one `Service` per
domain, and each RPC method is a one-line delegate. Two things make that
shape work:

- **A leaf `internal/server` package** holds the cross-cutting code (the
  interceptors, context helpers, caches, push) and imports no domain. The
  mux wiring lives in a third package that imports everything. Without the
  leaf, the server and the domains import each other and Go refuses.
- **The call graph, not taste, sets the granularity.** OCF IMS's incident,
  report and journal-entry code was mutually recursive, so it became one
  `internal/incident` package rather than three. Splitting further would
  have meant moving logic, which a restructure must not do.

Start with layer packages. Move to domain packages when a layer package
stops fitting in one head, and move whole files when you do. The
handler → store → adapter seams survive either layout unchanged.

## Codegen

The Go targets live in their own `go/buf.gen.yaml`, with every plugin a
local `go tool` binary, and buf itself is one too:

```yaml
# go/buf.gen.yaml — run from go/: go tool buf generate ../proto --template buf.gen.yaml
version: v2
plugins:
  - local: ["go", "tool", "protoc-gen-go"]
    out: gen
    opt: paths=source_relative
  - local: ["go", "tool", "protoc-gen-connect-go"]
    out: gen
    opt: paths=source_relative
```

with the matching `tool` block in `go.mod`:

```
tool (
	connectrpc.com/connect/cmd/protoc-gen-connect-go
	github.com/bufbuild/buf/cmd/buf
	github.com/sqlc-dev/sqlc/cmd/sqlc
	google.golang.org/protobuf/cmd/protoc-gen-go
)
```

Three consequences, all of which both services hit:

- **buf runs from `go/`, pointed up at `../proto`.** `go tool` resolves a
  pinned binary only from inside the module, and there is no `go.mod` at
  the repo root. `out: gen` is relative to that working directory, so it
  lands at `go/gen` with no further path work. The TypeScript target is
  the one whose output path has to reach back up to `../packages/...`, and
  it lives in the root `buf.gen.yaml`, run by pnpm.
- **The Go build needs no JavaScript toolchain.** Everything the binary
  compiles against is produced by Go-tool plugins, so the `golang:alpine`
  build stage generates the contract and the data layer with nothing
  installed but Go, and no network call to a plugin registry. `remote:`
  plugins work too; they cost egress on every build, which a restricted CI
  notices first.
- **Generated code is never committed**, on this path as on every other.
  Say the Go cost out loud: a fresh clone does not compile until the
  generators run, editors show unresolved imports until then, and every CI
  job pays generator time. OCF IMS also found that hosted `golangci-lint`
  pre-commit hooks cannot target a module in a subdirectory, so its Go
  hooks became local `go run` hooks that `cd go` first. The rule is kept
  because the alternative, generated code drifting from its source, is
  worse; the cost is real and belongs in the README.

`gen/` and `internal/store/storedb/` are gitignored. Every proto file
carries a `go_package` option of the form
`github.com/<org>/<repo>/go/gen/<slug>/service/v1;servicev1`, and
`paths=source_relative` makes the output mirror the proto directory, so the
import for the generated handler package is
`<module>/gen/<slug>/service/v1/servicev1connect`.

### One command generates everything

Whatever the generators are, there is one entry point, and the README,
CI and the Dockerfile all run it. For buf and sqlc that is two
`//go:generate` lines in a `go/generate.go` and `go generate .` from the
module root; OCF IMS, with four generators and the repo-root/module-root
split to manage, drives them from a `bin/build/build.go` with a
`-generate-only` flag that the Dockerfile and CI both call. The Maybloom
backend runs the two commands by hand in three places, which is the
version of this rule that a new service should not copy.

### Lint and vulnerabilities

golangci-lint v2, pinned like the generators, with `default: all` and a
short disable list where every disable carries a one-line reason. Scope
`funlen` to the transport layer by an exclusion rule with a `path-except`
so a fat route table is a named `//nolint` rather than a limit tuned high
enough to pass it; domain code is exempt on purpose. `govulncheck` runs in
CI. OCF IMS carries the config; the Maybloom backend runs `gofmt` and
`vet` only, and adopting the config is on its list.

### OpenAPI, optionally

`protoc-gen-connect-openapi` as a third local plugin gives an OpenAPI
document for people who will never read a proto, and it costs one line
in `go/buf.gen.yaml`. OCF IMS generates it; the Maybloom repo answers the
same need with the scaffolded docs site that renders the descriptor set.
Choose one, and only when someone will read it.

Two small facts that cost an afternoon each: buf refuses to generate an
empty module, so the clean contract of a restarted app starts with a
`Health` RPC rather than nothing; and the `connect` dependency flips from
indirect to direct in `go.mod` at the first `service` block, which is the
self-documenting signal that the first service landed.

## The server

```go
func run(ctx context.Context, cfg config.Config) error {
    ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
    defer stop()

    log := newLogger(cfg) // JSON in production, text in development
    slog.SetDefault(log)
    log.Info("starting", "version", version.Version, "config", cfg.Summary())

    pool, err := postgres.Open(ctx, cfg.DatabaseURL) // migrates on boot
    if err != nil {
        return fmt.Errorf("open database: %w", err)
    }
    defer pool.Close()

    srv := &http.Server{
        Handler:           http.MaxBytesHandler(server.NewMux(deps), cfg.MaxRequestBytes),
        ReadHeaderTimeout: 10 * time.Second,
        ReadTimeout:       30 * time.Second,
        WriteTimeout:      60 * time.Second,
        IdleTimeout:       120 * time.Second,
    }
    ln, err := net.Listen("tcp", cfg.Addr) // readiness is a fact, not a guess
    ...
    // serve in a goroutine; on ctx.Done(), Shutdown with a 15 s deadline
}
```

The mux the Maybloom backend builds, which is the general shape:

```go
func NewMux(d Deps) http.Handler {
    mux := http.NewServeMux()
    interceptors := connect.WithInterceptors(
        Recover(d.Log),
        Logging(d.Log),
        auth.Interceptor(d.Authenticator, servicev1connect.MaybloomServiceHealthProcedure),
    )
    mux.Handle(servicev1connect.NewMaybloomServiceHandler(NewService(d.Store), interceptors))
    d.OIDC.Register(mux)                       // GET /auth/login, /auth/callback, POST /auth/logout
    mux.HandleFunc("GET /healthz", ...)        // liveness
    mux.HandleFunc("GET /readyz", ...)         // pings the pool
    mux.Handle("/", web.Handler())             // the built web app, SPA fallback
    return mux
}
```

### The interceptor spine

Cross-cutting behaviour is declared once, at handler construction, and
applies to every RPC. A new RPC arrives with logging, auth, recovery and
validation attached; opting out is the explicit, visible act. OCF IMS's
chain, outermost first, is the fullest one walked and its order carries the
design:

1. **Recovery**: a panic becomes `CodeInternal` with the stack logged,
   instead of a dropped connection. connect-go does not recover panics
   unless asked.
2. **Request id**: generated or taken from the header, put in the context
   and the response.
3. **Auth**: verifies the credential and puts the identity in the context.
4. **Logging**: one `slog` line per RPC, with the identity now available.
5. **Audit**: records every mutating RPC, with the identity; sits outside
   validation so a rejected request is still logged as an attempt.
6. **Validation**: `connectrpc.com/validate`, innermost, so a constraint
   violation is refused right before the handler.

Two of those need a word each.

**Auth interceptors come in two shapes**, and the choice is per service.
The Maybloom backend's *gates*: it rejects an unauthenticated call with
`CodeUnauthenticated` unless the procedure is on an open list passed at
construction (the health check). OCF IMS's *populates*: it verifies a
credential if one is present and puts the claims in the context, and each
handler asserts the identity it needs, because `Login`, `RefreshToken` and
`GetAuthStatus` all tolerate anonymous callers. Gate when most RPCs need a
user and the exceptions fit in a list; populate when the exceptions are
themselves a feature.

**The audit interceptor needs a read/write signal, and the contract is
where it lives.** `option idempotency_level = NO_SIDE_EFFECTS` on a read
RPC tells the interceptor to skip it, and the default fails safe: an
unmarked read is over-logged, a mutation is never missed. The same option
has a second meaning connect-go acts on: a `NO_SIDE_EFFECTS` RPC is also
accepted over HTTP GET, and therefore cacheable by an intermediary. A
credential-minting read marked that way to stay out of the audit log wants
`Cache-Control: no-store` on its response. Annotate knowing both.

`slog` is wired on day one. Calls to `slog` without a configured handler
are worse than useless because they look like logging.

## Validation

The first version of this blueprint said handlers validate presence. That
rule predates protovalidate, and OCF IMS replaced it: constraints are
written in the proto as `buf.validate` options and enforced by the
interceptor, with no hand-written checks. Two rules from doing it:

- **A message-typed request field the handler dereferences is
  `required`.** Getters are nil-safe, but `req.Msg.Note.Title` on a nil
  `Note` panics, and the recovery interceptor turns that into a 500 any
  client can trigger by omitting the wrapper. With the interceptor as the
  only nil guard, the constraint is correctness, not documentation.
- **Constraints distribute by message role.** When create and update carry
  the whole resource, resource-level constraints must also hold for a
  mostly-unset create input, so only always-valid invariants (lengths,
  enum membership) belong on the resource; presence belongs on the request
  envelopes.

The validate interceptor runs before the handler, so it enforces the
contract even on an RPC that is not wired yet. The Maybloom backend has not
adopted protovalidate at four RPCs; it is the recommended default from the
first RPC that takes real input.

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
binary, and applied on boot. The embed lives in a tiny `db` package beside
the directory, because `//go:embed` paths are package-relative and cannot
reach up the tree:

```go
// go/db/db.go
package db

import "embed"

//go:embed migrations/*.sql
var Migrations embed.FS
```

```go
// go/internal/postgres/postgres.go
migrations, _ := fs.Sub(db.Migrations, "migrations")
provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations)
_, err = provider.Up(ctx)
```

Policy: append-only, one logical change per file, schema statements only,
`Down` sections are best-effort dev conveniences. Migrate-on-boot is
correct for a single-instance deployment and closes the manual-migration
gap the TypeScript backend still has; revisit it the day two replicas race
to migrate.

**Seeding is not migrating.** Reference data every environment needs
(a taxonomy) goes in the baseline migration. Environment data does not:
OCF IMS loads a demo seed into an empty database when `IMS_SEED=demo`; the
Maybloom backend upserts its node, zones and activity types from files in
`SEED_DIR` on every boot, archiving what left the files, until an in-app
editor exists. Both are a store function called from `run()` after the
migration, switched by config, off in production.

Transactions go through one helper:

```go
// RunInTx retries on serialization failures with backoff. fn must be
// idempotent and must use the tx it is handed.
func (s *Store) RunInTx(ctx context.Context,
    fn func(ctx context.Context, tx pgx.Tx) error) error
```

The retry-on-serialization-failure behavior is the part most codebases skip
and later need. Match the driver's error type via `errors.As` so the check
still fires when the error arrives wrapped.

### The MariaDB variant

OCF IMS proves the path on MariaDB, and the differences are contained:
`engine: mysql` and `database/sql` instead of pgx, `sql.Null*` instead of
`pgtype` in the adapters, `RunInTx` retrying error codes 1213 and 1205
instead of SQLSTATE 40001 and 40P01, and testcontainers for the test
database. Two things are different in kind:

- **DDL is not transactional**, so a migration that fails partway cannot
  roll back. One logical change per migration file stops being a style
  rule.
- **`UPDATE` reports changed rows, not matched rows**, unless the DSN
  says otherwise, so "rows affected == 0 means not found" is wrong when
  the update is a no-op. Pre-read the row and answer `NotFound` from that.

Everything above the store is identical: the contract, the interceptors,
the handler shape, the error model.

## handler → store → adapter, in Go

- **Handler** (`internal/server/service.go`, or the domain package): one
  method per RPC on the service struct, satisfying the connect-go generated
  interface. That is the same exhaustiveness guarantee as
  `ServiceImpl<typeof AppService>` in TypeScript: a declared RPC without a
  method is a build failure. Handlers read identity from the context the
  auth interceptor populated, call the store, and wrap the result in
  `connect.NewResponse`. With protovalidate in the chain there is nothing
  left for them to check.
- **Store** (`internal/store/notes.go`): business logic, `RunInTx`, calls
  into the sqlc-generated `Querier`. Stores accept and return proto
  messages.
- **Adapter** (`internal/store/adapters.go`): pure functions between sqlc
  row structs and proto messages, including the empty-string/NULL
  normalization and enum bridges. The only place both shapes are known,
  and no I/O.

Never embed the generated `Unimplemented<Service>Handler` in the real
server: partial implementation would compile, and losing that build
failure loses the guarantee that justifies the approach. The one exception
is a brownfield migration filling a large interface over weeks, where the
embedding is a scaffold and the exit gate is a grep that fails the build
until it is gone. [Adopting the stack](./adopting.md) covers that.

## Errors

Connect error codes are part of the contract, so stores speak them
directly, mirroring the TypeScript stores that throw `ConnectError`:

```go
if errors.Is(err, pgx.ErrNoRows) {
    return nil, connect.NewError(connect.CodeNotFound, errors.New("note not found"))
}
```

**connect-go puts `err.Error()` on the wire.** That single fact governs
the error model, and the first version of this document got it wrong.
`connect.NewError(connect.CodeInternal, fmt.Errorf("get note: %w", err))`
sends the driver's error text, table and constraint names included, to
the browser, and nothing logs the cause. A plain non-Connect error returned
from a handler is sent as `CodeUnknown` with its full message, which is the
same leak. OCF IMS's answer, after an independent review found the idiom at
107 sites, is one small wrapper:

```go
// Error() is the public message; Unwrap() is the cause. connect-go sends
// the first and the logging interceptor logs the second.
type publicError struct {
    public string
    cause  error
}

func (e *publicError) Error() string { return e.public }
func (e *publicError) Unwrap() error { return e.cause }

func InternalError(public string, cause error) *connect.Error {
    return connect.NewError(connect.CodeInternal, &publicError{public, cause})
}
```

The logging interceptor then splits severity: internal-class codes log as
errors with the cause chain, expected client failures log as warnings with
the code only. Wrap causes with `%w` inside the store so `errors.Is` and
`errors.As` work through the chain; hide them at the edge.

Codes that a port from REST gets wrong on the first pass, corrected on the
second reading: an unknown id is `NotFound`, never a 500; a duplicate is
`AlreadyExists`; a well-formed request the system's state forbids (removing
the last admin) is `FailedPrecondition`; both were `409` before. And an
empty request message on a list RPC is a contract smell: give reads a
`limit` and a time window before a client exists, with the cap enforced by
protovalidate rather than clamped in code.

## Config

A plain struct with env tags, parsed by `caarlos0/env`, then validated as
a whole. The Maybloom backend's, trimmed:

```go
type Config struct {
    Addr        string        `env:"ADDR" envDefault:":8080"`
    Environment string        `env:"ENVIRONMENT" envDefault:"development"`
    PublicURL   string        `env:"PUBLIC_URL" envDefault:"http://localhost:8080"`
    DatabaseURL string        `env:"DATABASE_URL,required"`
    SessionTTL  time.Duration `env:"SESSION_TTL" envDefault:"720h"`
    DevUser     string        `env:"DEV_USER"`
    // ...
}

func Load() (Config, error) {
    cfg, err := env.ParseAs[Config]()
    if err != nil {
        return Config{}, fmt.Errorf("read environment: %w", err)
    }
    return cfg, cfg.Validate()
}

func (c Config) Validate() error // accumulate with errors.Join
```

`Validate` runs at boot and checks cross-field invariants: all-or-none
groups (the three `OIDC_*` settings go together), secret shape (32 bytes as
hex), and the production refusals (no `DEV_USER`, `PUBLIC_URL` must be
https). Startup logs the config once through a `Summary()` that masks the
secrets. Every new setting is a field, a validation case, and a line in
`.env.example`.

## The dev database and tests

The first version of this document promised embedded-postgres as the Go
answer to PGlite. Neither service used it. What they did:

- **The Maybloom backend** runs store tests against `TEST_DATABASE_URL`, a
  throwaway Postgres container on a Docker network, and the tests skip
  when the variable is unset. Development runs the same way, with a
  `DEV_USER` setting that makes every request that user so the identity
  provider is not needed on a laptop; production refuses the setting.
- **OCF IMS** boots MariaDB through testcontainers in one `TestMain` per
  integration package, and its migration test proves a fresh database
  migrates to head and that migrating twice is a no-op.

So the honest dev-loop claim is "clone, run one container, run", not
"clone, run". embedded-postgres remains an unwalked option for a project
that wants the container gone.

Tests that talk to the server go through the **generated connect-go
client** against an `httptest.Server`, which serves as the typed API
helper such suites otherwise hand-write. Unit tests use table tests with
`t.Parallel()` and fakes against the sqlc `Querier`. One trap from OCF
IMS: a request built by hand with `connect.NewRequest` carries an empty
`Spec()`, so an interceptor that branches on the method's idempotency
level cannot be unit-tested that way; drive it through the generated
handler, where connect-go fills the spec in, with the interceptor's sink
taken as an interface so a spy can be injected.

## Auth

Authentication is not core; the two services chose differently and both
shapes are sound.

**The backend as an OIDC client** (Maybloom, behind Authelia). `/auth/login`
stores state, nonce and a PKCE verifier in a short-lived HMAC-signed cookie
and redirects to the provider; `/auth/callback` exchanges the code, verifies
the ID token and nonce, reads the profile from userinfo, upserts the user
and opens a session: 32 random bytes in Postgres, sent as an `HttpOnly`,
`SameSite=Lax` cookie. Every RPC but the health check needs that cookie.
The browser never sees a token, there is no JavaScript token cache, and
because the binary serves the web app from the same origin there is no
CORS. A goroutine sweeps expired sessions hourly, which is single-process
honesty at work.

**Bearer access tokens with a refresh token** (OCF IMS, own passwords,
argon2id). Short-lived access JWTs in the `Authorization` header; the
refresh token lives in an `HttpOnly; Secure; SameSite=Strict` cookie on the
web and in the request body for the native client, which stores it in
SecureStore. `Login` returns one or the other by a request flag, and the
body wins strictly over the cookie on refresh, so a client is always in
exactly one session mode. `Logout` never fails: it tolerates an anonymous
caller, because "sign out after the token expired" must not be a client
special case.

Choose the first when an identity provider already exists and the client
is a browser on the backend's origin. Choose the second when the service
owns its credentials or a native client must carry the session.

## Non-RPC surfaces

A real service serves more than its contract, and the first version of
this document was silent on that. Everything below is a plain `http.Handler`
on the same mux, documented beside the contract rather than smuggled past
it:

- **Health**: `GET /healthz` is liveness and touches nothing; `GET /readyz`
  pings the pool with a short timeout.
- **Login redirects**: the three OIDC routes above. The provider needs
  browser redirects, which an RPC cannot be.
- **Blobs**: attachment and picture upload stay multipart `POST`, download
  stays `GET`, both authenticated the way the RPCs are. The exception is
  per operation, not per resource: deleting a picture carries no blob and
  is an RPC.
- **Server push**: OCF IMS still runs a server-sent-events stream for its
  legacy UI, and found the constraint that matters: the browser
  `EventSource` API cannot set an `Authorization` header, so the stream
  authenticates with the refresh cookie, and per-subscriber filtering does
  not fit a broadcast, so private content is redacted at publish time. The
  planned replacement is a Connect server-streaming RPC; no service has
  walked that yet.
- **The web export**, when the binary serves it (next section).

Two mechanics on that mux: Go 1.22 method patterns (`"POST /path"`) answer
a CORS preflight `OPTIONS` with 405 before any middleware runs, so a
service that enables CORS for a development client registers one
`OPTIONS` route for the prefix. And CORS itself is development-only:
production is same-origin and emits no `Access-Control-*` header at all,
which the test suite asserts.

## Build and deploy

Multi-stage Dockerfile, built with the **repo root as context**: the build
stage regenerates the contract, so it needs `proto/` and the buf configs as
well as `go/`. The Maybloom backend's:

```dockerfile
FROM golang:1.26-alpine AS build
WORKDIR /src/go
COPY go/go.mod go/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY buf.yaml /src/buf.yaml
COPY proto /src/proto
COPY go ./
RUN go tool buf generate ../proto --template buf.gen.yaml && go tool sqlc generate
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
      -ldflags "-s -w -X <module>/internal/version.Version=${VERSION}" \
      -o /out/<service> ./cmd/<service>

FROM alpine:3.22
RUN adduser -D -u 10001 <service>
COPY --from=build /out/<service> /usr/local/bin/<service>
USER <service>
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
ENTRYPOINT ["<service>"]
```

The version is stamped from the git short SHA at build time and reported
by the `Health` RPC, so the running image can always say which commit it
is. Also stamp it as the `org.opencontainers.image.revision` label; OCF
IMS's first staging image carried none and the digest was the only way to
know what was running. The healthcheck can be busybox `wget` on alpine or
the binary's own `healthcheck` subcommand; both are walked.

### Where the web interface is served

Both services serve the Expo web export from the API's origin, which is
the rule (the interface document says why). They differ on the container:

- **Embedded in the binary** (Maybloom). A Node stage in the same
  Dockerfile runs the export; the Go stage copies it into `internal/web/dist`
  and `//go:embed`s it; an `http.Handler` serves files, falls back to
  `index.html` for anything that is not a file so the router's routes
  deep-link, and sets `immutable` caching on the hashed bundles and
  `no-store` on the shell. One image, one container, one deploy.
- **A separate static container** (OCF IMS). CI builds a `caddy:2-alpine`
  image holding the export; the front proxy sends `/<slug>.service.v1.<Service>/*`
  and the plain-HTTP paths to the Go container and everything else to the
  static one. The Go image stays free of any JavaScript toolchain, and the
  web build gets its own deploy cadence.

Pick embedded when the whole product is one process and one deploy is a
feature; pick the split when the client and the server release on
different rhythms or the Go image must stay minimal.

### A host without Go

The stack's deploy target is a small box that builds everything in Docker,
and the Maybloom server has no Go installed. A twelve-line script runs the
toolchain in the same image the Dockerfile uses, with the module and build
caches in named volumes so the second run is fast:

```sh
docker run --rm -i --user "$(id -u):$(id -g)" \
  -e HOME=/tmp/gohome -e GOCACHE=/tmp/gocache -e GOFLAGS=-buildvcs=false \
  -v <repo>-gomodcache:/go/pkg -v <repo>-gocache:/tmp/gocache -v <repo>-gohome:/tmp/gohome \
  -v "${REPO_ROOT}:/src" -w /src/go golang:1.26-alpine go "$@"
```

`scripts/go build ./...`, `scripts/go test ./...`, `scripts/go tool sqlc
generate`. Running as the invoking user keeps `go.sum` and the generated
files owned by the person, not root.

### Staging that follows the branch

OCF IMS's testing instance is the production compose file with three
knobs: the image tag defaults to `latest` with `pull_policy: always`, a
demo seed loads on an empty database, and a cron job on the host pulls
every half hour and restarts only when the image changed. `latest` is
moved only by the CI job that runs after lint, the test suite and an image
smoke test, so the instance can only ever receive a tested build, and the
host needs no inbound access and GitHub holds no deploy key. Pin the tag
in `.env` to freeze it for a test session. Nothing real ever goes on it.

## Patterns adopted, patterns left behind

Adopted, and now confirmed by the two services:

- stdlib `ServeMux` routing with Go 1.22+ patterns, zero router dependency
- sqlc with `emit_interface` + `emit_methods_with_db_argument`, schema read
  from the migrations directory
- `RunInTx` with retryable-error detection through wrapped errors
- goose migrations, embedded and applied on boot; append-only policy
- config as a struct + boot-time `Validate()` + redacted startup dump
- `go tool` pinning for buf, the plugins, sqlc and goose; generated code
  uncommitted; `.git`-SHA-stamped builds; a non-root runtime image
- the interceptor spine declared once, with protovalidate and the audit log
  on by default and `NO_SIDE_EFFECTS` as the read marker
- integration testing through the generated client against one database
  per package

Left behind, deliberately:

- float epoch timestamps and SCREAMING_CASE identifiers (Python-era fossils;
  the contract mandates `timestamptz` and lower_snake columns)
- per-route middleware chains repeated per endpoint (interceptors, declared
  once)
- audit logging as per-route opt-in, which fails silent when forgotten
  (default-on, with the contract marking the reads)
- hand-written presence checks in handlers (protovalidate)
- `connect.NewError(CodeInternal, fmt.Errorf("...: %w", err))`, which puts
  the cause on the wire (the public/cause wrapper)
- thousand-line handler files that force complexity linters off (the
  twenty-line handler rule exists for this; OCF IMS enforces it with
  `funlen` scoped to the transport layer by an exclusion rule)
- flat root packages importable by anyone (`internal/` from day one)
- hand-rolled env parsing across dozens of if-blocks (struct tags), and
  slog left running on the default text handler (JSON handler, wired at
  boot)

## Bringing an existing Go service onto the contract

OCF IMS did not start from the scaffold; it was a Go REST server that
adopted the contract in slices over three weeks. That sequence, contract
first, restructure second, extract third, delete fourth, is its own
document: [Adopting the stack](./adopting.md).
