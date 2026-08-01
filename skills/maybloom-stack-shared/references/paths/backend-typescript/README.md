# The TypeScript backend path

The stack's default server: Fastify with the Connect-RPC plugin, Drizzle
over Postgres, PGlite as the embedded dev database, tsx in watch mode.
The contract, the layer vocabulary (handler → store → adapter), and the
client are identical to every other server path — a generated client
cannot tell which language answered it. This directory holds the
per-layer patterns, so the skills that walk the pipeline can do so
without reading any external codebase.

Default does not mean required. Where a project has deliberately
deviated, imitate the project and keep only the rules in
`../../core.md`.

## Detecting a TypeScript backend

A `packages/backend/` directory with `drizzle.config.ts` beside it.
Layout:

```
packages/backend/
  src/
    main.ts               service implementation object + server start
    server.ts             Fastify instance, plugins, interceptors
    config.ts             environment parsing, typed
    db/
      schema.ts           Drizzle tables: the schema source of truth
      plugin.ts           pool/PGlite wiring as a Fastify plugin
    core/<resources>/
      store.ts            business logic and transactions
      adapter.ts          proto ↔ row translation
    handlers/             one file per RPC
  drizzle.config.ts
```

If both `packages/backend/` and `go/` exist, ask the user which service
owns the work — backend choice is per-service, never per-RPC.

## Layer map

| Step | Where it lives | Pattern |
|---|---|---|
| Proto | `proto/<APP_SLUG>/...` | shared with every path; `../../proto-conventions.md` |
| Codegen | `pnpm proto:gen` (buf) | generated output is never committed |
| Schema + migration | `src/db/schema.ts`, then drizzle-kit | [`schema.md`](./schema.md) |
| Adapter | `src/core/<resources>/adapter.ts` | [`adapter.md`](./adapter.md) |
| Store | `src/core/<resources>/store.ts` | [`store.md`](./store.md) |
| Handlers | `src/handlers/<method>.ts`, one file per RPC | [`handlers.md`](./handlers.md) |
| Wiring | the service implementation object in `src/main.ts` | [`wiring.md`](./wiring.md) |
| Client | whichever client path the repo carries | `../client-expo/`, `../client-astro/` |

Read the file for the layer you are working on, then write the code.
Don't skip ahead: later layers use types from earlier ones, and writing a
handler before its proto exists produces import errors that mask the real
shape mismatch.

## What makes this path distinct

- **The compiler is the checklist.** The service implementation object in
  `main.ts` is typed against the generated service type, so it refuses to
  build until every declared RPC has a handler. There is no registry to
  keep in sync by hand — the wiring step exists precisely because this
  path can enforce exhaustiveness there.
- **One language across the whole loop.** The person editing a store, a
  handler, and the screen that calls it stays in TypeScript, with the
  contract generating both ends.
- **A real Postgres in-process.** PGlite means clone, install, run — no
  container required for development or for tests.

## Verification before claiming done

- `pnpm typecheck` passes at the repo root, not just in `packages/backend`.
- The backend boots and logs its routes; the new RPCs appear.
- One RPC per new surface is exercised for real (a request, or a test that
  goes through the handler), not merely compiled.
- Generated output is absent from git status; only hand-written files are
  staged.

## Gotchas

Drizzle's interactive rename prompt and the proto field-number policy live
in `../../gotchas.md`. Transaction shapes — load + replace for M:N
children, read-modify-write with derived state — live in
`../../tx-patterns.md`, and they are ordering rules rather than Drizzle
rules, so they hold on every path.
