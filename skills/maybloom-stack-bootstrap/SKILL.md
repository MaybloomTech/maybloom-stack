---
name: maybloom-stack-bootstrap
description: Use whenever the user wants to start a new project that uses the "maybloom stack" — a pnpm monorepo whose core is a Protocol Buffers + Connect-RPC contract, with a Go backend (connect-go + sqlc + pgx + goose on Postgres) by default or a TypeScript backend (Fastify + Drizzle + PGlite) on request, an Expo Router interface, and a static Astro docs site that renders the contract. Triggers on phrases like "new project with the maybloom patterns", "bootstrap a maybloom-style monorepo", "set up a proto + Go + Expo project", "start a Connect-RPC backend with an Expo client", or "proto + Fastify + Expo". Use this even when the user names a different stack if the underlying request matches the framework. The skill scaffolds the entire monorepo and ships one example resource ("Note") wired through every layer so the user has a running CRUD loop after install, plus the docs site. Go is scaffolded unless the user asks for TypeScript or names one language across the loop as their reason; other Connect-RPC client or server technologies are built from the shared blueprint and core references, never improvised.
---

# maybloom-stack-bootstrap

Bootstrap a fresh monorepo on the maybloom stack: a pnpm workspace with
the contract at the root (Buf, the vendored protovalidate rules, Connect-ES
generated TypeScript), a backend, an interface (Expo Router + React Query
+ Connect Web client), a docs site (Astro, static) that renders the
contract itself, and the CI that checks all of it: GitHub Actions
workflows for the per-area checks, the image build-and-push, and
Conventional Commits.

The backend is **Go by default**: connect-go on the stdlib mux, sqlc + pgx
over Postgres, goose migrations applied on boot, protovalidate enforced by
an interceptor, one static binary. `--backend typescript` scaffolds the
Fastify + Drizzle + PGlite backend instead; it is a validated path and the
documented alternative, chosen when one language across the whole loop is
the user's stated reason or when PGlite's zero-container dev loop matters
more than the Go defaults (`docs/choosing.md` has the criteria).

The skill ships a single example resource, a `Note` (id, title, body,
created_by, timestamps, archived_at), wired through every layer. After
scaffolding the user can run the full loop end-to-end before adding their
own resources. Note demonstrates the contract conventions as they stand:
`buf.validate` rules on the resource and the envelopes, a `Health` RPC
open to anonymous callers, cursor paging (`page_size`, opaque
`page_token`, `next_page_token`), and `ArchiveNote` as one answer to how
a resource leaves the default view, a question each real resource answers
for itself.

The docs site is the worked example on the client side that the interface
isn't: it never calls the service. It compiles the protos to a descriptor
set at build time and renders what it finds — the service, its RPCs, and a
page per message listing every field with the comment from the proto. That
is a page protobuf decided the contents of, served as static files, and it
is why the proto comments in the scaffold are written as documentation
rather than notes to self.

## When to use this skill vs. its sibling

- **bootstrap (this skill)**: a brand-new repo. Run once per project.
- **`maybloom-stack-add-resource`**: an existing scaffold. Use to add a
  second, third, Nth resource. After scaffolding, if the user has named
  their actual resources, hand off to the add-resource skill once per
  resource — do not try to extend this scaffold's `Note` plumbing into
  bespoke resources by hand.
- **`maybloom-stack-extend-resource`** for new fields or child tables on a
  resource that exists, and **`maybloom-stack-add-rpc`** for one new
  operation. Both are narrower than add-resource; prefer them when they
  fit.
- **`maybloom-stack-bootstrap-go`** to add a Go service to a repo this
  skill scaffolded with `--backend typescript`, or a second Go service.

The stack's core is the contract, not the frameworks around it (see
`../maybloom-stack-shared/references/core.md`). The scaffolded Expo
interface is the validated default client. When the user *does* want a
different client or server technology — another Connect-RPC language, a
different UI framework, code sources of their own they want to keep
using — don't turn them away and don't force the defaults: scaffold the
monorepo anyway (the proto module and Buf codegen wiring are the part
every path shares), keep the packages that fit, and follow the open-path
protocol in `core.md` for the rest. The scaffolded packages remain useful
as live exemplars of the layer seams even when the user replaces them.
The scaffold writes a `CLAUDE.md` with a `## Delegation` section (see
`maybloom-stack-delegate`); record their choices there so later sessions
inherit them.

