---
name: maybloom-stack-bootstrap-go
description: Use whenever the user wants to add a Go service to an EXISTING maybloom stack monorepo (a repo with `proto/` and `buf.yaml`, from `maybloom-stack-bootstrap` or following its conventions) — standing up the `go/` module with connect-go, sqlc, pgx, and goose so a second backend can serve part of the same contract. Triggers on "add a Go service to this repo", "I want the ingest pipeline in Go", "bootstrap the Go backend", "this workload needs Go, set it up", or a user reaching for Go because a job is concurrency-heavy, long-running, or headed for constrained hardware. This is the scaffolder that runs once per Go service; use `maybloom-stack-add-resource` or `maybloom-stack-add-rpc` for everything after it exists, and `maybloom-stack-bootstrap` instead when there is no monorepo yet.
---

# maybloom-stack-bootstrap-go

Stand up a Go service inside a monorepo that already has a contract. The
protos, the buf toolchain, and the TypeScript side stay where they are;
this adds a peer backend that speaks the same wire.

Read
`../maybloom-stack-shared/references/paths/backend-go/README.md` first —
it is the path reference, and it defines every per-layer pattern this
skill scaffolds toward. This skill covers only what exists once per
service: the module, the server, the database wiring, and the deploy
shape. The file contents live in
[`references/module-skeleton.md`](./references/module-skeleton.md); read
it when you reach step 4.

## When this skill is the wrong tool

- **No monorepo yet** (no `proto/`, no `buf.yaml`) → `maybloom-stack-bootstrap`.
  It scaffolds the workspace and the contract first; come back after.
- **`go/` already exists** → this skill has already run. Adding a resource
  is `maybloom-stack-add-resource`; adding an operation is
  `maybloom-stack-add-rpc`.
- **The user wants to move an existing TypeScript service to Go.** That is
  a migration, not a bootstrap: scaffold with this skill, then port RPC by
  RPC behind the unchanged contract, running both until the cutover.
- **The user has an existing Go service with no contract.** That is an
  adoption, not a bootstrap: the stack's `docs/adopting.md` sequence
  (contract first, restructure second, extract third, delete fourth)
  applies, and this skill's module skeleton is only the target shape.

## Before scaffolding: one backend or two?

Go is the stack's default backend, so a Go service needs no justification
on its own. What needs a sentence in the plan is the repo's shape after
this skill runs:

- **The repo has no backend yet** (a contract-only monorepo, or one whose
  `packages/backend` is being removed): this is the normal Go-first
  path. Scaffold, then delete the TypeScript backend package if the
  bootstrap left one, and say so in the PR.
- **The repo has a TypeScript backend that stays**: the repo now has two
  backends, and the reason it has two is the thing future readers will
  want. A second backend that exists "to compare" is a cost with no
  return — the contract already proves the two are interchangeable.
  Record the reason in the project's `CLAUDE.md`.

If the answer is thin, say so once and let the user decide. They may have
context you don't.

## Interview

Collect these before writing anything; each one appears in several files
and renaming later is tedious.

| Variable | Meaning | Example |
|---|---|---|
| `<GO_MODULE>` | Go module path | `github.com/acme/orchard/go` |
| `<SERVICE>` | binary + directory name | `ingest` |
| `<SERVICE_PROTO_PKG>` | the proto package this service owns | `ingest` (→ `proto/<APP_SLUG>/ingest/v1`) |
| `<SERVICE_NAME>` | the proto service block | `IngestService` |
| `<APP_SLUG>` | existing, read it from `proto/` | `orchard` |
| `<PORT>` | the port it listens on | `3002` |

Also ask which Go version to target, and confirm the database story: the
service can share the TypeScript backend's Postgres or own its own. Two
services writing the same tables is a coupling the contract cannot
protect, so prefer separate schemas or separate databases unless the user
has a reason.

## Each backend owns one service block

This is the rule that makes a second backend possible without splitting
the contract. `proto/<APP_SLUG>/resources/v1` and `common/v1` stay
shared — both backends and every client generate from them — while each
backend owns exactly one `service` block in its own package. The Go
service gets `proto/<APP_SLUG>/<SERVICE_PROTO_PKG>/v1/service.proto` with
`<SERVICE_NAME>` inside it.

That is what keeps the exhaustiveness check meaningful on both sides: the
generated handler interface is per service, so the Go build proves the Go
service implements everything it declared, and nothing it didn't.

The unit of backend choice is the service, never the RPC. If the user
wants "these three RPCs in Go", they are describing a service; name it.

## Sequence

### 1. Proto package for the new service

