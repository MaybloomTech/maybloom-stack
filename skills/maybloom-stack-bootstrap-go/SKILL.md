---
name: maybloom-stack-bootstrap-go
description: Use whenever the user wants to add a Go service to an EXISTING maybloom stack monorepo (a repo with `proto/` and `buf.yaml`, from `maybloom-stack-bootstrap` or following its conventions) that has no `go/` yet — one scaffolded with `--backend typescript`, or a contract-only repo — standing up the `go/` module with connect-go, sqlc, pgx, and goose from the bootstrap skill's own Go templates, so a backend (or a second one) can serve the same contract. Triggers on "add a Go service to this repo", "I want the ingest pipeline in Go", "bootstrap the Go backend", "this workload needs Go, set it up", or a user reaching for Go because a job is concurrency-heavy, long-running, or headed for constrained hardware. This is the scaffolder that runs once per Go service; use `maybloom-stack-add-resource` or `maybloom-stack-add-rpc` for everything after it exists, and `maybloom-stack-bootstrap` instead when there is no monorepo yet (its default already scaffolds the Go backend).
---

# maybloom-stack-bootstrap-go

Stand up a Go service inside a monorepo that already has a contract. The
protos, the buf toolchain, and the TypeScript side stay where they are;
this adds a peer backend that speaks the same wire.

A new repo does not need this skill: `maybloom-stack-bootstrap` scaffolds
the Go backend by default. This skill is for the repo that was scaffolded
with `--backend typescript` and now wants Go, or a contract-only repo, or
a second Go service. It writes the same files bootstrap does, from the
same templates (`../maybloom-stack-bootstrap/templates/backend-go/` and
`templates/root-go/`), so the two never drift.

Read
`../maybloom-stack-shared/references/paths/backend-go/README.md` first —
it is the path reference, and it defines every per-layer pattern this
skill scaffolds toward. This skill covers only what exists once per
service: the module, the server, the database wiring, and the deploy
shape. The files are the bootstrap templates;
[`references/module-skeleton.md`](./references/module-skeleton.md) is the
commentary on them. Read it when you reach step 4.

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
  Record the reason in the project's `AGENTS.md`.

If the answer is thin, say so once and let the user decide. They may have
context you don't.

## Interview

Collect these before writing anything; each one appears in several files
and renaming later is tedious.

