---
title: Choosing a runtime
description: When Fastify, when Go, when Astro
order: 7
---

# Choosing a runtime

The stack has three places code can run, and the choice is usually obvious
once the workload is named honestly. Start from the first question that
applies.

## The short version

| Workload | Runtime |
|---|---|
| Public content known at build time | Astro site |
| Product CRUD the interface talks to | TypeScript backend (Fastify) |
| Daemons, ingestion, concurrency, constrained hardware | Go backend |

## Astro: is it content?

If every visitor sees the same thing and the content changes when someone
commits, it is a site. Marketing pages, documentation, writing, a public
face for the product. Sites build to static files, deploy as nginx
containers, and cost nearly nothing to run or to keep secure.

The boundary is sharp on purpose: the moment a page wants per-user state,
auth, or live data, it stops being a site. Resist the temptation to sprinkle
API calls into a site; that need is the signal a backend service and an
interface screen exist for.

## Fastify: is it the product?

The TypeScript backend is the default for application logic, and the word
default is doing real work: choose it unless a specific pressure pushes to
Go. What it buys:

- **One language across the whole loop.** The person editing a store, a
  handler, and the screen that calls it stays in TypeScript, with the
  contract generating both ends.
- **The best dev database in the business.** PGlite gives a real Postgres
  embedded in-process: clone, install, run. No other runtime matches this
  today.
- **Iteration speed.** tsx watch, one process, seeded dev data, and a
  type error anywhere in the pipeline stops the build.

CRUD over Postgres, session auth, media upload, scheduled reminders, the
occasional fan-out: all of this is comfortably inside Fastify's envelope on
a single box.

## Go: does the runtime matter?

Choose Go when the workload's shape, rather than its logic, is the hard
part. Concrete signals, any one of which is sufficient:

- **It runs forever and must sip resources.** Sensor ingestion polling a
  hardware API every minute, an MQTT consumer, a webhook receiver on the LAN.
  A static binary with a few dozen megabytes of RSS, deployed once and
  forgotten, is Go's home turf.
- **Concurrency is the feature.** Fanning out to many devices or APIs at
  once, streaming aggregation, backpressure. Goroutines and errgroup model
  this more directly than a Node event loop.
- **The hardware is small.** A service destined for a Pi or a
  low-power box benefits from Go's footprint and instant start.
- **The service is being ported from Go.** An existing Go system joining
  the stack keeps its language and adopts the contract, the layer
  discipline, and the tooling.
- **Deploy simplicity is worth more than iteration speed.** One
  self-contained binary with embedded migrations, no node_modules, no
  runtime image beyond a base layer.

The costs, stated plainly: a second toolchain in the repo, a second set of
idioms to hold, and a dev database story (embedded-postgres) that is good
rather than magical. A team of two should pay these costs for a workload
that earns them, and the moment it does, the contract makes the payment
small.

## The rule that makes the choice cheap

**One proto service package, one backend.** The interface never knows which
language serves a call; it holds a generated client per service, and the
transport is identical. This means:

- Backend choice is per-service, made at the boundary of a bounded context
  (the app service, an ingest service, a reports service), never per-RPC.
- A service can be rewritten in the other language RPC-by-RPC behind its
  unchanged contract, with the old and new implementations run side by side
  during the swap.
- Adding a Go service to a TypeScript repo (or the reverse) leaves the
  contract layer alone: a new service package under `proto/<slug>/`, a
  plugin block in `buf.gen.yaml`, the service's own directory. What else
  moves is below, under *When one service becomes two*.

## Signals the choice was wrong

- An Astro site is fetching from a backend at runtime: promote that page to
  the interface, or accept it is an app.
- A Fastify service spends its life in `Promise.all` batches babysitting
  CPU-bound or fan-out work, or its container restarts for memory: that
  service is asking to be Go.
