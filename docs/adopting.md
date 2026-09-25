---
title: Adopting the stack
description: Bringing an existing service onto the contract without a rewrite
order: 10
---

# Adopting the stack

Every skill in the family assumes a scaffolded start: a monorepo the
bootstrap laid down, a contract that existed before the first handler.
Most systems that would benefit from the stack already exist, and they
have a REST API, hand-written DTOs, a UI that reads them, and users who
will not tolerate a rewrite.

This document is the migration path, written down as one Go service walked
it: OCF IMS, an incident-management server with a fifteen-year lineage,
brought onto the contract in slices over three weeks with its behaviour
preserved throughout. Nothing here depends on it being Go; the sequence is
the point.

## The sequence

**Contract first, restructure second, extract third, delete fourth.** Each
step is behaviour-preserving on its own and gated before the next begins.

### 1. Write the contract from the running system

Model every DTO and every route as protos before touching a line of server
code. The output is a mapping table with one row per REST route and one of
three dispositions for each:

- **an RPC**, named for the verb the route performs;
- **a plain-HTTP exception**, documented beside the contract: blob upload
  and download, server push, anything a browser API cannot do over an RPC;
- **retiring, not modelled**: a subsystem slated for deletion. Forcing it
  into either other bucket is a lie, and modelling a DTO is not free, since
  it invites new code to depend on it.

The gate is zero unclassified routes. Things the mapping turns up every
time:

- **One `POST` hides several verbs.** A handler that dispatches on body
  selector fields (`id == 0` means create, `approved` means approve) is a
  systematic 1→N map onto RPCs, and finding them is a repeatable audit:
  grep each write handler for its selector `switch`. OCF IMS's admin
  surface went from 49 RPCs on the first cut to 58 on the second.
- **Endpoint-shaped DTOs are not resources.** A brownfield DTO mixes stored
  state, viewer-dependent decorations and derived flags in one struct. The
  proto separates them: the resource holds state, the response envelope
  holds what is computed per caller, and a flag about a *member* of a
  resource (this person has access) stays on the resource as output-only,
  while a flag about the *caller* (you may append here) goes on the
  response. Some DTOs turn out to be pure service surface with no resource
  behind them at all; the auth and profile shapes usually do.
- **The URL's natural key is not the contract's key.** REST addressed
  events by name; the contract carries the surrogate id, rename-stable and
  unambiguous, with the name as a read-only display field. The ported
  client pays a name→id resolution it did not have before.
- **Closed string enums become proto enums**, with the string↔number
  mapping a server concern. A stored small integer keeps its values as the
  enum numbers. Same construct, two relationships to storage.
- **Every epoch-number timestamp is a conversion to pay**, one per field.
  Cheap before a client exists, expensive after.

Generate, and compile against the generated code on every target from day
one. A generated TypeScript tree that nothing compiles against is not
verified whatever CI says; OCF IMS carried dangling imports in its TS
output for two weeks because only the Go target had a consumer.

### 2. Retire the transport risk, then restructure

Before the big move, spend an afternoon on a throwaway spike on the tree as
it is: one hand-written RPC embedding the generated `Unimplemented` handler,
one interceptor, registered on the existing mux beside the REST routes, one
test through the generated client. It proves the transport and the
interceptor plumbing on *this* server, cheaply, where a surprise is an
afternoon rather than a tangle inside a restructure diff. Then revert it.

The restructure is mechanical: move the module to `go/`, the entry point to
`go/cmd/<service>`, and the handler files to their future homes, whole
files, no logic moved. Three walls the "package by feature" advice does not
mention:

- **The server↔domain cycle.** The mux wiring imports every domain, and the
  domains need shared plumbing; neither can hold the other. A leaf
  `internal/server` package that imports no domain, plus a separate wiring
  package, resolves it.
- **Unexported fields set across packages.** Wiring that built handlers
  with positional struct literals stops compiling once the handlers live in
  another package. Export the fields and key the literals.