## Interview

Before running the scaffolder, collect these from the user. The first
four map 1:1 to placeholders the templates use; the backend and the Go
module have defaults worth confirming in one sentence; the licence is two
flags.

| Prompt | Variable | Example | Notes |
|---|---|---|---|
| What's the display name? | `__APP_NAME__` | `Foobar` | PascalCase. Becomes the Expo app name and the Connect service name (`FoobarService`). |
| Slug? | `__APP_SLUG__` | `foobar` | lowercase letters and digits, starting with a letter; no dashes or spaces (it is a proto package segment and a TypeScript identifier, so `my-app` is refused). Drives the proto package, the npm package basenames, the database name, the Go binary name, the Android package, etc. |
| npm org / scope? | `__ORG_SCOPE__` | `@foobar-tech` | Must start with `@`. Becomes `@foobar-tech/interface`, `@foobar-tech/protocol-buffers`, and `@foobar-tech/backend` on the TypeScript path. |
| Where to scaffold? | `--out` | `~/workspace/foobar` | Must be empty or non-existent. |
| Which backend? | `--backend` | `go` | `go` (default) or `typescript`. Don't ask when the user has no preference: say the scaffold is Go and move on. |
| Go module path? | `--go-module` / `__GO_MODULE__` | `github.com/foobar-tech/foobar/go` | Defaults to `github.com/<org without @>/<slug>/go`. Confirm it when the GitHub org differs from the npm scope. Written into every proto's `go_package` on both paths, so a Go service can join a TypeScript repo later without touching the contract. |
| Licence? | `--license` | `Apache-2.0` | An SPDX id, or `none` (the default). Ask it as a choice: none, Apache-2.0, MIT, or another id. When it is not `none`, also ask **whose copyright** (`--copyright`, e.g. `Foobar Tech`); suggest the org name and confirm. The scaffold stamps `// SPDX-License-Identifier: <id>` on every source file (config and `.d.ts` files excepted), sets the `license` field of each `package.json`, writes the rule into `CLAUDE.md`, and for Apache-2.0 and MIT writes `LICENSE` (and `NOTICE`) too. Any other id gets the headers only; say so, and that `LICENSE` is theirs to add. |

