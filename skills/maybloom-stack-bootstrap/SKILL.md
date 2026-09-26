---
name: maybloom-stack-bootstrap
description: Use whenever the user wants to start a new project that uses the "maybloom stack" — a pnpm monorepo with Protocol Buffers + Connect-RPC + Fastify + Drizzle + PGlite on the backend and Expo Router + React Query on the interface. Triggers on phrases like "new project with the maybloom patterns", "bootstrap a maybloom-style monorepo", "set up a proto + Fastify + Expo project", or "start a Connect-RPC backend with an Expo client". Use this even when the user names a different stack ("proto + Fastify + Expo") if the underlying request matches the framework. The skill scaffolds the entire monorepo and ships one example resource ("Note") wired through every layer so the user has a running CRUD loop after `pnpm install`, plus a static Astro docs site that renders the contract's own reference from the protos at build time. The scaffolded backend and interface are the stack's validated defaults (TypeScript, Expo); use this skill even when the user wants the Go backend or another Connect-RPC client/server technology — the contract-and-codegen monorepo core is the same, and the user's choices are then built from the shared blueprint and core references, never improvised.
---

# maybloom-stack-bootstrap

Bootstrap a fresh monorepo on the maybloom stack: a pnpm workspace with
four packages — Protocol Buffers (Buf + Connect-ES generated TypeScript),
backend (Fastify + Connect-RPC + Drizzle ORM with a PGlite dev DB and a
Postgres prod DB), interface (Expo Router + React Query + Connect Web
client), and a docs site (Astro, static) that renders the contract itself.

The skill ships a single example resource — a `Note` (id, title, body,
created_by, timestamps) — wired through every layer. After scaffolding the
user can run the full loop end-to-end before adding their own resources.

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
- **`maybloom-stack-bootstrap-go`** to add a Go service to the repo this
  skill created.

The backend this skill scaffolds is the TypeScript one (Fastify + Drizzle
+ PGlite). The stack also defines a Go backend (connect-go + sqlc + pgx)
as a peer behind the same contract. If the user wants a Go service,
scaffold the monorepo here first — the proto module and Buf codegen wiring
are what every path shares — then hand off to
`maybloom-stack-bootstrap-go`, which stands up the `go/` module against
the contract this skill just created.

The same logic extends past Go, because the stack's core is the contract,
not the frameworks around it (see
`../maybloom-stack-shared/references/core.md`). The scaffolded TypeScript
backend and Expo interface are validated defaults; when the user has no
stated preference, scaffold them without ceremony. When the user *does*
want a different client or server technology — another Connect-RPC
language, a different UI framework, code sources of their own they want
to keep using — don't turn them away and don't force the defaults:
scaffold the monorepo anyway (the proto module and Buf codegen wiring are
the part every path shares), keep the packages that fit, and follow the
open-path protocol in `core.md` for the rest. The scaffolded packages
remain useful as live exemplars of the layer seams even when the user
replaces them. The scaffold writes a `CLAUDE.md` with a `## Delegation`
section (see `maybloom-stack-delegate`); record their choices there so
later sessions inherit them.

## Interview

Before running the scaffolder, collect four values from the user. They map
1:1 to the placeholders the templates use.

| Prompt | Variable | Example | Notes |
|---|---|---|---|
| What's the display name? | `__APP_NAME__` | `Foobar` | PascalCase. Becomes the Expo app name and the Connect service name (`FoobarService`). |
| Slug? | `__APP_SLUG__` | `foobar` | lowercase, dashes ok, no spaces. Drives the proto package, the npm package basenames, the database name, the Android package, etc. Has to be a valid identifier prefix. |
| npm org / scope? | `__ORG_SCOPE__` | `@foobar-tech` | Must start with `@`. Becomes `@foobar-tech/backend`, `@foobar-tech/interface`, `@foobar-tech/protocol-buffers`. |
| Where to scaffold? | `--out` | `~/workspace/foobar` | Must be empty or non-existent. |

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
  --out '<OUT_DIR>'