Create `proto/<APP_SLUG>/<SERVICE_PROTO_PKG>/v1/service.proto` declaring
`<SERVICE_NAME>`, importing whatever it needs from `resources/v1`. Give it
one real RPC to start — the smallest operation the user actually wants —
so the scaffold ends in a service that does something rather than an empty
interface. Request/response conventions are in
`../maybloom-stack-shared/references/proto-conventions.md`.

If the RPC needs a resource that doesn't exist yet, scaffold the service
with the simplest useful RPC now and hand off to
`maybloom-stack-add-resource` afterward. A bootstrap that ends in a
running server beats one that ends in a half-written resource.

### 2. Teach buf to emit Go

Write `go/buf.gen.yaml` with the two local `go tool` plugins, as shown in
the codegen section of
`../maybloom-stack-shared/references/paths/backend-go/README.md`, and pin
buf, `protoc-gen-go`, `protoc-gen-connect-go` and sqlc as `go tool`
dependencies (step 4 shows the `go.mod` block). Add a `go_package` option
to every proto file. Add `go/gen/` and `go/internal/store/storedb/` to
`go/.gitignore`: generated code is never committed on any path.

Run `go tool buf generate ../proto --template buf.gen.yaml` from `go/`
and confirm Go files appear before continuing — finding out the plugins
are misconfigured after writing the server wastes the whole step. Then
give the module one generate entry point (`go/generate.go` with two
`//go:generate` lines, so `go generate .` runs buf and sqlc) and use that
everywhere after: the README, CI and the Dockerfile all run the same
command.

### 3. Directory layout

Create the tree from the path reference's layout section: `cmd/<SERVICE>/`,
`internal/server/`, `internal/store/`, `internal/postgres/`, `db/migrations/`,
`db/queries/`.

### 4. Module skeleton

Read [`references/module-skeleton.md`](./references/module-skeleton.md)
and write the files it describes: `go.mod` with tool pinning, `sqlc.yaml`,
config, the embedded migrations and the pool wiring, `run()`, the server
and its interceptor chain (validation included), health endpoints, the
lint config, and the Dockerfile.

Let `go get` resolve versions rather than pinning ones from memory, then
`go mod tidy`. Pinned versions written from memory are the most common way
a scaffold arrives broken.

### 5. First resource through the layers

Follow the per-layer patterns in the path reference: goose migration, sqlc
queries, `go tool sqlc generate`, adapter, store, handler. The migration
comes first because sqlc reads the schema from it.

For anything beyond the first resource, hand off to
`maybloom-stack-add-resource`, which walks the same pipeline and knows
both backends.

### 6. Root wiring

Make the service reachable the way everything else in the repo is: a
`dev:<SERVICE>` script in the root `package.json`, an entry in the compose
file, a route in the reverse proxy config if the repo has one, and the Go
build in CI alongside the existing typecheck.

## Verification before claiming done

A bootstrap that typechecks but doesn't run is not done.

1. `go generate .` from `go/` populates `go/gen/<APP_SLUG>/...` for both
   the shared resources and the new service package and runs sqlc, which
   validates queries against the schema, so a typo fails here rather than
   at runtime.
2. `go build ./...`, `go vet ./...` and `go tool golangci-lint run` pass.
3. `go run ./cmd/<SERVICE>` boots, applies the goose migration on start
   (watch the log for it), and serves `/healthz` and `/readyz`.
4. The first RPC answers a real call — the generated connect-go client
   from a test, or curl against
   `/<APP_SLUG>.<SERVICE_PROTO_PKG>.v1.<SERVICE_NAME>/<Method>` — and a
   request that violates a protovalidate constraint answers
   `invalid_argument`.
5. The store tests run against `TEST_DATABASE_URL` (a throwaway database
   container) and skip cleanly without it.
6. `pnpm typecheck` still passes: the shared protos regenerated, so the
   TypeScript side must still build.
7. `git status` shows no generated files.
8. `docker build -f go/Dockerfile .` from the repo root succeeds and the
   image answers `/healthz`.

## After bootstrap: what the user now owns

Say these out loud rather than leaving them to be discovered.

- **Two backends means two deploys.** The compose file, the proxy, and CI
  each grew an entry, and both images need building on release.
- **The contract is the only coupling that is safe.** If the two services
  start sharing tables, that coupling is invisible to the wire and will
  break in production rather than at build time.
- **The Go path is validated, and still moving.** Two services proved the
  blueprint and rewrote it once; patterns that turn out wrong on this one
  should come back as changes to
  `../maybloom-stack-shared/references/paths/backend-go/README.md` and the
  docs, not as local workarounds. Recording a deliberate deviation in the
  project's `CLAUDE.md` is how the next session inherits it.