If the user mentions the resources they want up-front (e.g. "an app for
tracking books, with `Book` and `Loan` resources"), keep that list — you'll
hand it to the add-resource skill at the end of bootstrap.

If any value is ambiguous, ask one focused question. Don't guess the org
scope; if the user has no preference, suggest `@<slug>-tech` and confirm.

## Run the scaffolder

Run `scaffold.py` from wherever this skill is installed:

```bash
python3 <this-skill-dir>/scripts/scaffold.py \
  --name '<APP_NAME>' \
  --slug '<APP_SLUG>' \
  --org '<ORG_SCOPE>' \
  --out '<OUT_DIR>' \
  --backend go \                                        # or typescript
  --go-module '<GO_MODULE>' \                           # omit for the default
  --license '<SPDX_ID or none>' --copyright '<HOLDER>'  # omit both for none
```

The script copies `templates/` into `<OUT_DIR>`, dropping `.tmpl` suffixes
and substituting placeholders (in paths too: `cmd/__APP_SLUG__/`). It
refuses to scaffold into a non-empty dir.

## After scaffolding

Walk the user through the post-bootstrap checklist. Don't run any of these
yourself unless the user asks — they install thousands of packages and
start dev servers.

1. **Refresh the dependency floors.** The catalog in
   `pnpm-workspace.yaml`, and on the Go path `go/go.mod` with its
   `go.sum`, are the last set known to build together, not the current
   one — nothing updates a template, so they are stale by however long it
   has been since anyone edited them. Raise each npm entry to the current
   published version before installing (`npm view <name> version` gives
   it), with two exceptions that are ceilings rather than preferences:

   | Package | Ceiling | Why |
   |---|---|---|
   | `typescript` | stay below 7 | 7 is the native compiler and does not expose the programmatic API `astro check` is built on, so `pnpm typecheck` fails outright. Track withastro/roadmap#1321. |
   | `react`, `react-dom`, `@types/react` | the major Expo pins | React Native fixes the React major for the whole Expo SDK. React moves when Expo moves, never ahead of it. |

   Check whether those reasons still hold rather than applying them by
   habit; both are claims with dates on them, and a ceiling whose reason has
   expired should be deleted, not inherited. On the Go path, `go get -u
   ./...` then `go mod tidy` in `go/` does the same for the module, after
   step 3 has generated the code the imports point at. If the user wants
   the scaffold reproducible instead of current, skip this step and say
   so — the floor builds, it is just older.

   Do not resolve everything to latest without the ceilings. At the time of
   writing `npm view typescript version` returns a major that breaks
   `astro check`, so a project scaffolded that way ships with a broken
   typecheck on day one.

2. **Install + initial codegen.** From the project root:

   ```bash
   pnpm install
   ```

   The `postinstall` script runs
   `pnpm proto:gen && pnpm proto:descriptor && pnpm build`, which populates
   `packages/protocol-buffers/src/<slug>/...` (and `src/buf/validate/`,
   the vendored rules the contract imports) from the proto files, compiles
   the descriptor set the docs site renders, and builds the packages.

3. **The backend's own generate step.**

   **Go** — the development database is the compose one, and the module
   generates the contract and the data layer with the `go tool` binaries
   pinned in `go.mod`:

   ```bash
   docker compose up -d db
   cd go && go generate . && go mod tidy && cd ..
   ```

   `go generate .` comes first: it writes `go/gen/` (buf) and
   `go/internal/store/storedb/` (sqlc), both gitignored, and tidy run
   before them tries to fetch those packages from the network and fails.
   `go mod tidy` then confirms `go.sum` against the pins (the shipped one
   is a floor). Without Go installed, `scripts/go generate .` and
   `scripts/go mod tidy` run the same in the pinned Docker image.

   **TypeScript** — the skill ships a Drizzle schema for `Note` but no
   migration file (those are environment-specific):

   ```bash
   pnpm --filter <ORG_SCOPE>/backend db:generate
   ```

   Drizzle-kit writes `drizzle/0000_*.sql`. Commit it.

4. **Run the backend.**

   ```bash
   pnpm dev:backend
   ```

   **Go**: runs `scripts/go run` (the toolchain in Docker, so no Go on
   the machine is needed) joined to the compose network, with the
   database as `db`, port 8080 published, `DEV_USER=dev` and CORS for the
   Expo dev server. The log shows `starting`, the
   `DEV_USER` warning, `migrations applied applied=1 version=1`, and
   `listening` on `:8080`; migrations applied on
   open. `/healthz` and `/readyz` answer, and `Health` over Connect:

   ```bash
   curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
     http://localhost:8080/<slug>.service.v1.<APP_NAME>Service/Health
   ```

   **TypeScript**: PGlite at `./.dev-db/<slug>`, no Docker. Should log
   `[database] Connection healthy` and listen on `http://localhost:3000`.

5. **Run the interface.** In another terminal:

   ```bash
   pnpm dev:interface
   ```

   Open the Expo dev menu (web is fastest for verification). The home
   screen renders the example notes list with create and archive; the
   default API URL already points at the backend's port.

6. **Run the docs site.** In another terminal:

   ```bash
   pnpm dev:docs-site
   ```

   It rebuilds the descriptor set from the protos and serves a reference
   for the contract: the service and its RPCs, and a page per message with
   every field, its number, and the comment from the proto. Nothing on it
   is hand-written, which is the point — edit a comment in `proto/`,
   refresh, and the page has changed.

7. **Initialize git.** The scaffolder doesn't `git init` — let the user
   do that explicitly so they own the first commit, as `git init -b main`:
   the workflows run on `main`, and a git without `init.defaultBranch`
   names the first branch `master`, where CI never runs. `git status` must show
   no generated code: `go/gen/`, `go/internal/store/storedb/`,
   `packages/protocol-buffers/src/` and the descriptor are all ignored.
   `pnpm-lock.yaml` *is* committed: CI installs with `--frozen-lockfile`
   and fails without it. On the TypeScript path so is the migration from
   step 3: the server refuses to boot without one, so CI's image smoke
   test fails until it is in. Make the first commit's message conventional
   too (`chore: scaffold from the maybloom stack`): no check reads it,
   since it goes to main rather than through a pull request, but it is the
   first line of the history the rest of it follows.

8. **Wire CI on the forge.** The workflows run once the repo is on
   GitHub; nothing in them names a registry, a host or an account. Tell
   the user what is theirs to set, in the repository's settings:

   - **To push images**, a repository variable `REGISTRY` (the image
     prefix, e.g. `registry.example.com/team` or `ghcr.io/<owner>`) and
     the secrets `REGISTRY_USERNAME` and `REGISTRY_PASSWORD`. Until all
     three exist, main builds and smoke-tests the images and pushes
     nothing, with a notice naming what is missing. The registry must
     require credentials and be served over HTTPS, or run on localhost
     (any hosted one qualifies); one without auth, or plain HTTP on
     another host, fails the image job's check that a SHA tag is not
     already there.
   - **To make the checks binding**, require exactly two on `main`:
     `CI passed` and `conventional commits`, once each has run (GitHub
     offers a check only after it has reported). Not the area jobs: they
     report under names that change with what a pull request touches, so
     a required one waits forever on a PR that leaves its area alone.
     `CI passed` always reports and fails if any of them failed.
   - **Squash merging** with the pull request title as the commit
     message, which is why the title is linted.

   Don't do any of this for them: it is account-level configuration, and
   the stack carries the shape of the deploy, never the site.

## Reference: framework concepts the user is now responsible for

These are the patterns embedded in the templates. When the user asks
"where does X live" or "how do I add Y", point them at these:

- **Connect-RPC service definition lives in proto.** Adding an RPC means
  declaring it in `proto/<slug>/service/v1/service.proto`, regenerating,
  and writing a handler. On the Go path the generated handler interface
  refuses to compile until every declared RPC has a method; on the
  TypeScript path the service implementation object in `src/main.ts`
  does the same.
- **Input rules live in the contract.** `buf.validate` options on the
  resource (always-valid invariants: lengths) and on the request
  envelopes (presence: `required`, `uuid`, bounded `page_size`). Both
  paths enforce them in a validate interceptor (`connectrpc.com/validate`,
  `@bufbuild/protovalidate` in `src/validate.ts`), so handlers and stores
  check nothing the contract states.
- **handler → store → adapter on the backend.** Go: handlers in
  `internal/server/<resource>.go`, stores in `internal/store/<resources>.go`,
  adapters in `internal/store/adapters.go` over the sqlc output, the
  schema in `db/migrations/` (goose) and the queries in `db/queries/`
  (sqlc). TypeScript: `src/handlers/`, `src/core/<resource>/store.ts`,
  `src/core/<resource>/adapter.ts`, `src/db/schema.ts` (Drizzle).
- **Cross-cutting behaviour is interceptors, declared once** (Go:
  `internal/server/mux.go`): RequestID, Recover, Logging, auth, validate,
  in that order. A new RPC gets all of them.
- **Identity is a seam.** `internal/auth` ships the `Authenticator`
  interface, the gating interceptor with `Health` on its open list, and
  `DevAuthenticator` (`DEV_USER`). Production refuses `DEV_USER` and will
  not start until the project wires a real authenticator; the stack's Go
  document (Auth) has the two shapes that have been walked.
- **Typed config, validated at boot.** Go: `internal/config` (a struct
  with env tags, `Validate()`, a masked `Summary()`); TypeScript: Typebox
  + `@fastify/env` in `src/config.ts`.
- **Lists page by cursor.** `page_size`, `page_token`, `next_page_token`
  on every list.
- **Leaving the default view is the resource's own verb RPC.** Hard
  delete, soft delete, archive or another: the app decides per resource
  (add-resource poses the question); never a flag on Update. Note ships
  `ArchiveNote` with `include_archived` on its list.
- **Root-relative imports on the TypeScript backend.** `tsconfig.json`
  sets `baseUrl: "src"`, so import from `db/...`, `core/...`,
  `handlers/...` — not `../../db/...`.
- **Connect client is a singleton.** `interface/src/data/api/client.ts`
  exports `client` — import it from any data-layer file. React Query
  hooks under `src/data/queries/` wrap it for caching.
- **`EXPO_PUBLIC_*` env vars are inlined at build time.** Override the
  API URL per-environment via `.env` or EAS build profiles.
- **CI runs the same checks the builder runs, by area.** The table at the
  top of the `changes` job in `.github/workflows/ci.yml` is the only place
  paths map to areas, or CI will not check them. A new package under
  `packages/` is its line there (`package:<dir>`, the directory name) and
  its `package:` on every line it consumes (the contract lines and
  protocol-buffers', if it imports the contract). A second deployable is
  its `image:<name>` on the lines that feed it, a Dockerfile line in
  `image.yml`'s `Name the image` step and a smoke step guarded like the
  others (its name, and `steps.tag.outputs.exists != 'true'`, so a rerun
  that builds nothing smokes nothing), and in its Dockerfile the
  `REVISION` arg and the revision `LABEL` the other Dockerfiles carry,
  which the tag check reads: without them every rerun fails as unlabelled.
  A new job is its table lines, the job, and its name in the `needs` of
  both `image` and `passed`. Actions are pinned by SHA and Dependabot
  moves them; don't replace a pin with a tag.

## After bootstrap: handoff to add-resource

If the user gave you a list of real resources during the interview, now
run the `maybloom-stack-add-resource` skill once per resource. The
example `Note` is meant as a teaching specimen — it can stay as a
reference or get deleted once the real resources are in.

If the user didn't name their resources up-front, leave `Note` in place
and explain that they can use add-resource whenever they're ready.

## Gotchas

Specific to bootstrap:

- **Don't edit generated code.** `packages/protocol-buffers/src/`,
  `go/gen/` and `go/internal/store/storedb/` are regenerated from `proto/`
  and `go/db/`; the biome config and the gitignores already exclude them.
- **`docker-compose.yaml` defaults to user `postgres` / password
  `postgres`.** Fine for dev, and what `pnpm dev:backend` on the Go path
  connects to. Remind the user to swap for any deployment beyond a laptop.
- **`pnpm install` runs `postinstall` which runs
  `proto:gen && proto:descriptor && build`.** First install can take a
  minute. If `proto:gen` fails, check that `node_modules/.bin/protoc-gen-es`
  exists — if not, run `pnpm install` again or check the buf catalog
  versions.
- **A fresh Go clone does not compile until `go generate .` has run.**
  Editors show unresolved imports for `gen/` and `storedb/` until then;
  that is the cost of never committing generated code, and the README
  says so.
- **The docs site won't build without its descriptor.**
  `packages/docs-site/src/generated/descriptor.json` is generated and
  gitignored, so a fresh clone needs `pnpm proto:descriptor` before
  `pnpm build` — which `postinstall` already does in the right order. If
  the site fails with a missing import, that step was skipped.

Project-wide gotchas the user will hit *after* bootstrap (Drizzle's
interactive rename prompt; sqlc reading the schema from the migrations;
empty-string-vs-NULL) live in
`../maybloom-stack-shared/references/gotchas.md` and
`../maybloom-stack-shared/references/proto-conventions.md`.
Point the user there once they're past the initial scaffold.

## Layer reference (where things live)

```
<out>/
├── .github/
│   ├── workflows/ci.yml         # per-area checks; calls image.yml once they pass
│   ├── workflows/image.yml      # build, smoke-test and (from main) push the images
│   ├── workflows/conventional-commits.yml   # every commit and the PR title
│   └── dependabot.yml           # moves the actions' SHA pins weekly
├── commitlint.config.mjs        # Conventional Commits, Dependabot's long headers exempt
├── package.json                 # workspace scripts (build, dev, lint, proto:gen)
├── pnpm-workspace.yaml          # workspaces + dependency catalog
├── tsconfig.json                # base; each package extends
├── biome.json                   # lint + format (replaces eslint+prettier)
├── buf.yaml                     # two modules: proto/ and the vendored protovalidate
├── buf.gen.yaml                 # the TypeScript target, include_imports on
├── docker-compose.yaml          # local Postgres (the Go path's dev database)
├── CLAUDE.md                    # agent guidance, with the Delegation section
├── go.work, scripts/go, scripts/golangci-lint   # Go path: workspace file, Docker wrappers
├── third_party/protovalidate/buf/validate/validate.proto   # vendored, lint-ignored
├── proto/<slug>/
│   ├── common/v1/               # value types, once two resources share one
│   ├── resources/v1/notes.proto # data model, with its buf.validate invariants
│   └── service/v1/
│       ├── health.proto         # the open RPC: ok + version
│       ├── notes.proto          # request/response envelopes, presence rules, paging
│       └── service.proto        # the single service definition
├── go/                          # --backend go
│   ├── cmd/<slug>/main.go       # main, run(ctx, cfg), the logger
│   ├── internal/
│   │   ├── config/              # env struct + Validate + Summary
│   │   ├── auth/                # Authenticator, the gating interceptor, DevAuthenticator
│   │   ├── postgres/            # pool + goose migrate on open
│   │   ├── store/               # store.go, adapters.go, paging.go, notes.go (+ storedb/, generated)
│   │   ├── server/              # mux.go, interceptors.go, service.go, notes.go
│   │   └── version/             # the build stamp
│   ├── db/migrations/           # goose SQL: the schema of record
│   ├── db/queries/              # sqlc queries
│   ├── gen/                     # buf output (gitignored)
│   ├── buf.gen.yaml, sqlc.yaml, generate.go   # `go generate .` runs both generators
│   ├── go.mod, go.sum           # tools pinned as `go tool`; versions are a floor
│   ├── .golangci.yml            # everything on, each disable with a reason
│   ├── Dockerfile               # build from the repo root; alpine, non-root, /healthz
│   └── README.md, .env.example  # the module's living docs and its settings
└── packages/
    ├── protocol-buffers/        # generated TypeScript lives in src/
    ├── backend/                 # --backend typescript (Fastify + Drizzle + PGlite)
    │   ├── src/
    │   │   ├── main.ts          # service registration + RPC plumbing
    │   │   ├── server.ts        # Fastify bootstrap + shutdown signals
    │   │   ├── config.ts        # Typebox env schema
    │   │   ├── context.ts       # Connect context keys (kRequestId, kUserId)
    │   │   ├── routes.ts        # non-RPC HTTP routes (root, health)
    │   │   ├── db/              # config.ts (pglite | postgres), plugin.ts, schema.ts
    │   │   ├── core/notes/      # adapter.ts, store.ts
    │   │   ├── handlers/        # one file per RPC, health.ts included
    │   │   └── types/fastify.d.ts
    │   ├── drizzle.config.ts
    │   └── Dockerfile
    ├── interface/
    │   ├── app/                 # Expo Router file-based routes
    │   │   ├── _layout.tsx      # QueryClientProvider + Stack
    │   │   └── index.tsx        # example NotesScreen: list, create, archive
    │   ├── src/data/
    │   │   ├── api/client.ts    # singleton Connect client, default URL on the backend's port
    │   │   ├── api/notes.ts     # thin domain wrappers (paged list, archive)
    │   │   ├── queries/useNotes.ts  # React Query hooks
    │   │   └── queryClient.ts
    │   ├── app.json
    │   └── babel.config.js
    └── docs-site/               # static site rendered from the contract
        ├── src/contract.ts      # walks the descriptor set, extracts comments
        ├── src/generated/       # descriptor.json (gitignored, from buf build)
        ├── src/pages/           # index.astro, messages/[name].astro
        ├── astro.config.mjs
        └── Dockerfile
```