- **The call graph bounds the split.** Draw the symbol dependencies between
  handler files first. A mutually recursive cluster becomes one package; a
  clean DAG splits finely. Splitting a cluster further means hoisting
  shared helpers, which is extraction work and belongs in the next step.

Gate: identical build, test and run behaviour from the new location. On a
branch, and if the gate resists, abandon the branch; nothing but paths
changed.

### 3. Extract, one RPC at a time

Land the interceptor spine first, as the Go document describes, with the
service struct embedding the generated `Unimplemented<Service>Handler` so
the other fifty-nine RPCs answer `unimplemented` until they arrive. That
embedding is a scaffold, not a pattern: the exit gate of this step is a
grep that fails the build while it exists, and removing it is what turns
the compiler into the checklist.

Then, per RPC: one transport-agnostic domain function that authorizes from
the identity in the context and returns proto messages speaking Connect
codes; the RPC method a one-line delegate; the REST route **deleted**. Not
shimmed: keeping the old route alive over the new function costs a
converter per resource that is throwaway by construction. OCF IMS kept a
shim for exactly one RPC before choosing deletion.

What extraction finds, per resource:

- **Contract gaps.** A query parameter the REST route honoured and the
  proto lacks. Add the field, non-breaking; never smuggle it past the
  contract.
- **The tests move before the writes do.** Extracting a read while its
  sibling writes are still REST forces a proto↔JSON bridge in the test
  helpers so the existing assertions keep working. The bridge dies when
  the writes move. Sequence the plural read before the writes so a direct
  row→proto mapper can replace the old JSON assembler once.
- **A dependency bundle per domain.** Free functions taking seven
  dependencies are the outlier; a `Service` struct per domain with the
  RPCs as methods matches the idiom the REST handlers already had. Do it
  once, early.
- **Errors get read twice.** The faithful port carries `409` into the
  nearest code; the second reading picks the honest one (`AlreadyExists`
  versus `FailedPrecondition`), turns "unknown id" from a 500 into
  `NotFound`, and finds the sites where a wrapped driver error reached the
  wire. A mixed error vocabulary during the port has one real hazard: a
  typed-nil pointer to the old error type, returned through an `error`
  interface, is non-nil. Call the old helpers into a variable of their own
  type and map explicitly; never `return helper()` from an `error`
  function.
- **Privacy rules gate writes as well as reads**, and belong in one helper
  that every path calls after the permission check, so a plain denial stays
  a denial and an invisible resource stays `NotFound`.

Gate: every RPC in the contract has a method, the embedding is gone, and
the REST surface is down to the documented exceptions.

### 4. Replace the client, then delete

With the server speaking the contract, the client is built new against the
generated code rather than ported. OCF IMS's threshold for deleting its
legacy UI is a written list of what people rely on, made during the client
build, rather than screen parity, because the replacement is a redesign and
some screens will never have a counterpart.

## What it costs, stated plainly

- **Time.** Three weeks of slices for sixty RPCs, with a review round
  between extraction and the client. The review is where the transport-tier
  problems (errors, validation, bounds on reads) surfaced; they repeated
  across every slice, which is how they were recognised as one gap rather
  than sixty bugs.
- **A second reading of everything.** The faithful port is the safe move
  and the wrong end state; each slice ends by finishing the port in the new
  vocabulary.
- **Stacked pull requests need a discipline.** After the bottom of a stack
  squash-merges, the rest still carries the lower commits; `git rebase
  --onto` replays cleanly when the fork point is identical. And CI that
  triggers only for the default base branch shows a result on the bottom
  PR alone, so the stack's real gate is the local verification protocol.

## Findings flow upstream

The adopting project keeps a findings log: for each slice, what the
blueprint claimed, what happened, and whether the difference is a stack
defect, a documented variant, or a repo quirk. Entries are written as the
slice lands, never from memory afterwards. That log is where this document
and the Go blueprint's second version came from, and it is how the next
adopting project will change them again.