| Variable | Meaning | Example |
|---|---|---|
| `<APP_SLUG>` | the proto root: existing, read it from `proto/`; it is also the database name | `orchard` |
| `<GO_MODULE>` | Go module path | `github.com/acme/orchard/go` |
| `<SERVICE>` | binary and `cmd/` directory name | `ingest` |
| `<SERVICE_PROTO_PKG>` | the proto package this service owns, under the root | `ingest` (→ `proto/<APP_SLUG>/ingest/v1`, package `<APP_SLUG>.ingest.v1`) |
| `<SERVICE_NAME>` | the proto service block | `IngestService` |
| `<PORT>` | the port it listens on | `8080` (the templates' default; change it when another backend already has it) |

`<APP_SLUG>` and `<SERVICE>` are different things, and the templates spell
both `__APP_SLUG__` because for the app's own backend they coincide. In
every generated import (`<GO_MODULE>/gen/__APP_SLUG__/...`), every proto
package and the database name, `__APP_SLUG__` is the proto root and stays
`<APP_SLUG>`. Only the binary is `<SERVICE>`: the `cmd/__APP_SLUG__/`
directory, the `-o /out/__APP_SLUG__`, `adduser`, `COPY`, `USER` and
`ENTRYPOINT` lines of the Dockerfile, the `__APP_SLUG__:` and
`__APP_SLUG__ stopped` prefixes in `main.go`, and the `dev:backend` and
`docker:backend:*` scripts. Step 4 has the substitution in that order.

If the protos already carry a `go_package` (bootstrap writes one on both
paths), `<GO_MODULE>` is decided: read it from there. Confirm the database
story: the service can share the TypeScript backend's Postgres or own its
own. Two services writing the same tables is a coupling the contract cannot
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

Create `proto/<APP_SLUG>/<SERVICE_PROTO_PKG>/v1/` with:

- `health.proto`: the bootstrap's
  `templates/proto/proto-tree/service/v1/health.proto.tmpl` with
  `package <APP_SLUG>.<SERVICE_PROTO_PKG>.v1;` and
  `option go_package = "<GO_MODULE>/gen/<APP_SLUG>/<SERVICE_PROTO_PKG>/v1;<SERVICE_PROTO_PKG>v1";`.
  Every service has its own `Health`: it is the one open RPC, the server
  template serves it, and buf refuses an empty service.
- `service.proto`: the same package and `go_package`, importing
  `<APP_SLUG>/<SERVICE_PROTO_PKG>/v1/health.proto` and whatever it needs
  from `resources/v1`, declaring `service <SERVICE_NAME>` with `Health`
  and one real RPC to start — the smallest operation the user actually
  wants — so the scaffold ends in a service that does something rather
  than an empty interface. Its request and response envelopes go in a
  `<resources>.proto` beside it. Conventions:
  `../maybloom-stack-shared/references/proto-conventions.md`.

Both files take the `go_package` even on a TypeScript-path repo: buf
generates Go for every file it sees, and the option is what names the
packages. Run `buf lint` at the repo root.

If the RPC needs a resource that doesn't exist yet, scaffold the service
with the simplest useful RPC now and hand off to
`maybloom-stack-add-resource` afterward. A bootstrap that ends in a
running server beats one that ends in a half-written resource.

### 2. Teach buf to emit Go

Copy `go.mod.tmpl` (as `go.mod`, with `<GO_MODULE>` in place of
`__GO_MODULE__`), `go.sum`, `buf.gen.yaml`, `sqlc.yaml`, `generate.go` and
`.gitignore` from `../maybloom-stack-bootstrap/templates/backend-go/` into
`go/`, and `templates/root-go/go.work.tmpl` to the repo root as `go.work`.
That pins buf, `protoc-gen-go`, `protoc-gen-connect-go` and sqlc as
`go tool` dependencies and gitignores `gen/` and `internal/store/storedb/`:
generated code is never committed on any path. If the protos lack a
`go_package` option (a repo that predates the Go-first scaffold), add one
to every file: `<GO_MODULE>/gen/<APP_SLUG>/<pkg>/v1;<pkg>v1`. If
`buf.yaml` still depends on `buf.build/googleapis/googleapis` rather than
vendoring protovalidate under `third_party/`, bring the root over to the
bootstrap templates' `buf.yaml`, `buf.gen.yaml` and `third_party/` first.

Copy `scripts/go` and `scripts/golangci-lint` from `templates/root-go/`
too (the Go toolchain and the linter in their pinned images, for a machine
without Go) and run `scripts/go tool buf generate ../proto --template
buf.gen.yaml` (or the same without the wrapper, from `go/`). Confirm
`go/gen/<APP_SLUG>/<SERVICE_PROTO_PKG>/v1/` and its `<SERVICE_PROTO_PKG>v1connect/`
appear before continuing — finding out the plugins are misconfigured after
writing the server wastes the whole step. From here on `go generate .`
(buf, then sqlc) is the one command the README, CI and the Dockerfile run.

### 3. Directory layout

Create the tree from the path reference's layout section: `cmd/<SERVICE>/`,
`internal/server/`, `internal/store/`, `internal/postgres/`, `db/migrations/`,
`db/queries/`.

### 4. Module skeleton

Read [`references/module-skeleton.md`](./references/module-skeleton.md)
and copy the rest of `templates/backend-go/` into `go/`, dropping `.tmpl`:
config, the embedded migrations and the pool wiring, `run()`, the identity
seam, `rpcerr`, the server and its interceptor chain (validation
included), health endpoints, the lint config, the Dockerfile, the README.
`cmd/__APP_SLUG__/` becomes `cmd/<SERVICE>/`. Leave out the Note example
(`db/migrations/00001_notes.sql`, `db/queries/notes.sql`,
`internal/store/notes*.go`, `internal/server/notes*.go`) unless the
service wants it as a specimen; step 5 writes the real first resource in
its place.

Then substitute, in this order (the binary's spellings before the proto
root's, the service package before the bare slug):

| In the copied files | Becomes |
|---|---|
| `__GO_MODULE__` | `<GO_MODULE>` |
| `cmd/__APP_SLUG__` | `cmd/<SERVICE>` |
| `__APP_SLUG__` in `go/Dockerfile` and `cmd/<SERVICE>/main.go` | `<SERVICE>` (the binary, the user, the log prefix) |
| `gen/__APP_SLUG__/service/v1` | `gen/<APP_SLUG>/<SERVICE_PROTO_PKG>/v1` |
| `servicev1connect` | `<SERVICE_PROTO_PKG>v1connect` |
| `servicev1` | `<SERVICE_PROTO_PKG>v1` |
| `__APP_SLUG__.service.v1` | `<APP_SLUG>.<SERVICE_PROTO_PKG>.v1` |
| `__APP_NAME__Service` | `<SERVICE_NAME>` |
| `__APP_NAME__` | the service's display name |
| `__APP_SLUG__` everywhere else | `<APP_SLUG>` (the proto root and the database) |

As one pass with sed, from `go/` (`ingest`/`IngestService`/`orchard` as
the example):

```bash
sed -i '' -e 's#__APP_SLUG__#ingest#g' Dockerfile cmd/ingest/main.go
find . -type f \( -name '*.go' -o -name Dockerfile -o -name '*.md' -o -name '*.yaml' \) -print0 | xargs -0 sed -i '' \
  -e 's#__GO_MODULE__#github.com/acme/orchard/go#g' \
  -e 's#gen/__APP_SLUG__/service/v1#gen/orchard/ingest/v1#g' \
  -e 's#servicev1connect#ingestv1connect#g' -e 's#servicev1#ingestv1#g' \
  -e 's#__APP_SLUG__\.service\.v1#orchard.ingest.v1#g' \
  -e 's#__APP_NAME__Service#IngestService#g' -e 's#__APP_NAME__#Ingest#g' \
  -e 's#__APP_SLUG__#orchard#g'
```

Then the root pieces from `templates/root-go/`: the Go scripts from its
`package.json` merged into the repo's, renamed for the service
(`dev:<SERVICE>`, `test:<SERVICE>`, `docker:<SERVICE>:*`, with
`cmd/<SERVICE>` and `<PORT>` in them; the `test:` script's
`TEST_DATABASE_URL` points at `<APP_SLUG>_test`, which the compose
database creates), and the lines from its `AGENTS.md` the repo's lacks (a repo that
keeps its guidance in `CLAUDE.md` takes them there), and the Go entries
of its `.claude/settings.json` `permissions.allow` (`scripts/go`,
`scripts/golangci-lint`, `go`, `pnpm test:<SERVICE>`, the compose
database) into the repo's, so the Go checks run without a prompt.
The compose file already has the database; add `docker/postgres/` from
`templates/root/` if the repo predates it.

Then `scripts/go generate .` first (sqlc writes `internal/store/storedb`,
which the store imports; tidy before it tries to fetch that package from
the network), `scripts/go mod tidy` (the shipped `go.mod` and `go.sum`
are a floor known to build together, and tidy confirms them against the
imports; pinned versions written from memory are the most common way a
scaffold arrives broken), `gofmt -w .` (the substitution shortens import
aliases, and the linter checks formatting) and `scripts/go build ./...`:
the build is the exhaustiveness check, and with the Note example left out
the only method `Service` needs is `Health`, so it passes before step 5.

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
file, a route in the reverse proxy config if the repo has one, and CI.

The bootstrap's CI lives in `.github/workflows/`; the Go path's version is
`../maybloom-stack-bootstrap/templates/root-go/.github/workflows/`, and
its `ci.yml.tmpl` and `image.yml.tmpl` are the source for what follows
(substitute `__APP_SLUG__`, `__APP_NAME__` and `__ORG_SCOPE__` as for the
module).

Paths map to areas in one place: the `AREAS` table in the `changes`
job's env. Every edit to the `changes` job below is a line in that table;
its script is never touched.

- **The repo has a `ci.yml` without a `go` job** (scaffolded with
  `--backend typescript`):
  0. If the TypeScript backend was deleted (the Go-first path above),
     take it out of CI first, or the next contract change fails: drop
     `package:backend` and `image:backend` from the table's lines, the
     `packages/backend/*` line, the `backend)` line in `image.yml`'s
     `Name the image` step and its port-3000 smoke step. The Go service's
     image takes its place as `image:<SERVICE>` below.
  1. Copy the template's `go` job into `ci.yml` as it is, with its
     Postgres service on `<APP_SLUG>_test`. It runs generate, `go mod
     tidy -diff`, vet, build, golangci-lint at the version
     `scripts/golangci-lint` pins, govulncheck and `go test -p 1 -race`.
  2. In the table, add `go image:<SERVICE>` to the `proto/*`,
     `buf.yaml`, `buf.gen.yaml` and `third_party/*` lines (the service
     generates its code from the contract, so a contract change rebuilds
     and smoke-tests its image), and add the lines
     `go/* go image:<SERVICE>`, `go.work go`, `scripts/go go` and
     `scripts/golangci-lint go`.
  3. Add `go` to the `needs` of the `image` job and of `passed`, so a
     failing Go job holds the image back and fails `CI passed`.
- **The service's image**, in `image.yml`:
  1. A line for it in the `Name the image` step's case
     (`<SERVICE>) dockerfile=<path to its Dockerfile> ;;`). An image the
     table names without a line here fails that step by name. Its
     Dockerfile carries the backend's `ARG REVISION=${VERSION}` and
     `LABEL org.opencontainers.image.revision="${REVISION}"` in the
     runtime stage: CI passes the full SHA there and the tag check reads
     it, so an image without the label fails every rerun as unlabelled.
  2. A smoke step, `if: matrix.image == '<SERVICE>' &&
     steps.tag.outputs.exists != 'true'` (a rerun whose tag is already
     pushed builds nothing, so there is nothing to smoke), that boots it
     with `DEV_USER` against the job's Postgres and calls its `Health` at
     `/<APP_SLUG>.<SERVICE_PROTO_PKG>.v1.<SERVICE_NAME>/Health`, checking
     the version is the short SHA. The Go template's backend step is the
     one to copy, with the port the service listens on (each image has
     its own leg, so no other container holds it).
  3. On the TypeScript path `image.yml` has no Postgres service: copy the
     `services:` block from the Go template's `image` job (it starts one
     for every leg).
  The `latest` job needs nothing: it moves `latest` on every image CI
  named.
