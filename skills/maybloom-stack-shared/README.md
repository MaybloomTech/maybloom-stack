# maybloom-stack-shared

Shared reference content for the maybloom-stack skill family. **Not a skill
on its own** — there is no `SKILL.md` here, so it never triggers from a
description match. The bootstrap, add-resource, extend-resource, and
add-rpc skills point at files under `references/` by relative path (`../maybloom-stack-shared/references/...` from a sibling skill).

The directory has two halves. Files at the top of `references/` are
**cross-cutting**: true on every implementation. Directories under
`references/paths/` are **paths**: one per leaf of the
[skill tree](../../docs/assets/skill-tree.svg), each entered through its
`README.md`. Skills are tasks and stay path-neutral; they branch to a path
directory at the point of use.

## Cross-cutting

- `references/core.md` — what the stack *is* (the proto + Connect-RPC
  contract and the rules that bind every implementation) separated from
  what it merely defaults to, plus the open-path protocol for working
  with client or server technologies the skill family doesn't blueprint.
- `references/gotchas.md` — sharp edges that bite repeatedly.
- `references/tx-patterns.md` — transaction shapes used across the
  backend, including the read-modify-write-with-derived-state recipe.
- `references/proto-conventions.md` — proto authoring rules that are
  specific to this stack (field-ID reuse policy, oneof/flatMap idiom,
  enum defaults, empty-string semantics).

## Paths

- `references/paths/backend-typescript/` — the default server: Fastify,
  Drizzle, PGlite. `README.md` carries detection, the layer map, and
  verification; one file per layer beside it (`schema.md`, `adapter.md`,
  `store.md`, `handlers.md`, `wiring.md`).
- `references/paths/backend-go/` — the Go server: how each pipeline layer
  (migration, queries, adapter, store, handlers, wiring) is implemented in
  a connect-go + sqlc + pgx service, and what stays identical to the
  TypeScript path.
- `references/paths/client-expo/` — the Expo interface: the api → queries
  → screen tiers and the file layout behind them.
- `references/paths/client-astro/` — static sites, including how a page
  can be built *from* the contract at build time without ever calling a
  service at runtime.

A path directory and its leaf move together: `scripts/check-skill-tree.py`
fails when one exists without the other. See `../README.md` for the rule.

## When to read which

- Any time you're about to run `pnpm db:generate`: skim `gotchas.md` for
  the Drizzle prompt section.
- Any time you're writing a multi-table mutation: read `tx-patterns.md`.
- Any time you're editing a `.proto`: skim `proto-conventions.md`.
- Before any backend layer work: read the `README.md` of the path the
  service is on — `paths/backend-go/` when the repo has `go/` with
  `sqlc.yaml`, `paths/backend-typescript/` when it has `packages/backend/`
  with `drizzle.config.ts`.
- Any time the project's client or server isn't one of the validated
  implementations, or the user brings their own framework or code
  sources: read `core.md` first — it says which rules still bind and
  how to proceed.

The skills point at specific sections; you don't need to memorize the
files. Treat them like a man page.
