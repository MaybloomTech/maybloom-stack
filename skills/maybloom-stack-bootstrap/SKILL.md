---
name: maybloom-stack-bootstrap
description: Use whenever the user wants to start a new project that uses the "maybloom stack" — a pnpm monorepo with Protocol Buffers + Connect-RPC + Fastify + Drizzle + PGlite on the backend and Expo Router + React Query on the interface. Triggers on phrases like "new project with the maybloom patterns", "bootstrap a maybloom-style monorepo", "set up a proto + Fastify + Expo project", or "start a Connect-RPC backend with an Expo client". Use this even when the user names a different stack ("proto + Fastify + Expo") if the underlying request matches the framework. The skill scaffolds the entire monorepo and ships one example resource ("Note") wired through every layer so the user has a running CRUD loop after `pnpm install`. The scaffolded backend and interface are the stack's validated defaults (TypeScript, Expo); use this skill even when the user wants the Go backend or another Connect-RPC client/server technology — the contract-and-codegen monorepo core is the same, and the user's choices are then built from the shared blueprint and core references, never improvised.
---

# maybloom-stack-bootstrap

Bootstrap a fresh monorepo on the maybloom stack: a pnpm workspace with
three packages — Protocol Buffers (Buf +
Connect-ES generated TypeScript), backend (Fastify + Connect-RPC + Drizzle ORM
with a PGlite dev DB and a Postgres prod DB), and interface (Expo Router +
React Query + Connect Web client).

The skill ships a single example resource — a `Note` (id, title, body,
created_by, timestamps) — wired through every layer. After scaffolding the
user can run the full loop end-to-end before adding their own resources.

## When to use this skill vs. its sibling

- **bootstrap (this skill)**: a brand-new repo. Run once per project.
- **`maybloom-stack-add-resource`**: an existing scaffold. Use to add a
  second, third, Nth resource. After scaffolding, if the user has named
  their actual resources, hand off to the add-resource skill once per
  resource — do not try to extend this scaffold's `Note` plumbing into
  bespoke resources by hand.

The backend this skill scaffolds is the TypeScript one (Fastify + Drizzle
+ PGlite). The stack also defines a Go backend (connect-go + sqlc + pgx)
as a peer behind the same contract; there is no Go scaffolder yet — don't
improvise one. If the user wants a Go service, the per-layer blueprint is
`../maybloom-stack-shared/references/paths/backend-go/README.md`: build the `go/`
module by hand following its layout and patterns, and use add-resource
for the resources.

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
replaces them. Suggest recording their choices in the project's
`CLAUDE.md` so later sessions inherit them.

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

1. **Install + initial codegen.** From the project root:

   ```bash
   pnpm install
   ```

   The `postinstall` script runs `pnpm proto:gen && pnpm build`, which
   populates `packages/protocol-buffers/src/<slug>/...` from the proto
   files and builds both packages.

2. **Generate the initial DB migration.** The skill ships a Drizzle schema
   for `Note` but no migration file (those are environment-specific):

   ```bash
   pnpm --filter <ORG_SCOPE>/backend db:generate
   ```

   Drizzle-kit writes `drizzle/0000_*.sql`. Commit it.

3. **Run the backend.** Defaults to PGlite at `./.dev-db/<slug>` — no
   Docker required:

   ```bash
   pnpm dev:backend
   ```

   Should log `[database] Connection healthy` and start listening on
   `http://localhost:3000`. Hit `/healthz` to confirm.

4. **Run the interface.** In another terminal:

   ```bash
   pnpm dev:interface
   ```

   Open the Expo dev menu (web is fastest for verification). The home
   screen renders the example notes list with create + delete.

5. **Initialize git.** The scaffolder doesn't `git init` — let the user
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
- **`pnpm install` runs `postinstall` which runs `proto:gen && build`.**
  First install can take a minute. If `proto:gen` fails, check that
  `node_modules/.bin/protoc-gen-es` exists — if not, run `pnpm install`
  again or check the buf catalog versions.

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
```