```

The script copies `templates/` into `<OUT_DIR>`, dropping `.tmpl` suffixes
and substituting placeholders. It refuses to scaffold into a non-empty dir.

## After scaffolding

Walk the user through the post-bootstrap checklist. Don't run any of these
yourself unless the user asks — they involve installing thousands of
packages and spinning up dev servers.

1. **Refresh the dependency catalog.** The catalog in
   `pnpm-workspace.yaml` is the last set known to build together, not the
   current one — nothing updates a template, so it is stale by however long
   it has been since anyone edited it. Raise each entry to the current
   published version before installing (`npm view <name> version` gives it),
   with two exceptions that are ceilings rather than preferences:

   | Package | Ceiling | Why |
   |---|---|---|
   | `typescript` | stay below 7 | 7 is the native compiler and does not expose the programmatic API `astro check` is built on, so `pnpm typecheck` fails outright. Track withastro/roadmap#1321. |
   | `react`, `react-dom`, `@types/react` | the major Expo pins | React Native fixes the React major for the whole Expo SDK. React moves when Expo moves, never ahead of it. |

   Check whether those reasons still hold rather than applying them by
   habit; both are claims with dates on them, and a ceiling whose reason has
   expired should be deleted, not inherited. If the user wants the scaffold
   reproducible instead of current, skip this step and say so — the floor
   builds, it is just older.

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
   `packages/protocol-buffers/src/<slug>/...` from the proto files,
   compiles the descriptor set the docs site renders, and builds the
   packages.

3. **Generate the initial DB migration.** The skill ships a Drizzle schema
   for `Note` but no migration file (those are environment-specific):

   ```bash
   pnpm --filter <ORG_SCOPE>/backend db:generate
   ```

   Drizzle-kit writes `drizzle/0000_*.sql`. Commit it.

4. **Run the backend.** Defaults to PGlite at `./.dev-db/<slug>` — no
   Docker required:

   ```bash
   pnpm dev:backend
   ```

   Should log `[database] Connection healthy` and start listening on
   `http://localhost:3000`. Hit `/healthz` to confirm.

5. **Run the interface.** In another terminal:

   ```bash
   pnpm dev:interface
   ```

   Open the Expo dev menu (web is fastest for verification). The home
   screen renders the example notes list with create + delete.

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
   do that explicitly so they own the first commit.

## Reference: framework concepts the user is now responsible for

These are the patterns embedded in the templates. When the user asks
"where does X live" or "how do I add Y", point them at these:

- **Connect-RPC service definition lives in proto.** Adding an RPC means
  declaring it in `proto/<slug>/service/v1/service.proto`, regenerating,
  writing a handler, and wiring it into the service object in
  `packages/backend/src/main.ts`. The TypeScript compiler refuses to build
  if those four are out of sync.
- **handler → store → adapter on the backend.** Handlers (`src/handlers/`)
  are thin: they extract auth context and shape proto responses. Stores
  (`src/core/<resource>/store.ts`) hold real logic and call Drizzle.
  Adapters (`src/core/<resource>/adapter.ts`) bridge proto messages and DB
  rows.
- **Root-relative imports on the backend.** `tsconfig.json` sets
  `baseUrl: "src"`, so import from `db/...`, `core/...`, `handlers/...` —
  not `../../db/...`.
- **Typed config via Typebox + `@fastify/env`.** All runtime config goes
  through `configSchema` in `src/config.ts`. Read it via `server.config`.
- **PGlite for dev, Postgres for prod, one driver-agnostic surface.**
  `src/db/config.ts` returns a `DbHandle` whose `.db` is structurally
  identical regardless of driver. The single cast in `initPgliteHandle`
  reconciles the two type-level shapes.
- **Connect client is a singleton.** `interface/src/data/api/client.ts`
  exports `client` — import it from any data-layer file. React Query
  hooks under `src/data/queries/` wrap it for caching.
- **`EXPO_PUBLIC_*` env vars are inlined at build time.** Override the
  API URL per-environment via `.env` or EAS build profiles.

## After bootstrap: handoff to add-resource

If the user gave you a list of real resources during the interview, now
run the `maybloom-stack-add-resource` skill once per resource. The
example `Note` is meant as a teaching specimen — it can stay as a
reference or get deleted once the real resources are in.

If the user didn't name their resources up-front, leave `Note` in place
and explain that they can use add-resource whenever they're ready.

## Gotchas

Specific to bootstrap:

