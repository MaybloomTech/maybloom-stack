---
title: Overview
description: What the maybloom stack is and the principles behind it
order: 1
---

# Overview

The maybloom stack is a way of building a small product system as a single
monorepo with a schema-first spine. A Protocol Buffers contract defines every
type that crosses a boundary. Code generation produces the transport layer in
whichever language a service is written in, and the same generated types reach
the client. Humans write the three layers in the middle: handlers, stores, and
adapters.

It was extracted from a working production system, where it runs today as a
Fastify backend, an Expo interface, and static Astro sites in one pnpm
workspace. This document set generalizes it, adds a Go backend blueprint as a
peer of the TypeScript one, and defines when to reach for each runtime.

## The core and the paths

The stack has a small core and an expanding set of paths.

The **core** is the contract: every type that crosses a process boundary is
defined in Protocol Buffers, served over Connect-RPC, and generated into
whichever languages the system speaks. That one decision is what the stack
actually *is*. It means a client knows, from generated code alone, every
resource, every RPC, and every field at its disposal when talking to a
service. It means a backend and a client evolve in one monorepo, in one
change, with wire compatibility governed by written rules instead of
memory. And it means the implementation on either side of the wire is
genuinely replaceable — Connect has official implementations in several
languages and speaks gRPC and gRPC-Web besides, so any of them can serve
or consume the same contract.

The **paths** are the implementations this document set describes in depth:
a TypeScript backend on Fastify, a Go backend on connect-go, an Expo
interface, static Astro sites. They are validated paths — documented
because each has been built and run for real, not because it is required.
The defaults are defaults of experience, and the set grows like a skill
tree: a new language or framework joins the documented stack when someone
walks it far enough to write down what works. Until then it is an open
path — permitted, supported by the core, just not yet blueprinted.
[Choosing a runtime](./choosing.md) covers the validated paths; its last
section covers the open ones.

![The maybloom skill tree: the contract at the root with two limbs, servers and clients; validated paths lit green — TypeScript (the default), Expo shipping to iOS, Android and web, Astro for static surfaces; Go amber and validating; kotlin, python and swiftui waiting as dashed open paths](./assets/skill-tree.svg)

Even inside a validated path, the decisions are not locked. The
blueprints record the current best answer — still experimental, revised
as the systems they describe meet new constraints and integrate new
technologies — and only the core holds still while they move. Expect
these documents to keep changing; that is the stack working as intended.

## The pipeline

Every feature moves through the same pipeline, and each stage has exactly one
home:

```
proto  →  schema  →  adapter  →  store  →  handlers  →  wiring
                                                          ↓
                                                api / queries / screen
```

- **proto** — the contract. Resource messages, request/response envelopes, and
  the service definition. See [Contracts](./contracts.md).
- **schema** — the database definition. Drizzle TypeScript on the Fastify
  backend, SQL migration files on the Go backend. Both generate the data layer
  from a single authoritative artifact.
- **adapter** — pure functions that translate between proto messages and
  database rows. The only layer that knows both shapes.
- **store** — business logic and transactions. Stores speak proto types
  outward and rows inward.
- **handlers** — one thin function per RPC: validate presence, read identity
  from request context, call the store, shape the response.
- **wiring** — the service implementation object registered with Connect. The
  compiler refuses to build until every RPC in the proto has a handler.
- **api / queries / screen** — the interface mirror: typed client wrappers,
  React Query hooks, and screens. See [Interface](./interface.md).

## Principles

1. **The contract is the spine.** Everything that crosses a process boundary
   is defined in proto and generated with Buf. Adding a field or an RPC starts
   in the contract, always.

2. **Generated edges, hand-written middle.** Codegen owns the layers that are
   mechanical: wire types, service scaffolding, the SQL data layer. People own
   the layers that carry judgment: adapters, stores, handlers. Generated code
   is never committed; it is rebuilt from source on install.

3. **One source of truth per layer.** Proto files for the wire. One schema
   artifact for the database. One service definition per backend. Drift is a
   build failure, never a code-review catch.

4. **The compiler is the checklist.** The service implementation object is
   typed exhaustively, so a declared RPC without a handler is a compile error.
   sqlc and Drizzle type their queries, so a schema change breaks the build
   before it breaks a request.

5. **Boring dependencies, few of them.** Fastify plugins and the Node stdlib
   on one side; the Go stdlib with a short list of focused libraries on the
   other. Every dependency should be explainable in one sentence.

6. **Single-process honesty.** The stack targets one box: a homelab, a small
   VPS, a container behind Caddy. In-memory caches, in-process schedulers, and
   embedded dev databases are correct choices at this scale, and the docs say
   so out loud instead of pretending to be a distributed system.

7. **Documentation an agent can execute.** The stack ships as agent skills
   that scaffold a new monorepo and add resources end-to-end. The skills, these
   docs, and the reference implementation are kept consistent on purpose. See
   [Skills](./skills.md).

## Monorepo shape

```
<repo>/
  proto/<slug>/            hand-written contracts (the only proto source)
    common/v1/               shared value types
    resources/v1/            domain resources, no RPCs
    service/v1/              request/response envelopes + the app service
  packages/                TypeScript workspace packages
    protocol-buffers/        generated TS (gitignored src/, built on install)
    backend/                 Fastify + Connect-RPC + Drizzle
    interface/               Expo Router + React Query
    <name>-site/             Astro sites, one package per site
  go/                      the Go module (one per repo), when a Go service exists
    cmd/<service>/           one main package per binary
    internal/                server, store, postgres packages
    gen/                     generated Go from buf (gitignored)
    db/                      migrations/ and queries/, the SQL sources of truth
  skills/                  the agent skills that scaffold and extend the stack
  buf.yaml, buf.gen.yaml   contract toolchain, at the root
  pnpm-workspace.yaml      workspace + version catalog
  biome.json               one linter/formatter for all TypeScript
  infra/                   compose + reverse proxy for the deploy target
```

Naming that the stack treats as vocabulary, everywhere:

- The client package is the **interface** — the stack's word for the human
  side of the system, chosen over "frontend" because the client is not a
  front to the backend. Projects adopting the stack may keep their own
  name for it; these docs use interface throughout.
- Backend layers are **handler → store → adapter**, and files live where the
  skills expect them: `src/handlers/`, `src/core/<resource>/store.ts`,
  `src/core/<resource>/adapter.ts` in TypeScript; `internal/server/`,
  `internal/store/` in Go.
- Resources are PascalCase singular in protos (`Note`), camelCase plural in
  tables and collections (`notes`).

## What the stack is for

A two-person team building a real product with a long life: seasonal software,
tended like a garden. It optimizes for a fast dev loop (clone, install, run,
no external services), for changes that touch one layer at a time, and for a
future where a service can be rewritten in another language without touching
the contract or the interface.

If you need a distributed system, multi-region deploys, or a big-team
workflow, this stack will fit badly, and that is by design.