- **A repo with no `.github/workflows/` from the bootstrap at all**:
  copy rather than write a Go job from scratch.
  1. From `../maybloom-stack-bootstrap/templates/root/`:
     `.github/workflows/conventional-commits.yml`, `.github/dependabot.yml`
     and `commitlint.config.mjs`. The commit check runs
     `pnpm exec commitlint`, so also add `@commitlint/cli` and
     `@commitlint/config-conventional` to the root `package.json`'s
     devDependencies as `catalog:`, with their catalog entries from that
     directory's `pnpm-workspace.yaml`, and refresh the lockfile.
     Without them the check fails on every pull request.
  2. `ci.yml.tmpl` and `image.yml.tmpl`: from `root-go/` if the Go
     module is the repo's only backend (they already have the Go job,
     its table lines and the backend image); or from `root-typescript/`
     if a TypeScript backend stays alongside it, and then the first
     bullet above to add the Go job. Either way, trim the table, the
     matrix and the image steps to the packages and images the repo has.

## Verification before claiming done

A bootstrap that typechecks but doesn't run is not done.

1. `go generate .` from `go/` populates `go/gen/<APP_SLUG>/...` for both
   the shared resources and the new service package and runs sqlc, which
   validates queries against the schema, so a typo fails here rather than
   at runtime.