- **Don't edit `packages/protocol-buffers/src/`.** It's regenerated from
  `proto/` by `pnpm proto:gen`. The biome config already excludes it.
- **`docker-compose.yaml` defaults to user `postgres` / password
  `postgres`.** Fine for dev. Remind the user to swap for any deployment
  beyond a laptop.
- **`pnpm install` runs `postinstall` which runs
  `proto:gen && proto:descriptor && build`.** First install can take a
  minute. If `proto:gen` fails, check that `node_modules/.bin/protoc-gen-es`
  exists — if not, run `pnpm install` again or check the buf catalog
  versions.
- **The docs site won't build without its descriptor.**
  `packages/docs-site/src/generated/descriptor.json` is generated and
  gitignored, so a fresh clone needs `pnpm proto:descriptor` before
  `pnpm build` — which `postinstall` already does in the right order. If
  the site fails with a missing import, that step was skipped.

Project-wide gotchas the user will hit *after* bootstrap (Drizzle's
interactive rename prompt; proto field-number reuse vs `reserved`;
empty-string-vs-NULL) live in
`../maybloom-stack-shared/references/gotchas.md` and
`../maybloom-stack-shared/references/proto-conventions.md`.
Point the user there once they're past the initial scaffold.

## Layer reference (where things live)

```
<out>/
├── package.json                 # workspace scripts (build, dev, lint, proto:gen)
├── pnpm-workspace.yaml          # workspaces + dependency catalog
├── tsconfig.json                # base; each package extends
├── biome.json                   # lint + format (replaces eslint+prettier)
├── buf.yaml, buf.gen.yaml       # proto module + Connect-ES codegen
├── docker-compose.yaml          # local Postgres for prod-like dev
├── proto/<slug>/
│   ├── resources/v1/notes.proto # data model
│   └── service/v1/
│       ├── notes.proto          # request/response messages
│       └── service.proto        # the single service definition
└── packages/
    ├── protocol-buffers/        # generated TypeScript lives in src/
    ├── backend/
    │   ├── src/
    │   │   ├── main.ts          # service registration + RPC plumbing
    │   │   ├── server.ts        # Fastify bootstrap + shutdown signals
    │   │   ├── config.ts        # Typebox env schema
    │   │   ├── context.ts       # Connect context keys (kRequestId, kUserId)
    │   │   ├── routes.ts        # non-RPC HTTP routes (root, health)
    │   │   ├── db/
    │   │   │   ├── config.ts    # initDb(): pglite | postgres
    │   │   │   ├── plugin.ts    # Fastify plugin: migrate + decorate
    │   │   │   └── schema.ts    # Drizzle table definitions
    │   │   ├── core/
    │   │   │   ├── utils/timestamps.ts
    │   │   │   └── notes/
    │   │   │       ├── adapter.ts  # proto <-> row
    │   │   │       └── store.ts    # business logic
    │   │   ├── handlers/        # one file per RPC method
    │   │   └── types/fastify.d.ts  # FastifyInstance.config + .db
    │   ├── drizzle.config.ts    # drizzle-kit migrations target
    │   └── Dockerfile           # multi-stage build (build → runner)
    └── interface/
        ├── app/                 # Expo Router file-based routes
        │   ├── _layout.tsx      # QueryClientProvider + Stack
        │   └── index.tsx        # example NotesScreen
        ├── src/data/
        │   ├── api/
        │   │   ├── client.ts    # singleton Connect client
        │   │   └── notes.ts     # thin domain wrappers
        │   ├── queries/
        │   │   └── useNotes.ts  # React Query hooks
        │   └── queryClient.ts
        ├── app.json             # Expo metadata
        └── babel.config.js
    └── docs-site/               # static site rendered from the contract
        ├── src/
        │   ├── contract.ts      # walks the descriptor set, extracts comments
        │   ├── generated/       # descriptor.json (gitignored, from buf build)
        │   ├── layouts/Layout.astro
        │   ├── pages/
        │   │   ├── index.astro          # service + RPC table, message index
        │   │   └── messages/[name].astro # a page per message
        │   └── styles/global.css
        ├── astro.config.mjs     # static output
        └── Dockerfile           # build → nginx, like every other surface
```
