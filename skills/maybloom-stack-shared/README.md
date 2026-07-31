# maybloom-stack-shared

Shared reference content for the maybloom-stack skill family. **Not a skill
on its own** — there is no `SKILL.md` here, so it never triggers from a
description match. The bootstrap, add-resource, extend-resource, and
add-rpc skills point at files under `references/` by relative path (`../maybloom-stack-shared/references/...` from a sibling skill).

## Files

- `references/gotchas.md` — sharp edges that bite repeatedly.
- `references/tx-patterns.md` — transaction shapes used across the
  backend, including the read-modify-write-with-derived-state recipe.
- `references/proto-conventions.md` — proto authoring rules that are
  specific to this stack (field-ID reuse policy, oneof/flatMap idiom,
  enum defaults, empty-string semantics).

## When to read which

- Any time you're about to run `pnpm db:generate`: skim `gotchas.md` for
  the Drizzle prompt section.
- Any time you're writing a multi-table mutation: read `tx-patterns.md`.
- Any time you're editing a `.proto`: skim `proto-conventions.md`.

The skills point at specific sections; you don't need to memorize the
files. Treat them like a man page.