2. `go build ./...`, `go vet ./...` and `scripts/golangci-lint run` pass.
3. `pnpm dev:<SERVICE>` (or `go run ./cmd/<SERVICE>`) boots with
   `DEV_USER` set, logs `migrations applied applied=N version=M`, and
   serves `/healthz`, `/readyz` and the `Health` RPC.
4. The first RPC answers a real call — the generated connect-go client
   from a test, or curl against
   `/<APP_SLUG>.<SERVICE_PROTO_PKG>.v1.<SERVICE_NAME>/<Method>` — and a
   request that violates a protovalidate constraint answers
   `invalid_argument`.
5. The store tests run against `TEST_DATABASE_URL` (`pnpm test:<SERVICE>`
   points it at the compose `<APP_SLUG>_test` database) and skip cleanly
   without it.
6. `pnpm typecheck` still passes: the shared protos regenerated, so the
   TypeScript side must still build.
7. `git status` shows no generated files.
8. `docker build -f go/Dockerfile .` from the repo root succeeds and the
   image answers `/healthz`.

## After bootstrap: what the user now owns

Say these out loud rather than leaving them to be discovered.

- **Two backends means two deploys.** The compose file, the proxy, and CI
  each grew an entry, and the image workflow now builds, smoke-tests and
  pushes both images from main.
- **The contract is the only coupling that is safe.** If the two services
  start sharing tables, that coupling is invisible to the wire and will
  break in production rather than at build time.
- **The Go path is validated, and still moving.** Patterns that turn out
  wrong on this service should come back as changes to
  `../maybloom-stack-shared/references/paths/backend-go/README.md` and the
  docs, not as local workarounds. Recording a deliberate deviation in the
  project's `AGENTS.md` is how the next session inherits it.
