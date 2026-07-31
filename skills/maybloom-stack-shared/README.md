# maybloom-stack-shared

Shared reference content for the maybloom-stack skill family. **Not a skill
on its own** — there is no `SKILL.md` here, so it never triggers from a
description match. The bootstrap, add-resource, extend-resource, and
add-rpc skills point at files under `references/` by relative path (`../maybloom-stack-shared/references/...` from a sibling skill).

## Files

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
- `references/backend-go.md` — the Go backend path: how each pipeline
  layer (migration, queries, adapter, store, handlers, wiring) is
  implemented in a connect-go + sqlc + pgx service, and what stays
  identical to the TypeScript path.

## When to read which

- Any time you're about to run `pnpm db:generate`: skim `gotchas.md` for
  the Drizzle prompt section.
- Any time you're writing a multi-table mutation: read `tx-patterns.md`.
- Any time you're editing a `.proto`: skim `proto-conventions.md`.
- Any time the target service is Go (the repo has `go/` with
  `sqlc.yaml`): read `backend-go.md` before any backend layer work.
- Any time the project's client or server isn't one of the validated
  implementations, or the user brings their own framework or code
  sources: read `core.md` first — it says which rules still bind and
  how to proceed.

The skills point at specific sections; you don't need to memorize the
files. Treat them like a man page.
