# The core

What the maybloom stack *is*, separated from what it merely defaults to.
Read this file when a project uses an implementation the skill family
doesn't blueprint — a client that isn't the Expo interface, a server that
isn't Fastify or connect-go — or whenever you need to know which rules
bind and which are preferences the user may override.

Sections: The one decision · Core rules (any implementation) · The layer
vocabulary, language-neutral · The open-path protocol · Core vs default,
stated plainly.

## The one decision

Every type that crosses a process boundary is defined in Protocol
Buffers, served over Connect-RPC, and generated into whichever languages
the system speaks. Everything else in the stack radiates from this:

- A client knows, from generated code alone, every resource, RPC, and
  field at its disposal when talking to a service — no OpenAPI drift, no
  hand-maintained types.
- Backend and client evolve together in one monorepo, in one change,
  with backwards compatibility governed by written field-number rules.
- The implementation on either side of the wire is replaceable. Connect
  has official implementations for Go, TypeScript/JavaScript, Swift,
  Kotlin, Python, Dart and Rust, at varying maturity — and a Connect
  server also speaks gRPC and gRPC-Web, so any language with gRPC
  support can join the contract.

A project that keeps this decision and swaps everything else is still on
the stack. A project that keeps Fastify and Expo but hand-writes its API
types is not.

## Core rules (any implementation)

These bind every client and server regardless of language or framework:

1. **Protos are the only hand-written source for boundary types.** They
   live in `proto/<slug>/` at the repo root (resources, service
   envelopes, common types), and codegen runs through Buf. The full
   authoring conventions — request/response envelopes per RPC, the
   standard resource tail, `optional` presence semantics,
   `<NAME>_UNSPECIFIED` enums, the field-number reuse-vs-reserve policy —
   are in `proto-conventions.md` in this directory. They are contract
   rules, not TypeScript rules.
2. **Generated code is never committed.** Each language target gets a
   plugin block in `buf.gen.yaml` and a gitignored output directory;
   install/build regenerates. There is no "did you regenerate?" review
   comment on this stack.
3. **One `service` block per backend**, named `<AppName>Service`, in its
   own proto package. The unit of implementation choice is the service,
   never the RPC.
4. **Unary RPCs only.** The validated client uses the web transport on
   React Native, which streaming would break — and unary keeps every
   open-path client trivial too. Streaming is a stack-wide decision, not
   a per-endpoint one.
5. **Exhaustiveness comes from the generated service type** wherever the
   language offers it (a typed implementation map, a generated handler
   interface). If the user's language can't enforce it at compile time,
   add the check the idiom allows (a test that walks the service
   descriptor) rather than trusting memory.

## The layer vocabulary, language-neutral

The stack names its layers so that a change touches one of them at a
time. The names are vocabulary, not APIs — map them into the idiom of
whatever framework the project uses, but keep the seams.

**Server side:**

- **Handler** — the transport seam. One thin unit per RPC: validate
  presence, read identity from request context (put there by
  cross-cutting middleware declared once, not per route), call the
  store, shape the response. If it grows past ~20 lines, logic is
  leaking in.
- **Store** — business logic and transactions. Accepts and returns proto
  messages; speaks the RPC error model (Connect codes) directly; owns
  multi-step mutations inside a transaction helper. The recurring
  transaction shapes in `tx-patterns.md` are ordering rules, not
  Drizzle rules.
- **Adapter** — pure translation between proto messages and stored
  rows. The only place both shapes are known; no I/O; handles the
  empty-string/NULL boundary and timestamp conversion.
- **Schema** — one authoritative artifact per service (a schema DSL, SQL
  migrations — whatever the path validates) from which the data layer is
  generated or typed.

**Client side:**

- **api** — thin typed wrappers over the generated client, one module
  per resource. This tier exists so screens never import generated
  types directly.
- **queries/mutations** — a server-state cache layer (React Query in the
  validated path; whatever the framework's equivalent is) keyed
  per-resource, with list keys and item keys distinct so invalidation
  can be precise.
- **screens** — UI on top. Never talks to the wire directly.

"Interface" is the stack's word for the client package; a project may
call it something else. The tiers matter, the names don't.

## The open-path protocol

When the user wants an implementation with no validated reference (a
Flutter client, a Rust or Kotlin service, a Python worker, a different
web framework), don't refuse and don't force the defaults. Proceed:

1. **Establish the Connect story.** Check whether the language has an
   official Connect implementation; if not, gRPC or gRPC-Web support
   reaches a Connect server just as well. Wire the language's plugin
   into `buf.gen.yaml` with a gitignored output directory. Where an
   implementation's own docs recommend committing generated code — as
   connect-rust's does — rule 2 wins: find its build-time codegen path
   instead (for Rust, `connectrpc-build` driven from a `build.rs`).
2. **Find the exemplar.** Ask the user for code sources they like — an
   existing repo, a style they want to keep. On a validated path the
   per-layer references are the exemplar; on an open path the user's own
   code is. Imitate its idiom (naming, layout, error style, DI) for
   everything the core doesn't govern.
3. **Map the vocabulary.** Locate where handler/store/adapter (server)
   or api/cache/screens (client) land in their framework, and keep the
   tiers separate even when the framework would happily collapse them.
4. **Enforce only the core.** The five rules above and the contract
   conventions. Everything else is the user's call; offer the validated
   path's answer as a suggestion when they have no preference, never as
   a correction when they do.
5. **Record the preferences.** When the user states or demonstrates a
   choice, suggest writing it into the project's `CLAUDE.md` (a short
   "stack choices" section: languages, frameworks, naming, exemplar
   repos) so future sessions inherit the decision instead of re-asking.
6. **Graduate the path.** Once a few resources exist and the patterns
   have settled, offer to distill them into a reference file in the
   project — the open-path equivalent of `backend-go.md`. That is how a
   walked path becomes a validated one.

## Core vs default, stated plainly

| | Core (binds every project) | Validated default (swap freely) |
|---|---|---|
| Contract | proto + Buf + Connect-RPC, conventions in `proto-conventions.md` | — |
| Server | handler/store/adapter seams, generated edges, unary | Fastify + Drizzle + PGlite; or connect-go + sqlc + pgx |
| Client | generated client + api/cache/screens tiers | Expo Router + React Query |
| Monorepo | contract at the root, consumed by every package | pnpm workspace, biome, the catalog |
| Naming | one service per backend; resources PascalCase singular in proto | "interface", file layout, camelCase plural tables |

The right-hand column is not just swappable — it is experimental. The
validated defaults record what has worked so far and keep changing as the
paths are walked further; treat them as the strongest available
suggestion, never as law. When the project or its user has a settled
different answer — an existing convention, a discovered constraint, a
stated preference — the different answer wins, on validated paths exactly
as on open ones. Suggest recording the deviation in the project's
`CLAUDE.md` the same way open-path choices are recorded, so it reads as a
decision rather than drift.

When in doubt, ask: does breaking this rule change what crosses the wire,
or only how one side is built? The wire is core. The sides are paths.
