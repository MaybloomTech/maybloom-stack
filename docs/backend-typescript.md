---
title: "Backend: TypeScript"
description: The Fastify + Connect-RPC + Drizzle blueprint
order: 3
---

# Backend: TypeScript

The TypeScript backend is one of the stack's two validated backends, and
was its default until September 2026, when the Go backend took that place:
Fastify as the HTTP server, Connect-RPC for the service surface, Drizzle
ORM over PostgreSQL for persistence, and PGlite as an embedded dev database
so the whole system runs from a clone with no external services. When it
is still the right choice is in [Choosing a runtime](./choosing.md).

Like every validated path, this blueprint is a living document: it
records what has worked in production so far, not decisions locked for
good. When a real constraint contradicts a rule here, the rule is the
part under review — only the contract core is fixed.

The bootstrap skill scaffolds this blueprint complete, with a working
example resource wired through every layer.

## Entry files

```
src/
  main.ts        service impl map, auth hook, Connect plugin, scheduled jobs
  server.ts      bootstrapServer(): fastify + env + cors + db + /healthz + shutdown
  config.ts      TypeBox schema for env config, exposed as server.config
  context.ts     createContextKey values: kRequestId, kUserId
  routes.ts      the few non-RPC routes (media upload, dev login)
```

`server.ts` exports a module-level Fastify singleton and a `bootstrapServer`
that registers config, CORS, the database plugin, a `/healthz` route, and
shutdown signal handlers, then hands control to a callback from `main.ts`.
Stores import the singleton for `server.db`, `server.log`, and
`server.config`, which keeps their signatures free of plumbing.

Config is a TypeBox schema loaded by `@fastify/env` with `dotenv: true`.
Every runtime setting has a typed default; nothing reads `process.env`
outside `config.ts`.

## handler → store → adapter

One resource occupies one directory in `src/core/` plus one handler file per
RPC in `src/handlers/`:

- **Handler** (`src/handlers/<slug>/createNote.ts`) validates that required
  request fields are present, reads identity from
  `context.values.get(kUserId)`, calls the store, and shapes the response
  with `create(<Rpc>ResponseSchema, {...})`. Handlers never import Drizzle.
  A handler that grows past twenty lines is a sign the logic belongs in the
  store.
- **Store** (`src/core/notes/store.ts`) holds the business logic: one async
  function per RPC, Drizzle queries, transactions via
  `server.db.transaction`, and `ConnectError` with a proper `Code` for every
  failure. Stores accept and return proto types, converting at the boundary
  through the adapter.
- **Adapter** (`src/core/notes/adapter.ts`) is the only file that knows both
  the proto message and the row. It exports the row types
  (`typeof table.$inferSelect`), `rowToProto`, `toInsert`, `toUpdate`, and
  enum bridges. Adapters are pure; they never perform I/O.

The wiring in `main.ts` builds a single object typed
`ServiceImpl<typeof AppService>`. Declaring an RPC in the proto and skipping
any of the handler, store, or wiring steps is a compile error, which turns
the four-step dance (proto, regenerate, handler, wiring) into something the
compiler enforces.

Write patterns worth naming (full recipes live in the skills references):

- **Read-modify-write with derived state** for updates: load the before-row
  inside the transaction, apply changes, recompute derived state, emit
  events, reload aggregates.
- **Load + replace for many-to-many children**: delete and re-insert join
  rows inside the transaction instead of diffing.
- **Aggregate loaders for lists**: batch child loads into
  `Map<parentId, child[]>` with `Promise.all`, keeping list queries
  O(parents).

## Database

The schema is one Drizzle file, `src/db/schema.ts`, and it is the only file
anyone edits to change the database. `pnpm db:generate` (drizzle-kit) emits
SQL migrations into `drizzle/`; review the SQL, hand-edit when the generator
guesses wrong, and commit both.

`src/db/config.ts` returns a `DbHandle` selected by `DATABASE_URL` scheme:

| Scheme | Backing | Used for |
|---|---|---|
| `pglite://<path>` | embedded PGlite, file-backed | dev default, zero setup |
| `pglite-memory://` | embedded PGlite, ephemeral | tests |
| `postgresql://...` | node-postgres pool | production |

All three expose a structurally identical Drizzle instance, so stores are
unaware of the backing. The database plugin migrates embedded databases on
boot, recovers from PGlite WASM aborts by wiping and re-initializing the dev
data dir, and seeds dev data idempotently.

**The sharp edge, stated plainly:** embedded databases migrate on boot;
production Postgres does not. Deploying a migration means running
`pnpm db:migrate` against the production database as an explicit step. If a
deploy ever fails with a missing column, this is why. (The Go blueprint
closes this gap with migrate-on-boot; the TypeScript backend keeps the manual
step until it grows an equivalent.)

## Auth

Session auth runs as a Fastify `onRequest` hook, in front of Connect:

- The interface sends `Authorization: Bearer <token>`. Tokens are random
  256-bit values, stored hashed (SHA-256), with expiry, revocation, and
  last-used tracking on the session row.
- The hook derives the RPC path prefix from the generated service type and
  requires a session for every RPC except an explicit public allowlist (the
  login RPC). Failures return 401 before any handler runs.
- Sign-in verifies a Google ID token against Google's JWKS (issuer, audience,
  `email_verified`) and upserts the user.
- Handlers read the authenticated user only from `kUserId` request context.
  A dev-only login route issues real sessions for seeded users in local
  environments.

## Jobs

Scheduled work runs in-process with `@fastify/schedule`: an interval job
handles reminders and periodic housekeeping. This is a single-process stack; a
separate worker binary is a future the entry-file split already accommodates
(`main.ts` today, `jobs.ts` when needed).

## Build and deploy

- **tsup** bundles `src/main.ts` to ESM for `node24`, minified, sourcemapped.
  Dev runs `tsx watch`.
- The **Dockerfile** builds from the monorepo root: install with
  `--ignore-scripts`, run `buf generate`, build the proto package, build the
  backend, then `pnpm deploy --prod` into a clean runner stage on
  `node:24-alpine`.
- The deploy target is a compose file behind a reverse proxy (Caddy), with
  Postgres as a sibling container. Images are tagged with the git SHA and
  pushed to a private registry.

## When this backend is the right one

When one language across the whole loop is worth more than one binary:
same language as the interface, the fastest iteration loop in the stack,
an embedded dev database with no equal in other runtimes, and every type
shared through the contract. Go is the default otherwise; the criteria
live in [Choosing a runtime](./choosing.md).