- A Go service is churning weekly with product CRUD changes that mirror
  interface work item-for-item: it is paying Go's iteration cost for a
  Fastify-shaped job.
- Anything is being built "in both languages to compare": the contract
  already guarantees the swap is possible later; build it once, in the
  default.

## When one service becomes two

Everything above assumes what the scaffold builds: one repo, one backend,
one contract, one docs site. That assumption is load-bearing in more places
than it looks, and it is cheaper to know which ones before a second service
arrives than during.

**The seam that holds.** The proto service is the unit, and it was chosen
for this: a second backend gets its own service package under
`proto/<slug>/`, shares `resources/v1` and `common/v1`, and the interface
holds a second generated client over the same transport. The contract layer
does not change shape. Each backend still keys its exhaustiveness check off
one service type, which is the property that makes the split safe rather
than merely possible.

**What the second service pays.** The scaffold names things in the singular
because the first service has no reason to carry a scheme for a second —
the same rule that keeps a type out of `common/v1` until it has two
consumers. So the cost lands on the service that arrives second:

- `packages/backend` needs a name, which forces a naming scheme on both of
  them. The root `package.json` passthroughs (`dev:backend`,
  `docker:backend:*`) follow it.
- The interface exports one client over one `baseUrl`. A second service is a
  second transport and a second URL in the environment.
- TypeScript output stays one `protocol-buffers` package for the whole repo,
  so every client generates the entire contract surface rather than the part
  it calls. That is fine at two services and is the first thing to revisit
  if it reaches several.
- The docs site picks up the new service without being asked: it filters on
  the repo's proto package prefix, so a second service lands on the same
  page. That is either exactly right or the earliest signal the team has
  outgrown one site.

**What the stack has no answer for yet.** Stated as open rather than
filled in, because none of it has been run:

- *One database, or one per service.* The compose file runs a single
  Postgres, and in a mixed repo two different migration tools would point
  at it. Two services owning tables in one schema is a coupling the
  contract cannot protect. `maybloom-stack-bootstrap-go` asks about this at
  interview time and prefers separate schemas or separate databases, but
  that is a default, not a documented outcome.
- *How Go packages a second service.* The layout in
  [Overview](./overview.md) is one module per repo with a `cmd/` per binary.
  It is a reasonable default and an untested one: a module per service buys
  independent dependency graphs and costs a shared `gen/` tree and a
  `go.work` file. Answer this by building it, not by reasoning about it.
- *When docs and sites should split by team.* A per-team documentation site
  is already cheap — another site package reading a different package
  prefix — but nothing here knows when that is an improvement rather than
  four sites nobody reads. Ownership splitting horizontally, across
  services rather than across layers, is the condition to watch for.

The honest position: the two-service shape is blueprinted, not walked.
Treat this section the way *Open paths* below treats languages — the rules
hold, and the first project to go through it writes down what it actually
cost.

## Open paths

The runtimes above are the validated paths — documented because they have
been built and run for real. They are not the boundary of the stack. The
core travels further: Connect has official implementations for Go,
TypeScript/JavaScript, Swift, and Kotlin, with more maturing, and a
Connect server also speaks gRPC and gRPC-Web, so any language with gRPC
support can join the contract. A SwiftUI client, a Kotlin service, a
Python worker — each consumes the same protos and looks, to the rest of
the system, exactly like a validated implementation.

Choosing an open path means carrying the core and writing the blueprint
as you go: the contract rules from [Contracts](./contracts.md), the layer
vocabulary (a thin transport seam, business logic behind it, pure
translation between wire shapes and stored shapes), and generated edges
that are never committed. The skills support this explicitly — on an
implementation these docs don't blueprint, they fall back to a
language-neutral core reference and take the project's existing code as
the exemplar to imitate.

A path stops being open the day it has been walked far enough to
document; that is how the stack grows. The Go backend is partway through
that passage — blueprinted from study, awaiting its first production
service — and the next path will enter the same way.
